import Users from '../models/Users.js';
import BuddyPair from '../models/BuddyPair.js';
import BuddyWorkout from '../models/BuddyWorkout.js';
import WeeklyGoal from '../models/WeeklyGoal.js';
import BuddyChallenge from '../models/BuddyChallenge.js';
import CalorieTracker from '../models/CalorieTracker.js';
import CalorieIntake from '../models/CalorieIntake.js';
import Workout from '../models/Workout.js';
import WorkoutModel from '../models/WorkoutModel.js';
import ActiveWorkoutModelSession from '../models/ActiveWorkoutModelSession.js';
import WMCompletionHistory from '../models/WMCompletionHistory.js';
import UserFitness from '../models/UserFitness.js';
import StepTracker from '../models/StepTracker.js';
import ChatMessage from '../models/ChatMessage.js';
import Habit from '../models/Habit.js';
import WidgetConfig from '../models/WidgetConfig.js';
import NotificationPreference from '../models/NotificationPreference.js';
import NotificationEvent from '../models/NotificationEvent.js';
import ModerationReport from '../models/ModerationReport.js';
import { buildPerformanceSummary } from '../services/performanceService.js';
import {
  getProofDownloadStream,
  uploadProofToGridFS,
  deleteProofFromGridFS,
} from '../config/gridfs.js';
import mongoose from 'mongoose';

const ALLOWED_STAKES = [
  '1 Dinner',
  '$10',
  '1 Chore',
  'Romantic Favor 😉',
];

const DEFAULT_WEEKLY_GOAL = 3;
const DEFAULT_WEEKLY_STAKE = '1 Dinner';

const PREDEFINED_GOOD_HABITS = [
  'Drink 8 glasses of water',
  'Walk 30 minutes',
  'Read for 20 minutes',
  'Stretch in the morning',
  'Sleep before 11 PM',
];

const PREDEFINED_BAD_HABITS = [
  'Late-night scrolling',
  'Sugary drinks',
  'Skipping meals',
  'Smoking',
  'Excessive junk food',
];

//replace this by making calorieCalc access the workout table
const ALLOWED_WORKOUTS = {
  pushup:  { met: 3.8 },
  pullup:  { met: 4.0 },
  running: { met: 7.0 },
  squats:  { met: 5.0 },
  bicycling: { met: 8.0 },
  walking: { met: 4.3 },
  swimming: { met: 10.0 },
  hiking: { met: 7.3},
  ropejumping: { met: 10.0 },
};

const PAIRING_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const USDA_API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Convert points to taka (100 points = 1 taka, or 1000 points = 10 taka)
function pointsToTaka(points) {
  return points / 100;
}

function createRandomPairingCode() {
  let code = '';

  for (let index = 0; index < 5; index += 1) {
    const randomIndex = Math.floor(Math.random() * PAIRING_CODE_ALPHABET.length);
    code += PAIRING_CODE_ALPHABET[randomIndex];
  }

  return code;
}

async function generateUniquePairingCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createRandomPairingCode();
    const existingUser = await Users.exists({ pairingCode: code });

    if (!existingUser) {
      return code;
    }
  }

  throw new Error('Unable to generate unique pairing code');
}

function buildMemberScores(memberIds) {
  return memberIds.map((memberId) => ({
    userId: memberId,
    points: 0,
    penalties: 0,
    moneyEarned: 0,
  }));
}

function buildDefaultAllowedStakes() {
  return [...ALLOWED_STAKES];
}

function normalizeStakeLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasStakeLabel(stakes, label) {
  const normalizedLabel = normalizeStakeLabel(label).toLowerCase();
  return stakes.some((entry) => normalizeStakeLabel(entry).toLowerCase() === normalizedLabel);
}

async function ensurePairAllowedStakes(buddyPair) {
  const hasValidAllowedStakes =
    Array.isArray(buddyPair.allowedStakes)
    && buddyPair.allowedStakes.some((entry) => normalizeStakeLabel(entry));

  if (!hasValidAllowedStakes) {
    buddyPair.allowedStakes = buildDefaultAllowedStakes();
    await buddyPair.save();
  }

  return buddyPair.allowedStakes
    .map((entry) => normalizeStakeLabel(entry))
    .filter(Boolean);
}

function buildWeeklyWindowStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildWeeklyWindowEnd(startDate) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 7);
  return end;
}

function padDayPart(value) {
  return String(value).padStart(2, '0');
}

function toDayKey(date) {
  const year = date.getFullYear();
  const month = padDayPart(date.getMonth() + 1);
  const day = padDayPart(date.getDate());
  return `${year}-${month}-${day}`;
}

function buildWeeklyDayStatuses(weeklyGoal, uploadedDays = [], now = new Date()) {
  const weekStart = buildWeeklyWindowStart(weeklyGoal.startDate || now);
  const today = buildWeeklyWindowStart(now);
  const uploadedDaySet = new Set(uploadedDays);

  const days = Array.from({ length: 7 }, (_, offset) => {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + offset);

    const dayKey = toDayKey(dayDate);
    let status = 'not_yet_open';

    if (uploadedDaySet.has(dayKey)) {
      status = 'done';
    } else if (dayDate.getTime() < today.getTime()) {
      status = 'false';
    } else if (dayDate.getTime() === today.getTime()) {
      status = 'can_be_done';
    }

    return {
      dayKey,
      dayName: dayDate.toLocaleDateString('en-US', { weekday: 'long' }),
      date: dayDate,
      status,
      isDone: status === 'done',
    };
  });

  const summary = {
    done: days.filter((entry) => entry.status === 'done').length,
    canBeDone: days.filter((entry) => entry.status === 'can_be_done').length,
    notYetOpen: days.filter((entry) => entry.status === 'not_yet_open').length,
    false: days.filter((entry) => entry.status === 'false').length,
  };

  return { days, summary };
}

// ----

function buildEmptyDailyStreaks(participants) {
  return participants.map((participantId) => ({
    userId: participantId,
    uploadedDays: [],
  }));
}

function buildEmptyStreakStatus(participants) {
  return participants.map((participantId) => ({
    userId: participantId,
    streak: false,
  }));
}

async function applyPersistentUserStreaks(weeklyGoal, weekEndDate) {
  const participants = Array.isArray(weeklyGoal.participants) ? weeklyGoal.participants : [];

  if (participants.length === 0) {
    return;
  }

  const users = await Users.find({ _id: { $in: participants } }).select('_id streak');
  const streakStatusByUserId = new Map(
    (weeklyGoal.streakStatus || []).map((entry) => [String(entry.userId), entry.streak === true])
  );

  for (const user of users) {
    const completedWeek = streakStatusByUserId.get(String(user._id)) === true;
    const currentValue = Number.isInteger(user.streak?.current) ? user.streak.current : 0;
    const nextValue = completedWeek ? currentValue + 1 : 0;

    user.streak = {
      ...(user.streak || {}),
      current: nextValue,
      lastWorkoutDate: completedWeek ? weekEndDate : user.streak?.lastWorkoutDate || null,
    };

    await user.save();
  }
}

async function deleteWeeklyGoalProofFiles(weeklyGoal) {
  const proofs = Array.isArray(weeklyGoal?.proofs) ? weeklyGoal.proofs : [];

  for (const proof of proofs) {
    if (proof?.fileId) {
      await deleteProofFromGridFS(proof.fileId).catch(() => null);
    }
  }
}
async function deleteDuplicateWeeklyGoals({ buddyPairId, participants, keepGoalId }) {
  const participantSet = new Set((participants || []).map((memberId) => String(memberId)));
  const allCandidates = await WeeklyGoal.find({ _id: { $ne: keepGoalId } })
    .select('_id buddyPairId participants proofs');

  const duplicates = allCandidates.filter((goal) => {
    if (String(goal?.buddyPairId || '') === String(buddyPairId || '')) {
      return true;
    }

    const goalParticipants = Array.isArray(goal?.participants)
      ? goal.participants.map((memberId) => String(memberId))
      : [];

    if (goalParticipants.length !== participantSet.size || participantSet.size === 0) {
      return false;
    }

    return goalParticipants.every((memberId) => participantSet.has(memberId));
  });

  for (const duplicateGoal of duplicates) {
    await deleteWeeklyGoalProofFiles(duplicateGoal);
    await WeeklyGoal.deleteOne({ _id: duplicateGoal._id });
  }
}
// weekly goal
function getWeeklyGoalSortDateValue(goal) {
  if (!goal) {
    return Number.NEGATIVE_INFINITY;
  }

  const candidates = [goal.endDate, goal.startDate, goal.updatedAt, goal.createdAt]
    .map((value) => new Date(value))
    .map((date) => (Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime()));

  return Math.max(...candidates);
}

function pickNewestWeeklyGoal(primaryGoal, fallbackGoal) {
  if (!primaryGoal) {
    return fallbackGoal;
  }

  if (!fallbackGoal) {
    return primaryGoal;
  }

  return getWeeklyGoalSortDateValue(fallbackGoal) > getWeeklyGoalSortDateValue(primaryGoal)
    ? fallbackGoal
    : primaryGoal;
}

async function ensureWeeklyGoalForPair(buddyPair) {
  const [pairScopedWeeklyGoal, participantScopedWeeklyGoal] = await Promise.all([
    WeeklyGoal.findOne({ buddyPairId: buddyPair._id })
      .sort({ endDate: -1, startDate: -1, updatedAt: -1, createdAt: -1 }),
    WeeklyGoal.findOne({
      participants: { $all: buddyPair.members, $size: 2 },
    }).sort({ endDate: -1, startDate: -1, updatedAt: -1, createdAt: -1 }),
  ]);

  let weeklyGoal = pickNewestWeeklyGoal(pairScopedWeeklyGoal, participantScopedWeeklyGoal);

  if (weeklyGoal) {
    weeklyGoal.buddyPairId = buddyPair._id;
    if (!Number.isInteger(weeklyGoal.weeklyWorkoutGoal) || weeklyGoal.weeklyWorkoutGoal < 1) {
      weeklyGoal.weeklyWorkoutGoal = DEFAULT_WEEKLY_GOAL;
    }
    if (!weeklyGoal.stake) {
      weeklyGoal.stake = DEFAULT_WEEKLY_STAKE;
    }
    if (!Array.isArray(weeklyGoal.dailyStreaks) || weeklyGoal.dailyStreaks.length === 0) {
      weeklyGoal.dailyStreaks = buildEmptyDailyStreaks(buddyPair.members);
    }
    if (!Array.isArray(weeklyGoal.streakStatus) || weeklyGoal.streakStatus.length === 0) {
      weeklyGoal.streakStatus = buildEmptyStreakStatus(buddyPair.members);
    }
    if (!Array.isArray(weeklyGoal.proofs)) {
      weeklyGoal.proofs = [];
    }
    await weeklyGoal.save();
  }

  if (!weeklyGoal) {
    const startDate = buildWeeklyWindowStart();
    const endDate = buildWeeklyWindowEnd(startDate);

    weeklyGoal = await WeeklyGoal.create({
      buddyPairId: buddyPair._id,
      participants: buddyPair.members,
      weeklyWorkoutGoal: DEFAULT_WEEKLY_GOAL,
      stake: DEFAULT_WEEKLY_STAKE,
      startDate,
      endDate,
      status: 'active',
      dailyStreaks: buildEmptyDailyStreaks(buddyPair.members),
      streakStatus: buildEmptyStreakStatus(buddyPair.members),
      combined_streak: false,
      proofs: [],
    });
  }

  // Keep exactly one weekly goal document for this pair.
  await deleteDuplicateWeeklyGoals({
    buddyPairId: buddyPair._id,
    participants: buddyPair.members,
    keepGoalId: weeklyGoal._id,
  });

  return weeklyGoal;
}

async function resetWeeklyGoalIfExpired(weeklyGoal, now = new Date()) {
  if (!(weeklyGoal.endDate instanceof Date) || Number.isNaN(weeklyGoal.endDate.getTime())) {
    const startDate = buildWeeklyWindowStart(now);
    weeklyGoal.startDate = startDate;
    weeklyGoal.endDate = buildWeeklyWindowEnd(startDate);
    weeklyGoal.dailyStreaks = buildEmptyDailyStreaks(weeklyGoal.participants);
    weeklyGoal.streakStatus = buildEmptyStreakStatus(weeklyGoal.participants);
    weeklyGoal.proofs = [];
    weeklyGoal.status = 'active';
    weeklyGoal.combined_streak = false;
    await weeklyGoal.save();
    return weeklyGoal;
  }

  while (now > weeklyGoal.endDate) {
    const expiredGoal = weeklyGoal;
    const previousWeekEndDate = expiredGoal.endDate;
    const bothCompletedPreviousWeek =
      Array.isArray(expiredGoal.streakStatus)
      && expiredGoal.streakStatus.length === expiredGoal.participants.length
      && expiredGoal.streakStatus.every((entry) => entry.streak === true);

    await applyPersistentUserStreaks(expiredGoal, previousWeekEndDate);

    const nextStartDate = buildWeeklyWindowStart(expiredGoal.endDate);
    const nextEndDate = buildWeeklyWindowEnd(nextStartDate);

    weeklyGoal = await WeeklyGoal.create({
      buddyPairId: expiredGoal.buddyPairId || null,
      participants: expiredGoal.participants,
      weeklyWorkoutGoal: Math.max(1, Number(expiredGoal.weeklyWorkoutGoal) || DEFAULT_WEEKLY_GOAL),
      stake: expiredGoal.stake || DEFAULT_WEEKLY_STAKE,
      startDate: nextStartDate,
      endDate: nextEndDate,
      status: 'active',
      dailyStreaks: buildEmptyDailyStreaks(expiredGoal.participants),
      streakStatus: buildEmptyStreakStatus(expiredGoal.participants),
      combined_streak: false,
      proofs: [],
    });

    // Preserve user streak progression, but remove expired goal artifacts/doc.
    if (bothCompletedPreviousWeek) {
      weeklyGoal.combined_streak = false;
    }

    await deleteWeeklyGoalProofFiles(expiredGoal);
    await WeeklyGoal.deleteOne({ _id: expiredGoal._id });
  }

  return weeklyGoal;
}
// ---
export async function getUsers(req, res) {
  try {
    const users = await Users.find().sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
}

export async function signup(req, res) {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestedRole = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : 'user';
    const adminKey = typeof req.body?.adminKey === 'string' ? req.body.adminKey : '';

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'name, email, and password are required',
      });
    }

    if (!['user', 'admin'].includes(requestedRole)) {
      return res.status(400).json({ message: 'role must be user or admin' });
    }

    if (requestedRole === 'admin' && adminKey !== (process.env.ADMIN_CREATION_KEY || '')) {
      return res.status(403).json({ message: 'Admin signup is not allowed' });
    }

    const existingUser = await Users.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const newUser = await Users.create({
      name,
      email,
      // temporary
      passwordHash: password,
      role: requestedRole,
    });

    return res.status(201).json({
      message: 'Signup successful',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        moderationStatus: newUser.moderationStatus,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    return res.status(500).json({ message: 'Failed to signup' });
  }
}

export async function login(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await Users.findOne({ email });
    if (!user || user.passwordHash !== password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.moderationStatus?.status === 'suspended') {
      return res.status(403).json({
        message: 'Account suspended',
        moderationStatus: user.moderationStatus,
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        moderationStatus: user.moderationStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to login' });
  }
}


export async function fetchPairingCode(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.pairingCode = await generateUniquePairingCode();
    await user.save();

    return res.status(200).json({ pairingCode: user.pairingCode });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to get pairing code' });
  }
}


export async function buddyUp(req, res) {
  try {
    const { id, pairingCode } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const normalizedCode = pairingCode?.trim().toUpperCase();

    if (!normalizedCode) {
      return res.status(400).json({ message: 'Pairing code is required' });
    }

    const [user, buddyUser] = await Promise.all([
      Users.findById(id),
      Users.findOne({ pairingCode: normalizedCode }),
    ]);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!buddyUser) {
      return res.status(404).json({ message: 'Buddy not found for pairing code' });
    }

    if (String(user._id) === String(buddyUser._id)) {
      return res.status(400).json({ message: 'Cannot buddy up with yourself' });
    }

    await Users.updateOne(
      { _id: buddyUser._id },
      { $unset: { pairingCode: 1 } }
    );

    const existingPair = await BuddyPair.findOne({
      members: { $all: [user._id, buddyUser._id], $size: 2 },
    });

    if (existingPair) {
      if (!existingPair.memberScores || existingPair.memberScores.length === 0) {
        existingPair.memberScores = buildMemberScores(existingPair.members);
      }

      await ensurePairAllowedStakes(existingPair);
      await existingPair.save();

      await ensureWeeklyGoalForPair(existingPair);

      await BuddyWorkout.findOneAndUpdate(
        { buddyPairId: existingPair._id },
        {
          $setOnInsert: {
            workouts: [],
            weeklyHistory: [],
          },
        },
        { upsert: true, new: true }
      );

      return res.status(200).json(existingPair);
    }

    const buddyPair = await BuddyPair.create({
      members: [user._id, buddyUser._id],
      allowedStakes: buildDefaultAllowedStakes(),
      memberScores: buildMemberScores([user._id, buddyUser._id]),
      status: 'active',
      combinedStreak: {
        current: 0,
        lastWorkoutDate: null,
      },
      totalWorkoutsCompleted: 0,
    });

    await BuddyWorkout.create({
      buddyPairId: buddyPair._id,
      workouts: [],
      weeklyHistory: [],
    });

    await ensureWeeklyGoalForPair(buddyPair);

    return res.status(201).json(buddyPair);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to buddy up users' });
  }
}

export async function getBuddyInfo(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .select('_id members memberScores status createdAt');

    if (!buddyPair) {
      return res.status(404).json({ message: 'Active buddy pair not found' });
    }

    const buddyId = buddyPair.members.find(
      (memberId) => String(memberId) !== String(user._id)
    );

    if (!buddyId) {
      return res.status(404).json({ message: 'Buddy not found in pair' });
    }

    const buddy = await Users.findById(buddyId)
      .select('_id name profile goals performanceTier streak habits createdAt')
      .lean();

    if (!buddy) {
      return res.status(404).json({ message: 'Buddy user not found' });
    }

    const buddyScore = Array.isArray(buddyPair.memberScores)
      ? buddyPair.memberScores.find((entry) => String(entry.userId) === String(buddy._id))
      : null;

    const points = buddyScore?.points ?? 0;
    const moneyInTaka = pointsToTaka(points);

    return res.status(200).json({
      userId: id,
      buddyPair: {
        id: buddyPair._id,
        status: buddyPair.status,
        createdAt: buddyPair.createdAt,
        monetaryEnabled: buddyPair.monetaryEnabled,
      },
      buddy: {
        ...buddy,
        score: {
          points: points,
          penalties: buddyScore?.penalties ?? 0,
          money: {
            taka: moneyInTaka,
            formatted: `${moneyInTaka.toFixed(2)} টাকা`,
          },
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch buddy info' });
  }
}
// apart of reward
export async function getBuddyMoneyInfo(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id name');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .select('_id members memberScores monetaryEnabled');

    if (!buddyPair) {
      return res.status(404).json({ message: 'Active buddy pair not found' });
    }

    // Get money info for both members
    const moneyInfo = buddyPair.members.map((memberId) => {
      const score = buddyPair.memberScores.find((entry) => String(entry.userId) === String(memberId));
      const points = score?.points ?? 0;
      const taka = pointsToTaka(points);

      return {
        userId: memberId,
        points: points,
        moneyEarned: {
          taka: taka,
          formatted: `${taka.toFixed(2)} টাকা`,
        },
      };
    });

    return res.status(200).json({
      buddyPairId: buddyPair._id,
      monetaryEnabled: buddyPair.monetaryEnabled,
      members: moneyInfo,
    });
  } catch (error) {
    console.error('getBuddyMoneyInfo error:', error);
    return res.status(500).json({ message: 'Failed to fetch buddy money info' });
  }
}

export async function toggleBuddyMonetary(req, res) {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).sort({ createdAt: -1 });

    if (!buddyPair) {
      return res.status(404).json({ message: 'Active buddy pair not found' });
    }

    buddyPair.monetaryEnabled = enabled;
    await buddyPair.save();

    return res.status(200).json({
      message: `Monetary tracking ${enabled ? 'enabled' : 'disabled'}`,
      buddyPairId: buddyPair._id,
      monetaryEnabled: buddyPair.monetaryEnabled,
    });
  } catch (error) {
    console.error('toggleBuddyMonetary error:', error);
    return res.status(500).json({ message: 'Failed to update buddy monetary setting' });
  }
}
// ----
export async function getWeeklyWorkoutRoutine(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPairs = await BuddyPair.find({
      members: user._id,
      status: 'active',
    }).select('_id members status createdAt');

    if (buddyPairs.length === 0) {
      return res.status(200).json({ userId: id, routine: [] });
    }

    const buddyPairIds = buddyPairs.map((pair) => pair._id);
    const workoutDocs = await BuddyWorkout.find({
      buddyPairId: { $in: buddyPairIds },
    }).select('buddyPairId workouts weeklyHistory');

    const workoutByPairId = new Map(
      workoutDocs.map((doc) => [String(doc.buddyPairId), doc])
    );

    const routine = buddyPairs.map((pair) => {
      const workoutDoc = workoutByPairId.get(String(pair._id));

      return {
        buddyPairId: pair._id,
        members: pair.members,
        status: pair.status,
        createdAt: pair.createdAt,
        workouts: workoutDoc?.workouts || [],
        weeklyHistory: workoutDoc?.weeklyHistory || [],
      };
    });

    return res.status(200).json({ userId: id, routine });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch weekly workout routine' });
  }
}

// weekly goal - stakes
export async function getAllowedStakes(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(200).json({ allowedStakes: ALLOWED_STAKES });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id allowedStakes');

    if (!buddyPair) {
      return res.status(200).json({
        allowedStakes: ALLOWED_STAKES,
        source: 'default',
      });
    }

    const allowedStakes = await ensurePairAllowedStakes(buddyPair);

    return res.status(200).json({
      allowedStakes,
      source: 'pair',
      buddyPairId: buddyPair._id,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch allowed stakes' });
  }
}

export async function addWeeklyGoalStake(req, res) {
  try {
    const { id } = req.params;
    const { stake } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const normalizedStake = normalizeStakeLabel(stake);
    if (!normalizedStake) {
      return res.status(400).json({ message: 'Stake cannot be empty' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id members allowedStakes');

    if (!buddyPair) {
      return res.status(400).json({ message: 'User is not in an active buddy pair' });
    }

    const allowedStakes = await ensurePairAllowedStakes(buddyPair);

    if (hasStakeLabel(allowedStakes, normalizedStake)) {
      return res.status(200).json({
        message: 'Stake already exists in allowed stakes',
        added: false,
        allowedStakes,
        buddyPairId: buddyPair._id,
      });
    }

    buddyPair.allowedStakes.push(normalizedStake);
    await buddyPair.save();

    return res.status(201).json({
      message: 'Stake added to pair allowed stakes',
      added: true,
      allowedStakes: buddyPair.allowedStakes,
      buddyPairId: buddyPair._id,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add weekly goal stake' });
  }
}

export async function updateWeeklyGoal(req, res) {
  try {
    const { id } = req.params;
    const { buddyId, weeklyWorkoutGoal, stake, startDate, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id members allowedStakes');

    if (!buddyPair) {
      return res.status(400).json({ message: 'User is not in an active buddy pair' });
    }

    if (buddyId && !buddyPair.members.some((memberId) => String(memberId) === String(buddyId))) {
      return res.status(400).json({ message: 'Provided buddyId is not in the active buddy pair' });
    }

    let parsedGoal = null;
    if (weeklyWorkoutGoal !== undefined) {
      parsedGoal = Number(weeklyWorkoutGoal);
      if (!Number.isInteger(parsedGoal) || parsedGoal < 1) {
        return res.status(400).json({ message: 'weeklyWorkoutGoal must be a positive integer' });
      }
    }

    let normalizedStake = null;
    if (stake !== undefined) {
      if (typeof stake !== 'string') {
        return res.status(400).json({ message: 'Stake must be a string' });
      }

      normalizedStake = stake.trim();
      if (!normalizedStake) {
        return res.status(400).json({ message: 'Stake cannot be empty' });
      }
    }

    let weeklyGoal = await ensureWeeklyGoalForPair(buddyPair);
    weeklyGoal = await resetWeeklyGoalIfExpired(weeklyGoal);
    const pairAllowedStakes = await ensurePairAllowedStakes(buddyPair);

    if (parsedGoal !== null) {
      weeklyGoal.weeklyWorkoutGoal = parsedGoal;
    }

    if (normalizedStake !== null) {
      if (!hasStakeLabel(pairAllowedStakes, normalizedStake)) {
        return res.status(400).json({
          message: 'Stake is not in your pair allowed stakes. Add it first.',
          allowedStakes: pairAllowedStakes,
        });
      }

      weeklyGoal.stake = normalizedStake;
    }

    if (startDate) {
      const normalizedStartDate = new Date(startDate);
      if (Number.isNaN(normalizedStartDate.getTime())) {
        return res.status(400).json({ message: 'Invalid startDate' });
      }

      const start = buildWeeklyWindowStart(normalizedStartDate);
      weeklyGoal.startDate = start;
      weeklyGoal.endDate = buildWeeklyWindowEnd(start);
    }

    if (status) {
      weeklyGoal.status = status;
    }

    await weeklyGoal.save();

    const isAllowedStake = hasStakeLabel(pairAllowedStakes, weeklyGoal.stake);

    return res.status(200).json({
      weeklyGoal,
      allowedStake: isAllowedStake,
      message: isAllowedStake
        ? 'Weekly goal updated'
        : 'Weekly goal updated with a stake outside defaults',
      allowedStakes: pairAllowedStakes,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update weekly goal' });
  }
}
// --

// buddy challenge -- mini bets
export async function createBuddyChallenge(req, res) {
  try {
    const { id } = req.params;
    const { targetId, workoutType, points, deadline } = req.body;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: 'Invalid challenger id or target id' });
    }

    if (String(id) === String(targetId)) {
      return res.status(400).json({ message: 'Cannot challenge yourself' });
    }

    if (typeof workoutType !== 'string' || !workoutType.trim()) {
      return res.status(400).json({ message: 'workoutType is required' });
    }

    const parsedPoints = Number(points);
    if (!Number.isInteger(parsedPoints) || parsedPoints < 1) {
      return res.status(400).json({ message: 'points must be a positive integer' });
    }

    const parsedDeadline = deadline ? new Date(deadline) : null;
    if (!parsedDeadline || Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ message: 'Valid deadline is required' });
    }

    const [challengerUser, targetUser] = await Promise.all([
      Users.findById(id).select('_id'),
      Users.findById(targetId).select('_id'),
    ]);

    if (!challengerUser || !targetUser) {
      return res.status(404).json({ message: 'Challenger or target user not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: { $all: [challengerUser._id, targetUser._id], $size: 2 },
      status: 'active',
    });

    if (!buddyPair) {
      return res.status(400).json({ message: 'Only active buddies can challenge each other' });
    }

    if (!buddyPair.memberScores || buddyPair.memberScores.length === 0) {
      buddyPair.memberScores = buildMemberScores(buddyPair.members);
      await buddyPair.save();
    }

    const challenge = await BuddyChallenge.create({
      buddyPairId: buddyPair._id,
      challenger: challengerUser._id,
      target: targetUser._id,
      workoutType: workoutType.trim(),
      points: parsedPoints,
      status: 'pending',
      createdAt: new Date(),
      deadline: parsedDeadline,
      proof: {
        fileId: null,
        filename: null,
        contentType: null,
        size: null,
        bucket: null,
        submittedAt: null,
        submittedBy: null,
        verifiedAt: null,
        verifiedBy: null,
        verificationNote: null,
      },
    });

    return res.status(201).json(challenge);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create challenge' });
  }
}

export async function getBuddyChallenges(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    await BuddyChallenge.updateMany(
      {
        $or: [{ challenger: user._id }, { target: user._id }],
        status: { $in: ['pending', 'submitted'] },
        deadline: { $lt: now },
      },
      {
        $set: {
          status: 'rejected',
          'proof.verifiedAt': now,
          'proof.verifiedBy': null,
          'proof.verificationNote': 'Auto-rejected: deadline passed',
        },
      }
    );

    const challenges = await BuddyChallenge.find({
      $or: [{ challenger: user._id }, { target: user._id }],
    })
      .sort({ createdAt: -1 })
      .select('challenger target workoutType points status deadline createdAt proof');

    return res.status(200).json({
      userId: id,
      count: challenges.length,
      challenges: challenges.map((challenge) => ({
        challengeId: challenge._id,
        workoutType: challenge.workoutType,
        points: challenge.points,
        status: challenge.status,
        deadline: challenge.deadline,
        createdAt: challenge.createdAt,
        submittedAt: challenge.proof?.submittedAt || null,
        hasProof: Boolean(challenge.proof?.fileId),
        challenger: challenge.challenger,
        target: challenge.target,
        proofUrl: challenge.proof?.fileId
          ? `/user/${id}/challenges/${challenge._id}/proof`
          : null,
      })),
    });
  } catch (error) {
    console.error('getBuddyChallenges error:', error);
    return res.status(500).json({ message: 'Failed to fetch challenges' });
  }
}

async function autoRejectExpiredChallenge(challenge, now = new Date()) {
  if (!challenge) {
    return challenge;
  }

  const isExpirableStatus = challenge.status === 'pending' || challenge.status === 'submitted';
  const hasDeadline = challenge.deadline instanceof Date && !Number.isNaN(challenge.deadline.getTime());

  if (isExpirableStatus && hasDeadline && now > challenge.deadline) {
    challenge.status = 'rejected';
    if (challenge.proof) {
      challenge.proof.verifiedAt = now;
      challenge.proof.verifiedBy = null;
      challenge.proof.verificationNote = 'Auto-rejected: deadline passed';
    }
    await challenge.save();
  }

  return challenge;
}

export async function submitBuddyChallengeProof(req, res) {
  try {
    const { id, challengeId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(challengeId)) {
      return res.status(400).json({ message: 'Invalid user id or challenge id' });
    }

    if (!req.file) {
      console.error('No file in request. req.file:', req.file);
      return res.status(400).json({ message: 'Proof image is required' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const challenge = await BuddyChallenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    await autoRejectExpiredChallenge(challenge);

    if (String(challenge.target) !== String(user._id)) {
      return res.status(403).json({ message: 'Only challenged user can submit proof' });
    }

    if (challenge.status === 'rejected') {
      return res.status(400).json({ message: 'Challenge has expired and is rejected' });
    }

    if (challenge.status === 'approved') {
      return res.status(400).json({ message: 'Challenge already approved' });
    }

    const now = new Date();
    if (now > challenge.deadline) {
      await autoRejectExpiredChallenge(challenge, now);
      return res.status(400).json({ message: 'Challenge deadline has passed' });
    }

    const previousFileId = challenge.proof?.fileId;
    const uploadResult = await uploadProofToGridFS({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      metadata: {
        challengeId,
        userId: id,
        uploadedDate: now,
      },
    });

    challenge.proof = {
      fileId: uploadResult.fileId,
      filename: uploadResult.filename,
      contentType: uploadResult.contentType,
      size: uploadResult.size,
      bucket: uploadResult.bucket,
      submittedAt: now,
      submittedBy: user._id,
      verifiedAt: now,
      verifiedBy: null,
      verificationNote: 'Auto-approved on target submission',
    };

    const buddyPair = await BuddyPair.findById(challenge.buddyPairId)
      .select('_id members memberScores status');

    if (!buddyPair || buddyPair.status !== 'active') {
      return res.status(400).json({ message: 'Active buddy pair not found for challenge' });
    }

    if (!Array.isArray(buddyPair.memberScores) || buddyPair.memberScores.length === 0) {
      buddyPair.memberScores = buildMemberScores(buddyPair.members);
    }

    let targetScore = buddyPair.memberScores.find(
      (entry) => String(entry.userId) === String(challenge.target)
    );

    if (!targetScore) {
      buddyPair.memberScores.push({
        userId: challenge.target,
        points: 0,
        penalties: 0,
        moneyEarned: 0,
      });
      targetScore = buddyPair.memberScores[buddyPair.memberScores.length - 1];
    }

    targetScore.points += challenge.points;
    // Update money earned: 100 points = 1 taka
    targetScore.moneyEarned = pointsToTaka(targetScore.points);
    challenge.status = 'approved';

    await Promise.all([challenge.save(), buddyPair.save()]);

    if (previousFileId && previousFileId !== uploadResult.fileId) {
      await deleteProofFromGridFS(previousFileId).catch(() => null);
    }

    return res.status(200).json({
      message: 'Challenge proof submitted and auto-approved',
      challengeId: challenge._id,
      status: challenge.status,
      pointsAwarded: challenge.points,
      targetUserId: challenge.target,
      targetPoints: targetScore.points,
      submittedAt: challenge.proof.submittedAt,
      proofUrl: `/user/${id}/challenges/${challenge._id}/proof`,
    });
  } catch (error) {
    console.error('submitBuddyChallengeProof error:', error.message || error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({ message: 'Failed to submit challenge proof' });
  }
}

export async function getBuddyChallengeProof(req, res) {
  try {
    const { id, challengeId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(challengeId)) {
      return res.status(400).json({ message: 'Invalid user id or challenge id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const challenge = await BuddyChallenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    await autoRejectExpiredChallenge(challenge);

    const isParticipant =
      String(challenge.challenger) === String(user._id)
      || String(challenge.target) === String(user._id);

    if (!isParticipant) {
      return res.status(403).json({ message: 'User is not part of this challenge' });
    }

    if (!challenge.proof?.fileId) {
      return res.status(404).json({ message: 'No proof uploaded for this challenge' });
    }

    res.setHeader('Content-Type', challenge.proof.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${challenge.proof.filename || 'challenge-proof'}"`
    );

    const downloadStream = getProofDownloadStream(challenge.proof.fileId);
    downloadStream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).json({ message: 'Proof file not found' });
      } else {
        res.end();
      }
    });

    return downloadStream.pipe(res);
  } catch (error) {
    console.error('getBuddyChallengeProof error:', error);
    return res.status(500).json({ message: 'Failed to fetch challenge proof' });
  }
}

// --

export async function getUserHistory(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id streak');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
    })
      .sort({ createdAt: -1 })
      .select('_id combinedStreak totalWorkoutsCompleted');

    if (!buddyPair) {
      return res.status(200).json({
        userId: id,
        streak: user.streak?.current || 0,
        totalWorkouts: 0,
        weeks: [],
      });
    }

    const buddyWorkout = await BuddyWorkout.findOne({
      buddyPairId: buddyPair._id,
    }).select('workouts weeklyHistory');

    const weeklyHistory = Array.isArray(buddyWorkout?.weeklyHistory)
      ? buddyWorkout.weeklyHistory
      : [];

    const weeks = weeklyHistory
      .map((entry) => ({
        weekStartDate: entry.date,
        workoutsCompleted: Array.isArray(entry.workouts) ? entry.workouts.length : 0,
      }))
      .sort((a, b) => new Date(b.weekStartDate) - new Date(a.weekStartDate));

    const fallbackTotalFromWorkoutDoc = Array.isArray(buddyWorkout?.workouts)
      ? buddyWorkout.workouts.length
      : 0;

    const totalWorkouts =
      Number.isInteger(buddyPair.totalWorkoutsCompleted) && buddyPair.totalWorkoutsCompleted >= 0
        ? buddyPair.totalWorkoutsCompleted
        : fallbackTotalFromWorkoutDoc;

    return res.status(200).json({
      userId: id,
      streak: user.streak?.current ?? buddyPair.combinedStreak?.current ?? 0,
      totalWorkouts,
      weeks,
    });
  } catch (error) {
    console.error('getUserHistory error:', error);
    return res.status(500).json({ message: 'Failed to fetch user history' });
  }
}

export async function getChallengePhotos(req, res) {
  try {
    const { id } = req.params;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    await BuddyChallenge.updateMany(
      {
        $or: [{ challenger: user._id }, { target: user._id }],
        status: { $in: ['pending', 'submitted'] },
        deadline: { $lt: now },
      },
      {
        $set: {
          status: 'rejected',
          'proof.verifiedAt': now,
          'proof.verifiedBy': null,
          'proof.verificationNote': 'Auto-rejected: deadline passed',
        },
      }
    );

    const challenges = await BuddyChallenge.find({
      $or: [{ challenger: user._id }, { target: user._id }],
      'proof.fileId': { $ne: null },
      'proof.submittedAt': { $ne: null },
    })
      .sort({ 'proof.submittedAt': -1 })
      .limit(limit)
      .select('challenger target workoutType status points deadline proof');

    const photos = challenges.map((challenge) => ({
      challengeId: challenge._id,
      submittedAt: challenge.proof.submittedAt,
      workoutType: challenge.workoutType,
      status: challenge.status,
      points: challenge.points,
      deadline: challenge.deadline,
      submittedBy: challenge.proof.submittedBy,
      file: {
        filename: challenge.proof.filename,
        contentType: challenge.proof.contentType,
        size: challenge.proof.size,
      },
      proofUrl: `/user/${id}/challenges/${challenge._id}/proof`,
      challenger: challenge.challenger,
      target: challenge.target,
    }));

    return res.status(200).json({
      userId: id,
      count: photos.length,
      photos,
    });
  } catch (error) {
    console.error('getChallengePhotos error:', error);
    return res.status(500).json({ message: 'Failed to fetch challenge photos' });
  }
}

export async function getCurrentStakes(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id memberScores members');

    if (!buddyPair) {
      return res.status(200).json({
        userId: id,
        hasCurrentStake: false,
        stake: null,
      });
    }

    let challenge = await ensureWeeklyGoalForPair(buddyPair);
    challenge = await resetWeeklyGoalIfExpired(challenge);

    const userScore = buddyPair?.memberScores?.find(
      (entry) => String(entry.userId) === String(user._id)
    );

    return res.status(200).json({
      userId: id,
      hasCurrentStake: true,
      stake: {
        weeklyGoalId: challenge._id,
        weeklyWorkoutGoal: challenge.weeklyWorkoutGoal,
        stake: challenge.stake,
        status: challenge.status,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
      },
      score: {
        points: userScore?.points || 0,
        penalties: userScore?.penalties || 0,
      },
    });
  } catch (error) {
    console.error('getCurrentStakes error:', error);
    return res.status(500).json({ message: 'Failed to fetch current stakes' });
  }
}

// Helper function to calculate streak completion
async function updateWeeklyGoalStreaks(weeklyGoal) {
  try {
    const targetDays = Math.max(1, Number(weeklyGoal.weeklyWorkoutGoal) || 1);

    // Check each participant's streak
    for (const participant of weeklyGoal.participants) {
      const dailyStreak = weeklyGoal.dailyStreaks.find(
        (ds) => String(ds.userId) === String(participant)
      );

      if (dailyStreak) {
        // If weekly target days are met, mark streak as true
        const uniqueDays = new Set(dailyStreak.uploadedDays);
        const streakStatus = weeklyGoal.streakStatus.find(
          (ss) => String(ss.userId) === String(participant)
        );

        if (streakStatus) {
          streakStatus.streak = uniqueDays.size >= targetDays;
        }
      }
    }

    // Keep combined streak running during the week; flip true once both hit goal.
    const allStreaksTrue = weeklyGoal.streakStatus.every((ss) => ss.streak === true);
    if (allStreaksTrue && weeklyGoal.streakStatus.length === 2) {
      weeklyGoal.combined_streak = true;
    }

    await weeklyGoal.save();
    return weeklyGoal;
  } catch (error) {
    console.error('updateWeeklyGoalStreaks error:', error);
    throw error;
  }
}

// Submit weekly goal proof (image upload)
export async function submitWeeklyGoalProof(req, res) {
  try {
    const { id, weeklyGoalId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(weeklyGoalId)) {
      return res.status(400).json({ message: 'Invalid user id or weekly goal id' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Proof image file is required' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id members');

    if (!buddyPair) {
      return res.status(400).json({ message: 'User is not in an active buddy pair' });
    }

    // Always upload proof to the current active goal for the pair.
    // This avoids stale client-side weeklyGoalId values posting to expired docs.
    let weeklyGoal = await ensureWeeklyGoalForPair(buddyPair);

    weeklyGoal = await resetWeeklyGoalIfExpired(weeklyGoal);

    // If client sent an old weeklyGoalId, remove it if it belongs to this same pair.
    if (String(weeklyGoalId) !== String(weeklyGoal._id)) {
      const staleGoal = await WeeklyGoal.findById(weeklyGoalId).select('_id participants proofs');
      if (staleGoal) {
        const staleParticipants = Array.isArray(staleGoal.participants)
          ? staleGoal.participants.map((participantId) => String(participantId))
          : [];
        const pairParticipants = new Set((buddyPair.members || []).map((memberId) => String(memberId)));
        const samePairGoal =
          staleParticipants.length === pairParticipants.size
          && staleParticipants.every((participantId) => pairParticipants.has(participantId));

        if (samePairGoal) {
          await deleteWeeklyGoalProofFiles(staleGoal);
          await WeeklyGoal.deleteOne({ _id: staleGoal._id });
        }
      }
    }

    // Check if user is a participant
    const isParticipant = weeklyGoal.participants.some((p) => String(p) === String(id));
    if (!isParticipant) {
      return res.status(403).json({ message: 'User is not a participant in this weekly goal' });
    }

    // Check if challenge is still active
    const now = new Date();
    if (now > weeklyGoal.endDate) {
      return res.status(400).json({ message: 'Weekly goal deadline has passed' });
    }

    // Get today's date in local YYYY-MM-DD format
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayString = toDayKey(today);

    // Upload file to GridFS
    const uploadResult = await uploadProofToGridFS({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      metadata: {
        weeklyGoalId,
        userId: id,
        uploadedDate: now,
      },
    });

    // Add proof to weekly goal
    weeklyGoal.proofs.push({
      userId: id,
      uploadedDate: now,
      uploadedDay: todayString,
      fileId: uploadResult.fileId,
      filename: uploadResult.filename,
      contentType: uploadResult.contentType,
      size: uploadResult.size,
      bucket: uploadResult.bucket,
    });

    // Update daily streak for user
    const dailyStreak = weeklyGoal.dailyStreaks.find((ds) => String(ds.userId) === String(id));
    if (dailyStreak) {
      // Check if today's date is already in the list
      if (!dailyStreak.uploadedDays.includes(todayString)) {
        dailyStreak.uploadedDays.push(todayString);
      }
    }

    // Update streak status
    await updateWeeklyGoalStreaks(weeklyGoal);

    const weeklyGoalTarget = Math.max(1, Number(weeklyGoal.weeklyWorkoutGoal) || 1);
    const cappedDailyStreaks = weeklyGoal.dailyStreaks.map((entry) => {
      const uniqueDays = [...new Set(entry.uploadedDays || [])];
      const cappedCount = Math.min(uniqueDays.length, weeklyGoalTarget);
      const dayStatus = buildWeeklyDayStatuses(weeklyGoal, uniqueDays, now);

      return {
        userId: entry.userId,
        uploadedDays: uniqueDays.slice(0, weeklyGoalTarget),
        daysCompleted: cappedCount,
        goalDays: weeklyGoalTarget,
        dayStatus,
      };
    });

    return res.status(200).json({
      message: 'Weekly goal proof uploaded successfully',
      weeklyGoal: {
        _id: weeklyGoal._id,
        requestedWeeklyGoalId: weeklyGoalId,
        dailyStreaks: cappedDailyStreaks,
        streakStatus: weeklyGoal.streakStatus,
        combined_streak: weeklyGoal.combined_streak,
        proofCount: weeklyGoal.proofs.length,
      },
    });
  } catch (error) {
    console.error('submitWeeklyGoalProof error:', error);
    return res.status(500).json({ message: 'Failed to submit weekly goal proof' });
  }
}

function streamWeeklyGoalProof(res, proof) {
  res.setHeader('Content-Type', proof.contentType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${proof.filename || 'weekly-goal-proof'}"`
  );

  const downloadStream = getProofDownloadStream(proof.fileId);
  downloadStream.on('error', () => {
    if (!res.headersSent) {
      res.status(404).json({ message: 'Proof file not found' });
    } else {
      res.end();
    }
  });

  return downloadStream.pipe(res);
}

export async function getWeeklyGoalProof(req, res) {
  try {
    const { id, weeklyGoalId, proofId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(weeklyGoalId)) {
      return res.status(400).json({ message: 'Invalid user id or weekly goal id' });
    }

    if (!mongoose.isValidObjectId(proofId)) {
      return res.status(400).json({ message: 'Invalid proof id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const buddyPair = await BuddyPair.findOne({
      members: user._id,
      status: 'active',
    }).select('_id members');

    if (!buddyPair) {
      return res.status(400).json({ message: 'User is not in an active buddy pair' });
    }

    let weeklyGoal = await ensureWeeklyGoalForPair(buddyPair);

    weeklyGoal = await resetWeeklyGoalIfExpired(weeklyGoal);

    const isParticipant = weeklyGoal.participants.some((participantId) => String(participantId) === String(id));
    if (!isParticipant) {
      return res.status(403).json({ message: 'User is not a participant in this weekly goal' });
    }

    const proof = weeklyGoal.proofs.find((entry) => String(entry._id) === String(proofId));
    if (!proof || !proof.fileId) {
      return res.status(404).json({ message: 'Proof not found' });
    }

    return streamWeeklyGoalProof(res, proof);
  } catch (error) {
    console.error('getWeeklyGoalProof error:', error);
    return res.status(500).json({ message: 'Failed to fetch weekly goal proof' });
  }
}

// Get weekly goal details with streak info
export async function getWeeklyGoalDetails(req, res) {
  try {
    const { id, weeklyGoalId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(weeklyGoalId)) {
      return res.status(400).json({ message: 'Invalid user id or weekly goal id' });
    }

    const user = await Users.findById(id).select('_id streak');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let weeklyGoal = await WeeklyGoal.findById(weeklyGoalId).populate('participants', '_id');
    if (!weeklyGoal) {
      return res.status(404).json({ message: 'Weekly goal not found' });
    }

    weeklyGoal = await resetWeeklyGoalIfExpired(weeklyGoal);

    const isParticipant = weeklyGoal.participants.some((p) => String(p?._id || p) === String(id));
    if (!isParticipant) {
      return res.status(403).json({ message: 'User is not a participant in this weekly goal' });
    }

    // Get current user's streak info
    const userDailyStreak = weeklyGoal.dailyStreaks.find((ds) => String(ds.userId) === String(id));
    const userStreakStatus = weeklyGoal.streakStatus.find((ss) => String(ss.userId) === String(id));
    const userProofs = weeklyGoal.proofs.filter((p) => String(p.userId) === String(id));
    const weeklyGoalTarget = Math.max(1, Number(weeklyGoal.weeklyWorkoutGoal) || 1);
    const userUniqueDays = [...new Set(userDailyStreak?.uploadedDays || [])];
    const cappedUserDays = userUniqueDays.slice(0, weeklyGoalTarget);
    const now = new Date();
    const userDayStatus = buildWeeklyDayStatuses(weeklyGoal, userUniqueDays, now);
    const participantProgress = weeklyGoal.dailyStreaks.map((entry) => {
      const uniqueDays = [...new Set(entry.uploadedDays || [])];
      const daysCompleted = Math.min(uniqueDays.length, weeklyGoalTarget);
      const dayStatus = buildWeeklyDayStatuses(weeklyGoal, uniqueDays, now);

      return {
        userId: entry.userId,
        daysCompleted,
        goalDays: weeklyGoalTarget,
        dayStatus,
      };
    });

    return res.status(200).json({
      weeklyGoal: {
        _id: weeklyGoal._id,
        weeklyWorkoutGoal: weeklyGoal.weeklyWorkoutGoal,
        stake: weeklyGoal.stake,
        status: weeklyGoal.status,
        startDate: weeklyGoal.startDate,
        endDate: weeklyGoal.endDate,
        combined_streak: weeklyGoal.combined_streak,
      },
      userStreak: {
        uploadedDays: cappedUserDays,
        streak: userStreakStatus?.streak || false,
        persistentCurrent: user.streak?.current || 0,
        uploadCount: userProofs.length,
        daysCompleted: Math.min(userUniqueDays.length, weeklyGoalTarget),
        goalDays: weeklyGoalTarget,
        dayStatus: userDayStatus,
      },
      allStreakStatus: weeklyGoal.streakStatus,
      participantProgress,
    });
  } catch (error) {
    console.error('getWeeklyGoalDetails error:', error);
    return res.status(500).json({ message: 'Failed to fetch weekly goal details' });
  }
}
// calorie tracker
export async function CalorieLogger(req, res)
{
  try {
    const { id } = req.params;
    const { weight, goal, date, workout, duration } = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (!weight || weight < 10)
    {
      return res.status(400).json({ message: 'invalid weight' });
    }

    if (!goal || goal < 1)
    {
      return res.status(400).json({ message: 'goal must be a positive number' });
    }

    if (typeof workout !== 'string' || !workout.trim()) {
      return res.status(400).json({ message: 'Workout must be a non-empty string' });
    }

    if (!duration || duration<=0)
    {
      return res.status(400).json({ message: 'duration must be a positive number' });
    }
    
    const normalizedWorkout = workout.trim().toLowerCase();

    const isAllowedWorkout = normalizedWorkout in ALLOWED_WORKOUTS;

    if (!isAllowedWorkout)
    {
      return res.status(400).json({ message: 'workout not allowed' });
    }
  
    const calories = calorieCalc(normalizedWorkout, duration, weight);
    const goalmet = calories >= goal;

    const entry = await CalorieTracker.create({
      userId: id,
      weight,
      goal,
      calories,
      workout: normalizedWorkout,
      duration,
      goalmet,
      date: date ? new Date(date) : new Date(),
    });

    return res.status(201).json(entry);

  }
  catch (error)
  {
    console.error('logCalories error:', error);
    return res.status(500).json({ message: 'Failed to log calories' });
  }
}

//Update this to be more generalized and use the workout table
function calorieCalc(workout, duration, weight)
{
  const { met } = ALLOWED_WORKOUTS[workout];
  return Math.round(met*weight*(duration/60));
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseKcalPer100gFromProduct(product) {
  const nutriments = product?.nutriments || {};
  const candidates = [
    nutriments['energy-kcal_100g'],
    nutriments['energy-kcal_value'],
    nutriments.energyKcal100g,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

// food intake
const FALLBACK_FOODS = [
  { foodName: 'Brown Rice', kcalPer100g: 111 },
  { foodName: 'White Rice', kcalPer100g: 130 },
  { foodName: 'Chicken Breast', kcalPer100g: 165 },
  { foodName: 'Egg', kcalPer100g: 155 },
  { foodName: 'Banana', kcalPer100g: 89 },
  { foodName: 'Apple', kcalPer100g: 52 },
  { foodName: 'Bread', kcalPer100g: 265 },
  { foodName: 'Broccoli', kcalPer100g: 34 },
  { foodName: 'Oats', kcalPer100g: 389 },
  { foodName: 'Almonds', kcalPer100g: 579 },
  { foodName: 'Peanut Butter', kcalPer100g: 588 },
  { foodName: 'Milk', kcalPer100g: 42 },
  { foodName: 'Yogurt', kcalPer100g: 59 },
  { foodName: 'Potato', kcalPer100g: 77 },
  { foodName: 'Lentils', kcalPer100g: 116 },
  { foodName: 'Beef', kcalPer100g: 250 },
  { foodName: 'Salmon', kcalPer100g: 208 },
  { foodName: 'Orange', kcalPer100g: 47 },
  { foodName: 'Avocado', kcalPer100g: 160 },
  { foodName: 'Cheese', kcalPer100g: 402 },
];

function getFallbackFoods(searchTerm) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return FALLBACK_FOODS
    .filter((item) => item.foodName.toLowerCase().includes(query))
    .slice(0, 15)
    .map((item) => ({
      productId: null,
      foodName: item.foodName,
      brand: 'Local fallback',
      servingSize: null,
      kcalPer100g: item.kcalPer100g,
    }));
}

async function fetchOpenFoodFactsJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'workout-buddy/1.0 (calorie-intake feature)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenFoodFacts request failed with status ${response.status}`);
  }

  return response.json();
}

function parseKcalFromUsdaNutrients(nutrients = []) {
  if (!Array.isArray(nutrients)) {
    return null;
  }

  const energy = nutrients.find((item) => {
    const nutrientIdMatch = Number(item?.nutrientId) === 1008;
    const nutrientName = typeof item?.nutrientName === 'string' ? item.nutrientName.toLowerCase() : '';
    const isEnergyName = nutrientName.includes('energy');
    return nutrientIdMatch || isEnergyName;
  });

  const candidates = [energy?.value, energy?.amount, energy?.nutrientNumber];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

async function searchUsdaFoods(searchTerm) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', USDA_API_KEY);
  url.searchParams.set('query', searchTerm);
  url.searchParams.set('pageSize', '25');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`USDA search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const foods = Array.isArray(payload?.foods) ? payload.foods : [];

  return foods
    .map((item) => {
      const foodName = typeof item?.description === 'string' ? item.description.trim() : '';
      if (!foodName) {
        return null;
      }

      const kcalPer100g = parseKcalFromUsdaNutrients(item?.foodNutrients || []);
      return {
        productId: item?.fdcId ? `usda:${item.fdcId}` : null,
        foodName,
        brand: item?.brandOwner || item?.dataType || 'USDA',
        servingSize: null,
        kcalPer100g,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

async function fetchUsdaFoodById(fdcId) {
  const url = new URL(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}`);
  url.searchParams.set('api_key', USDA_API_KEY);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`USDA product lookup failed with status ${response.status}`);
  }

  return response.json();
}

export async function SearchFoods(req, res) {
  try {
    const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(200).json({ foods: [] });
    }

    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', searchTerm);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '20');
    url.searchParams.set('fields', 'code,product_name,brands,nutriments,serving_size');

    let foods = [];
    let source = 'openfoodfacts';

    try {
      const payload = await fetchOpenFoodFactsJson(url.toString());
      const products = Array.isArray(payload?.products) ? payload.products : [];

      foods = products
        .map((product) => {
          const foodName = typeof product?.product_name === 'string' ? product.product_name.trim() : '';
          if (!foodName) {
            return null;
          }

          const kcalPer100g = parseKcalPer100gFromProduct(product);
          return {
            productId: product?.code || null,
            foodName,
            brand: typeof product?.brands === 'string' ? product.brands : null,
            servingSize: typeof product?.serving_size === 'string' ? product.serving_size : null,
            kcalPer100g,
          };
        })
        .filter(Boolean)
        .slice(0, 20);
    } catch (offError) {
      console.warn('SearchFoods OpenFoodFacts unavailable:', offError?.message || offError);
    }

    if (foods.length < 8) {
      try {
        const usdaFoods = await searchUsdaFoods(searchTerm);
        if (usdaFoods.length > 0) {
          foods = usdaFoods;
          source = 'usda';
        }
      } catch (usdaError) {
        console.warn('SearchFoods USDA unavailable:', usdaError?.message || usdaError);
      }
    }

    if (foods.length === 0) {
      const fallbackFoods = getFallbackFoods(searchTerm);
      return res.status(200).json({ foods: fallbackFoods, source: 'fallback' });
    }

    return res.status(200).json({ foods, source });
  } catch (error) {
    console.error('SearchFoods error:', error);
    const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const fallbackFoods = getFallbackFoods(searchTerm);
    return res.status(200).json({
      foods: fallbackFoods,
      source: 'fallback',
      warning: 'Live food API unavailable, showing local fallback foods.',
    });
  }
}

// ---
export async function CalorieIntakeLogger(req, res) {
  try {
    const { id } = req.params;
    const {
      foodName,
      productId,
      grams,
      quantity,
      kcalPer100g: providedKcalPer100g,
      date,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const normalizedFoodName = typeof foodName === 'string' ? foodName.trim() : '';
    if (!normalizedFoodName) {
      return res.status(400).json({ message: 'foodName is required' });
    }

    const parsedGrams = toPositiveNumber(grams);
    if (!parsedGrams) {
      return res.status(400).json({ message: 'grams must be a positive number' });
    }

    const parsedQuantity = toPositiveNumber(quantity);
    if (!parsedQuantity) {
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }

    let resolvedKcalPer100g = null;
    if (typeof productId === 'string' && productId.trim()) {
      const normalizedProductId = productId.trim();

      if (normalizedProductId.startsWith('usda:')) {
        const fdcId = normalizedProductId.split(':')[1];
        if (fdcId) {
          try {
            const usdaProduct = await fetchUsdaFoodById(fdcId);
            resolvedKcalPer100g = parseKcalFromUsdaNutrients(usdaProduct?.foodNutrients || []);
          } catch (usdaLookupError) {
            console.warn('CalorieIntakeLogger USDA lookup fallback:', usdaLookupError?.message || usdaLookupError);
          }
        }
      } else {
        try {
          const productUrl = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedProductId)}.json`);
          productUrl.searchParams.set('fields', 'code,product_name,nutriments');
          const productPayload = await fetchOpenFoodFactsJson(productUrl.toString());
          resolvedKcalPer100g = parseKcalPer100gFromProduct(productPayload?.product);
        } catch (productLookupError) {
          console.warn('CalorieIntakeLogger OpenFoodFacts lookup fallback:', productLookupError?.message || productLookupError);
        }
      }
    }

    if (resolvedKcalPer100g === null) {
      const fallbackKcal = Number(providedKcalPer100g);
      if (Number.isFinite(fallbackKcal) && fallbackKcal >= 0) {
        resolvedKcalPer100g = fallbackKcal;
      }
    }

    if (resolvedKcalPer100g === null) {
      return res.status(400).json({
        message: 'Could not resolve calories for this food. Please pick another result.',
      });
    }

    const intakeCalories = Math.round((resolvedKcalPer100g * parsedGrams * parsedQuantity) / 100);

    const entry = await CalorieIntake.create({
      userId: user._id,
      foodName: normalizedFoodName,
      productId: typeof productId === 'string' && productId.trim() ? productId.trim() : null,
      grams: parsedGrams,
      quantity: parsedQuantity,
      kcalPer100g: resolvedKcalPer100g,
      intakeCalories,
      source: 'openfoodfacts',
      date: date ? new Date(date) : new Date(),
    });

    return res.status(201).json(entry);
  } catch (error) {
    console.error('CalorieIntakeLogger error:', error);
    return res.status(500).json({ message: 'Failed to log calorie intake' });
  }
}

export async function GetCalorieIntakeHistory(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const entries = await CalorieIntake.find({ userId: user._id }).sort({ date: -1, createdAt: -1 });
    const totalIntakeCalories = entries.reduce((sum, entry) => sum + (entry.intakeCalories || 0), 0);

    return res.status(200).json({
      userId: id,
      totalIntakeCalories,
      entries,
    });
  } catch (error) {
    console.error('GetCalorieIntakeHistory error:', error);
    return res.status(500).json({ message: 'Failed to fetch calorie intake history' });
  }
}

export async function GetCalorieHistory(req, res)
{
  try
  {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await Users.findById(id).select('_id');

    if (!user)
    {
      return res.status(404).json({ message: 'User not found' });
    }
    const filter = { userId: id };
    if (req.query.start || req.query.end)
    {
      filter.date = {};
      if (req.query.start)
        {
          filter.date.$gte = new Date(req.query.start);
        }
      if (req.query.end)
        {
          filter.date.$lte = new Date(req.query.end);
        }
    }

    const entries = await CalorieTracker.find(filter).sort({ date: -1 });

    const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);
    return res.status(200).json({
      userId: id,
      totalCalories,
      entries,
    });
  }
  catch (error)
  {
    console.error('CalorieTracker error:', error);
    return res.status(500).json({ message: 'Failed to fetch Calorie history' });
  }
}
// workout model
export async function WorkoutGetter(req, res)
{
  try
  {
    const workouts = await Workout.find();
    if (!workouts.length)
    {
      return res.status(404).json({ message: 'No workouts found' });
    }

    return res.status(200).json(workouts);
  }
  catch (error)
  {
    console.error('WorkoutModelGetter error:', error);
    return res.status(500).json({ message: 'Failed to retrieve Workout Model' });
  }
}
export async function WorkoutModelGetter(req, res)
{
 try
 {
  const { id } = req.params;
  if (id)
  {
    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const models = await WorkoutModel.find({ userId: id }).populate('workouts.exercise', 'title -_id');

    if (!models.length)
    {
      return res.status(404).json({ message: 'No workout models found for this user' });
    }

    return res.status(200).json(models);
  }
  else
  {
    const models = await WorkoutModel.find().populate('workouts.exercise', 'title -_id');
    
    if (!models.length)
    {
      return res.status(404).json({ message: 'No workout models found' });
    }

    return res.status(200).json(models);
  }
 }
 catch (error)
 {
  console.error('WorkoutModelGetter error:', error);
  return res.status(500).json({ message: 'Failed to retrieve Workout Model' });
}
}
export async function WorkoutModelCreator(req, res)
{
  try
  {
    const { id } = req.params;
    const { category, title, workouts} = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (typeof category !== 'string' || !category.trim())
    {
      return res.status(400).json({ message: 'Category must be a non-empty string' });
    }

    if (typeof title !== 'string' || !title.trim())
    {
      return res.status(400).json({ message: 'Title must be a non-empty string' });
    }

    if (!Array.isArray(workouts) || workouts.length === 0)
    {
      return res.status(400).json({message: 'Workouts must be non-empty array'});
    }

    for (let i = 0; i < workouts.length; i++)
    {
      const entry = workouts[i];

      if (typeof entry != 'object' || entry === null)
      {
        return res.status(400).json({message: 'Entry must be an object'});
      }

      if (!mongoose.isValidObjectId(entry.exercise))
      {
        return res.status(400).json({message: 'Exercise must be a valid object'});
      }
      
      if (typeof entry.sets != 'number' || !Number.isInteger(entry.sets) || entry.sets < 1)
      {
        return res.status(400).json({message: 'Set must be a number >= 1'});
      }
      
      if (typeof entry.reps != 'number' || !Number.isInteger(entry.reps) || entry.reps < 1)
      {
        return res.status(400).json({message: 'Reps must be a number >= 1'});
      }
      
      if (typeof entry.rest != 'number' || !Number.isInteger(entry.rest) || entry.rest < 1)
      {
        return res.status(400).json({message: 'Rest must be a number >= 1'});
      }
    }
    const entry = await WorkoutModel.create({
      userId: id,
      category,
      title,
      workouts,
    });

    if (!entry)
    {
      return res.status(404).json({ message: 'Workout model not created' });
    }

    return res.status(201).json(entry);

  }
  catch (error)
  {
    console.error('WorkoutModelCreator error:', error);
    return res.status(500).json({ message: 'Failed to create Workout Model' });
  }
}
export async function WorkoutModelDeleter(req, res)
{
  try
  {
    const { id } = req.params;
    const { title, modelId } = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    const hasValidModelId = typeof modelId === 'string' && mongoose.isValidObjectId(modelId);

    if (!hasValidModelId && !normalizedTitle) {
      return res.status(400).json({ message: 'Provide modelId or title to delete' });
    }

    const deleteFilter = { userId: id };
    if (hasValidModelId) {
      deleteFilter._id = modelId;
    } else {
      deleteFilter.title = normalizedTitle;
    }

    const deleted = await WorkoutModel.findOneAndDelete(deleteFilter);

    if (!deleted)
    {
      return res.status(404).json({ message: 'Workout model not found' });
    }

    return res.status(200).json({ message: 'Workout model deleted successfully' });
  }
  catch (error)
  {
    console.error('WorkoutModelDeleter error:', error);
    return res.status(500).json({ message: 'Failed to delete workout model' });
  }
}
export async function WorkoutModelEditor(req, res)
{
  try
  {
    const { id } = req.params;
    const { category, title, workouts} = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (typeof category !== 'string' || !category.trim())
    {
      return res.status(400).json({ message: 'Category must be a non-empty string' });
    }

    if (typeof title !== 'string' || !title.trim())
    {
      return res.status(400).json({ message: 'Title must be a non-empty string' });
    }

    if (!Array.isArray(workouts) || workouts.length === 0)
    {
      return res.status(400).json({message: 'Workouts must be non-empty array'});
    }

    for (let i = 0; i < workouts.length; i++)
    {
      const entry = workouts[i];

      if (typeof entry != 'object' || entry === null)
      {
        return res.status(400).json({message: 'Entry must be an object'});
      }

      if (!mongoose.isValidObjectId(entry.exercise))
      {
        return res.status(400).json({message: 'Exercise must be a valid object'});
      }
      
      if (typeof entry.sets != 'number' || !Number.isInteger(entry.sets) || entry.sets < 1)
      {
        return res.status(400).json({message: 'Set must be a number >= 1'});
      }
      
      if (typeof entry.reps != 'number' || !Number.isInteger(entry.reps) || entry.reps < 1)
      {
        return res.status(400).json({message: 'Reps must be a number >= 1'});
      }
      
      if (typeof entry.rest != 'number' || !Number.isInteger(entry.rest) || entry.rest < 1)
      {
        return res.status(400).json({message: 'Rest must be a number >= 1'});
      }
    }

    const edited = await WorkoutModel.findOneAndReplace(
      { userId: id, title },
      {
        userId: id,
        category,
        title,
        workouts,
      },
      { new: true} 
    );

    if (!edited)
    {
      return res.status(404).json({ message: 'Workout model not found' });
    }

    return res.status(200).json({ message: 'Workout model updated successfully' });
  }
  catch (error)
  {
    console.error('WorkoutModelEditor error:', error);
    return res.status(500).json({ message: 'Failed to edit workout model' });
  }
}
export async function WorkoutModelSessionStarter(req, res)
{
  try
  {
    const { id } = req.params;
    const { modelId } = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (!mongoose.isValidObjectId(modelId))
    {
      return res.status(400).json({ message: 'Invalid model id' });
    }

    const existing = await ActiveWorkoutModelSession.findOne({ userId: id})
    if (existing)
    {
      return res.status(400).json({ message: 'User already has an active session' });
    }

    const model = await WorkoutModel.findOne({_id: modelId});
    if (!model)
    {
      return res.status(400).json({ message: 'Workout model not found' });
    }

    const session = await ActiveWorkoutModelSession.create(
      {
        userId: id,
        modelId,
        startTime: new Date(),
        progress: model.workouts.map(w => ({
        exercise: w.exercise,
        sets: w.sets,
        reps: w.reps,
        rest: w.rest,
        completed: false,
        timeTaken: null,
      }))
      }
    )
    return res.status(201).json(session);
  }
  catch (error)
  {
    console.error('WorkoutModelSessionStarter error:', error);
    return res.status(500).json({ message: 'Failed to start workout model session' });
  }
}
export async function WorkoutModelSessionTracker(req, res)
{
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const session = await ActiveWorkoutModelSession.findOne({ userId: id }).populate('modelId').populate('progress.exercise');

    if (!session)
    {
      return res.status(404).json({message: 'Session not found'});
    }

    const total = session.progress.length;
    const completed = session.progress.filter(p => p.completed).length;

    return res.status(200).json({session, summary: {completed, total, remaining: total-completed, percentageCompleted: Math.round((completed/total)*100)}});
  }
  catch (error)
  {
    console.error('WorkoutModelSessionTracker error:', error);
    return res.status(500).json({ message: 'Failed to get workout model session' });
  }
}
export async function WorkoutModelSessionUpdater(req, res)
{
  try
  {
    const { id } = req.params;
    const { exerciseId, timeTaken, progressIndex } = req.body;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const hasExerciseId = typeof exerciseId === 'string' && exerciseId.trim().length > 0;
    const hasProgressIndex = Number.isInteger(progressIndex) && progressIndex >= 0;

    if (!hasExerciseId && !hasProgressIndex)
    {
      return res.status(400).json({ message: 'exerciseId or progressIndex is required' });
    }

    if (hasExerciseId && !mongoose.isValidObjectId(exerciseId))
    {
      return res.status(400).json({ message: 'Invalid exercise id' });
    }

    if (typeof timeTaken !== 'number' || !Number.isInteger(timeTaken) || timeTaken < 1) {
      return res.status(400).json({ message: 'timeTaken must be an integer >= 1' });
    }

    const session = await ActiveWorkoutModelSession.findOne({ userId: id });
    if (!session)
    {
      return res.status(404).json({message: 'Session not found'});
    }

    let update = null;
    if (hasProgressIndex)
    {
      update = session.progress[progressIndex] || null;

      if (update && hasExerciseId && update.exercise.toString() !== exerciseId)
      {
        return res.status(400).json({ message: 'exerciseId does not match progressIndex' });
      }
    }

    if (!update && hasExerciseId)
    {
      update = session.progress.find(p => p.exercise.toString() === exerciseId && !p.completed) || null;
    }

    if (!update)
    {
      return res.status(404).json({message: 'exercise not found'});
    }

    if (update.completed)
    {
      return res.status(400).json({message: 'exercise already completed'});
    }

    update.completed = true;
    update.timeTaken = timeTaken;
    await session.save();

    return res.status(200).json({message: 'Exercise successfully completed'})
  }
  catch(error)
  {
    console.error('WorkoutModelSessionUpdater error', error);
    return res.status(500).json({ message: 'Failed to update workout model session' });
  }
}
export async function WorkoutModelSessionEnder(req, res)
{
  try
  {
    const { id, sessionId } = req.params;

    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (!mongoose.isValidObjectId(sessionId))
    {
      return res.status(400).json({ message: 'Invalid session id' });
    }

    const session = await ActiveWorkoutModelSession.findOne({ _id: sessionId, userId: id });
    if (!session)
    {
      return res.status(404).json({message: 'Session not found'});
    }

    const endTime = new Date();
    const parsedStartTime = new Date(session.startTime);
    const hasValidStartTime = !Number.isNaN(parsedStartTime.getTime());
    const totalTime = hasValidStartTime
      ? Math.max(0, Math.round((endTime.getTime() - parsedStartTime.getTime()) / 1000))
      : 0;

    const completedWorkouts = session.progress.filter(p => p.completed);
    const allDone = completedWorkouts.length === session.progress.length;

    const record = await WMCompletionHistory.create(
      {
        userId: id,
        modelId: session.modelId,
        startTime: hasValidStartTime ? parsedStartTime : endTime,
        endTime,
        totalTime,
        workouts: completedWorkouts.map(p => 
        ({
          exercise: p.exercise,
          sets: p.sets,
          reps: p.reps,
          rest: p.rest,
          timeTaken: p.timeTaken,
        }))
      }
    )

    const user = await Users.findById(id).select('profile.weight goals.calorieGoal');
    const userWeight = Number(user?.profile?.weight);
    const weightForCalories = Number.isFinite(userWeight) && userWeight >= 10 ? userWeight : 70;

    const exerciseIds = completedWorkouts
      .map((entry) => String(entry.exercise))
      .filter(Boolean);
    const exerciseDocs = await Workout.find({ _id: { $in: exerciseIds } }).select('_id title met');
    const metByExerciseId = new Map(exerciseDocs.map((exerciseDoc) => [String(exerciseDoc._id), exerciseDoc]));

    const burnedCaloriesRaw = completedWorkouts.reduce((sum, completedEntry) => {
      const exerciseDoc = metByExerciseId.get(String(completedEntry.exercise));
      const met = Number(exerciseDoc?.met);
      const seconds = Number(completedEntry.timeTaken) || 0;

      if (!Number.isFinite(met) || met <= 0 || seconds <= 0) {
        return sum;
      }

      return sum + (met * weightForCalories * (seconds / 3600));
    }, 0);

    const burnedCalories = Math.max(0, Math.round(burnedCaloriesRaw));
    const burnGoal = Number(user?.goals?.calorieGoal);
    const normalizedBurnGoal = Number.isFinite(burnGoal) && burnGoal > 0 ? burnGoal : 1;
    const durationMinutes = Math.max(1, Math.round(totalTime / 60));

    await CalorieTracker.create({
      userId: id,
      weight: weightForCalories,
      goal: normalizedBurnGoal,
      workout: 'workout-session',
      duration: durationMinutes,
      calories: burnedCalories,
      goalmet: burnedCalories >= normalizedBurnGoal,
      date: endTime,
    });
    
    await ActiveWorkoutModelSession.findByIdAndDelete(session._id);

    return res.status(200).json({
      message: allDone ? 'Workout Model completed and saved to history' : 'Workout session ended early and saved to history',
      completed: allDone, exercisesCompleted: completedWorkouts.length,
      exercisesTotal: session.progress.length,
      caloriesBurned: burnedCalories,
    });
  }
  catch (error)
  {
    console.error('WorkoutModelSessionEnder error', error);
    return res.status(500).json({ message: 'Failed to end workout model session' });
  }
}
export async function FitnessGetter(req, res)
{
  try
  {
    const { id } = req.params;
 
    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }
 
    const fitness = await UserFitness.findOne({ userId: id });
 
    if (!fitness)
    {
      return res.status(404).json({ message: 'No fitness records found for this user' });
    }
 
    return res.status(200).json(fitness);
  }
  catch(error)
  {
    console.error('Fitnessgetter error', error);
    return res.status(500).json({ message: 'Failed to get user fitness records' });
  }
}
 
export async function FitnessSetter(req, res)
{
  try
  {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }
 
    const existing = await UserFitness.findOne({ userId: id });
    if (existing)
    {
      return res.status(409).json({ message: 'Fitness record already exists for this user' });
    }
 
    const
    {
      cardioEndurance,
      cardioRecovery,
      cardioConsistency,
      cardioGoal,
      strengthUpperBody,
      strengthLowerBody,
      strengthCore,
      strengthGoal,
      flexibilityUpperBody,
      flexibilityLowerBody,
      flexibilitySpinalMobility,
      flexibilityGoal,
      targetFitness,
    } = req.body;
 
    const requiredFields =
    {
      cardioEndurance,
      cardioRecovery,
      cardioConsistency,
      strengthUpperBody,
      strengthLowerBody,
      strengthCore,
      flexibilityUpperBody,
      flexibilityLowerBody,
      flexibilitySpinalMobility,
    };
 
    const missingFields = Object.keys(requiredFields).filter(key => requiredFields[key] === undefined || requiredFields[key] === null);
 
    if (missingFields.length)
    {
      return res.status(400).json({ message: 'Missing required fields', fields: missingFields });
    }
 
    const outOfRangeFields = Object.keys(requiredFields).filter(key => !isValidScore(requiredFields[key]));
 
    if (outOfRangeFields.length)
    {
      return res.status(400).json({ message: 'Sub-scores must be numbers between 1 and 10', fields: outOfRangeFields });
    }
 
    const optionalGoals = { cardioGoal, strengthGoal, flexibilityGoal, targetFitness };
 
    const invalidGoals = Object.keys(optionalGoals).filter(key => optionalGoals[key] !== undefined && !isValidScore(optionalGoals[key]));
 
    if (invalidGoals.length)
    {
      return res.status(400).json({ message: 'Goals must be numbers between 1 and 10', fields: invalidGoals });
    }
 
    const cardioLevel      = calculateDefaultLevel(cardioEndurance, cardioRecovery, cardioConsistency);
    const strengthLevel    = calculateDefaultLevel(strengthUpperBody, strengthLowerBody, strengthCore);
    const flexibilityLevel = calculateDefaultLevel(flexibilityUpperBody, flexibilityLowerBody, flexibilitySpinalMobility);
    const overallLevel     = calculateDefaultLevel(cardioLevel, strengthLevel, flexibilityLevel);
 
    const finalCardioGoal      = cardioGoal      ?? generateDefaultGoal(cardioLevel);
    const finalStrengthGoal    = strengthGoal    ?? generateDefaultGoal(strengthLevel);
    const finalFlexibilityGoal = flexibilityGoal ?? generateDefaultGoal(flexibilityLevel);
    const finalTargetFitness   = targetFitness   ?? generateDefaultGoal(overallLevel);
 
    const projectedCompletionDate = new Date();
    projectedCompletionDate.setDate(projectedCompletionDate.getDate() + 14);
 
    const snapshot =
    {
      takenAt: new Date(),
      cardioLevel,
      strengthLevel,
      flexibilityLevel,
      overallLevel,
    };
 
    const fitness = await UserFitness.create(
      {
        userId: id,
        cardioEndurance,
        cardioRecovery,
        cardioConsistency,
        cardioLevel,
        cardioGoal: finalCardioGoal,
        cardioGoalUserAdjusted: !!cardioGoal,
 
        strengthUpperBody,
        strengthLowerBody,
        strengthCore,
        strengthLevel,
        strengthGoal: finalStrengthGoal,
        strengthGoalUserAdjusted: !!strengthGoal,
 
        flexibilityUpperBody,
        flexibilityLowerBody,
        flexibilitySpinalMobility,
        flexibilityLevel,
        flexibilityGoal: finalFlexibilityGoal,
        flexibilityGoalUserAdjusted: !!flexibilityGoal,
 
        overallLevel,
        targetFitness: finalTargetFitness,
        targetUserAdjusted: !!targetFitness,
 
        cardioGRLastUpdated:      new Date(),
        strengthGRLastUpdated:    new Date(),
        flexibilityGRLastUpdated: new Date(),
        overallGRLastUpdated:     new Date(),
 
        projectedCompletionDate,
        lastProjectionUpdate: new Date(),
 
        assessmentHistory: [snapshot],
 
        onboardingComplete: true,
      },
    );
 
    return res.status(201).json(fitness);
  }
  catch(error)
  {
    console.error('FitnessSetter error', error);
    return res.status(500).json({ message: 'Failed to set user fitness' });
  }
}
 
export async function FitnessUpdater(req, res)
{
  try
  {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
    {
      return res.status(400).json({ message: 'Invalid user id' });
    }
 
    const fitness = await UserFitness.findOne({ userId: id });
    if (!fitness)
    {
      return res.status(404).json({ message: 'Fitness record does not exist for this user' });
    }
 
    const
    {
      cardioEndurance,
      cardioRecovery,
      cardioConsistency,
      cardioGoal,
      strengthUpperBody,
      strengthLowerBody,
      strengthCore,
      strengthGoal,
      flexibilityUpperBody,
      flexibilityLowerBody,
      flexibilitySpinalMobility,
      flexibilityGoal,
      targetFitness,
      cardioWeight,
      strengthWeight,
      flexibilityWeight,
    } = req.body;
 
    const subScores =
    {
      cardioEndurance,
      cardioRecovery,
      cardioConsistency,
      strengthUpperBody,
      strengthLowerBody,
      strengthCore,
      flexibilityUpperBody,
      flexibilityLowerBody,
      flexibilitySpinalMobility,
    };
 
    const outOfRangeScores = Object.keys(subScores).filter(key => subScores[key] !== undefined && subScores[key] !== null && !isValidScore(subScores[key]));
 
    if (outOfRangeScores.length)
    {
      return res.status(400).json({ message: 'Sub-scores must be numbers between 1 and 10', fields: outOfRangeScores });
    }
 
    const goalToCurrentLevel =
    {
      cardioGoal:      fitness.cardioLevel,
      strengthGoal:    fitness.strengthLevel,
      flexibilityGoal: fitness.flexibilityLevel,
      targetFitness:   fitness.overallLevel,
    };
 
    const optionalGoals =
    {
      cardioGoal,
      strengthGoal,
      flexibilityGoal,
      targetFitness,
    };
 
    const invalidGoals = Object.keys(optionalGoals).filter(key =>
      optionalGoals[key] !== undefined &&
      optionalGoals[key] !== null &&
      (!isValidScore(optionalGoals[key]) || optionalGoals[key] <= goalToCurrentLevel[key])
    );
 
    if (invalidGoals.length)
    {
      return res.status(400).json({ message: 'Goals must be numbers between 1 and 10 and greater than current level', fields: invalidGoals });
    }
 
    const weights =
    {
      cardioWeight,
      strengthWeight,
      flexibilityWeight,
    };
 
    const weightSent = Object.keys(weights).filter(key => weights[key] !== undefined && weights[key] !== null);
    if (weightSent.length > 0)
    {
      if (cardioWeight === undefined || strengthWeight === undefined || flexibilityWeight === undefined)
      {
        return res.status(400).json({ message: 'All three weights must be provided together: cardioWeight, strengthWeight, flexibilityWeight' });
      }
 
      const outOfRangeWeights = Object.keys(weights).filter(key => typeof weights[key] !== 'number' || weights[key] < 0 || weights[key] > 1);
 
      if (outOfRangeWeights.length)
      {
        return res.status(400).json({ message: 'Weights must be numbers between 0 and 1', fields: outOfRangeWeights });
      }
 
      const weightsSum = cardioWeight + strengthWeight + flexibilityWeight;
      if (Math.round(weightsSum * 100) / 100 !== 1)
      {
        return res.status(400).json({ message: 'Weights must add up to 1' });
      }
    }
 
    const newCardioEndurance           = cardioEndurance           ?? fitness.cardioEndurance;
    const newCardioRecovery            = cardioRecovery            ?? fitness.cardioRecovery;
    const newCardioConsistency         = cardioConsistency         ?? fitness.cardioConsistency;
    const newStrengthUpperBody         = strengthUpperBody         ?? fitness.strengthUpperBody;
    const newStrengthLowerBody         = strengthLowerBody         ?? fitness.strengthLowerBody;
    const newStrengthCore              = strengthCore              ?? fitness.strengthCore;
    const newFlexibilityUpperBody      = flexibilityUpperBody      ?? fitness.flexibilityUpperBody;
    const newFlexibilityLowerBody      = flexibilityLowerBody      ?? fitness.flexibilityLowerBody;
    const newFlexibilitySpinalMobility = flexibilitySpinalMobility ?? fitness.flexibilitySpinalMobility;
 
    const newCardioWeight      = cardioWeight      ?? fitness.cardioWeight;
    const newStrengthWeight    = strengthWeight    ?? fitness.strengthWeight;
    const newFlexibilityWeight = flexibilityWeight ?? fitness.flexibilityWeight;
 
    const newCardioLevel      = calculateDefaultLevel(newCardioEndurance, newCardioRecovery, newCardioConsistency);
    const newStrengthLevel    = calculateDefaultLevel(newStrengthUpperBody, newStrengthLowerBody, newStrengthCore);
    const newFlexibilityLevel = calculateDefaultLevel(newFlexibilityUpperBody, newFlexibilityLowerBody, newFlexibilitySpinalMobility);
    const newOverallLevel     = calculateLevel(newCardioLevel, newCardioWeight, newStrengthLevel, newStrengthWeight, newFlexibilityLevel, newFlexibilityWeight);
 
    const newCardioGR      = GRCalc(fitness.cardioLevel,      newCardioLevel,      fitness.cardioGRSampleSize,      fitness.cardioGRValue,      fitness.updatedAt);
    const newStrengthGR    = GRCalc(fitness.strengthLevel,    newStrengthLevel,    fitness.strengthGRSampleSize,    fitness.strengthGRValue,    fitness.updatedAt);
    const newFlexibilityGR = GRCalc(fitness.flexibilityLevel, newFlexibilityLevel, fitness.flexibilityGRSampleSize, fitness.flexibilityGRValue, fitness.updatedAt);
    const newOverallGR     = GRCalc(fitness.overallLevel,     newOverallLevel,     fitness.overallGRSampleSize,     fitness.overallGRValue,     fitness.updatedAt);
 
    const newCardioGoal      = cardioGoal      ?? generateGoal(newCardioLevel,   newCardioGR.value);
    const newStrengthGoal    = strengthGoal    ?? generateGoal(newStrengthLevel,  newStrengthGR.value);
    const newFlexibilityGoal = flexibilityGoal ?? generateGoal(newFlexibilityLevel, newFlexibilityGR.value);
    const newTargetFitness   = targetFitness   ?? generateGoal(newOverallLevel,  newOverallGR.value);
 
    const projectedCompletionDate = newCD(newOverallLevel, newTargetFitness, newOverallGR.value);
 
    const snapshot =
    {
      takenAt: new Date(),
      cardioLevel:      newCardioLevel,
      strengthLevel:    newStrengthLevel,
      flexibilityLevel: newFlexibilityLevel,
      overallLevel:     newOverallLevel,
    };
 
    const updatedFitness = await UserFitness.findOneAndUpdate(
      { userId: id },
      {
        $set:
        {
          cardioEndurance:        newCardioEndurance,
          cardioRecovery:         newCardioRecovery,
          cardioConsistency:      newCardioConsistency,
          cardioLevel:            newCardioLevel,
          cardioGoal:             newCardioGoal,
          cardioGoalUserAdjusted: !!cardioGoal,
 
          strengthUpperBody:        newStrengthUpperBody,
          strengthLowerBody:        newStrengthLowerBody,
          strengthCore:             newStrengthCore,
          strengthLevel:            newStrengthLevel,
          strengthGoal:             newStrengthGoal,
          strengthGoalUserAdjusted: !!strengthGoal,
 
          flexibilityUpperBody:        newFlexibilityUpperBody,
          flexibilityLowerBody:        newFlexibilityLowerBody,
          flexibilitySpinalMobility:   newFlexibilitySpinalMobility,
          flexibilityLevel:            newFlexibilityLevel,
          flexibilityGoal:             newFlexibilityGoal,
          flexibilityGoalUserAdjusted: !!flexibilityGoal,
 
          cardioWeight:      newCardioWeight,
          strengthWeight:    newStrengthWeight,
          flexibilityWeight: newFlexibilityWeight,
 
          overallLevel:       newOverallLevel,
          targetFitness:      newTargetFitness,
          targetUserAdjusted: !!targetFitness,
 
          cardioGRValue:      newCardioGR.value,
          strengthGRValue:    newStrengthGR.value,
          flexibilityGRValue: newFlexibilityGR.value,
          overallGRValue:     newOverallGR.value,
 
          cardioGRSampleSize:      newCardioGR.sampleSize,
          strengthGRSampleSize:    newStrengthGR.sampleSize,
          flexibilityGRSampleSize: newFlexibilityGR.sampleSize,
          overallGRSampleSize:     newOverallGR.sampleSize,
 
          cardioGRLastUpdated:      new Date(),
          strengthGRLastUpdated:    new Date(),
          flexibilityGRLastUpdated: new Date(),
          overallGRLastUpdated:     new Date(),
 
          projectedCompletionDate,
          lastProjectionUpdate: new Date(),
 
          onboardingComplete: true,
        },
        $push: { assessmentHistory: snapshot },
      },
      { new: true },
    );
 
    return res.status(200).json(updatedFitness);
  }
  catch(error)
  {
    console.error('FitnessUpdater error', error);
    return res.status(500).json({ message: 'Failed to update user fitness' });
  }
}
export function isValidScore(val)
{
  if (typeof val === 'number' && val >= 1 && val <= 10)
  {
    return true;
  }
  else
  {
    return false;
  }
}
export function calculateDefaultLevel(x, y, z)
{
  return Math.round((x+y+z)/3);
}
export function calculateLevel(x, xw, y, yw, z, zw)
{
  return Math.round((x * xw + y * yw + z * zw) / (xw + yw + zw));
}
export function generateDefaultGoal(x)
{
  const goal = x+1;
  if (goal <= 10)
  {
    return goal;
  }
  else
  {
    return 10;
  }
}
export function generateGoal(x, y)
{
  let goal = Math.round(x + y);
  if (goal === x)
  {
    goal += 1;
  }
  if (goal <= 10)
  {
    return goal;
  }
  else
  {
    return 10;
  }
}
export function GRCalc(prevLevel, newLevel, prevSampleSize, prevAverageRate, lastUpdated)
{
  if (!lastUpdated)
  {
    return { value: 0, sampleSize: 1 };
  }

  const msPerWeek      = 1000 * 60 * 60 * 24 * 7;
  const weeksSinceLast = (Date.now() - new Date(lastUpdated).getTime()) / msPerWeek;

  if (weeksSinceLast === 0)
  {
    return { value: prevAverageRate, sampleSize: prevSampleSize };
  }

  const currentRate   = (newLevel - prevLevel) / weeksSinceLast;
  const newSampleSize = prevSampleSize + 1;
  const averagedRate  = parseFloat(((prevAverageRate * prevSampleSize + currentRate) / newSampleSize).toFixed(4));

  return { value: averagedRate, sampleSize: newSampleSize };
}
export function newCD(currentLevel, targetLevel, growthRatePerWeek)
{
  if (growthRatePerWeek <= 0 || currentLevel >= targetLevel)
  {
    return null;
  }

  const weeksNeeded   = (targetLevel - currentLevel) / growthRatePerWeek;
  const msNeeded      = weeksNeeded * 7 * 24 * 60 * 60 * 1000;
  const projectedDate = new Date(Date.now() + msNeeded);

  return projectedDate;
}

export async function AI_Nutrition(req, res)
{
  try
  {
    validateInput(req.body);
    const guide = await fetchNutritionGuide(req.body)
    return res.status(200).json(guide)
  }
  catch (error)
  {
    console.error('AI Nutrition Guide error', error);
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ message: error?.message || 'Failed to fetch Nutrition Guide' });
  }
}

function validateInput(userInput) {
  const { age, weight_kg, height_cm, goal, activity_level } = userInput;

  if (!age || age < 10 || age > 120)         throw new Error("Invalid age.");
  if (!weight_kg || weight_kg < 20)          throw new Error("Invalid weight.");
  if (!height_cm || height_cm < 50)          throw new Error("Invalid height.");
  if (!goal)                                 throw new Error("Goal is required.");
  if (!activity_level)                       throw new Error("Activity level is required.");

  const validGoals = ["weight_loss", "muscle_gain", "maintenance", "endurance"];
  const validLevels = ["sedentary", "light", "moderate", "active", "very_active"];

  if (!validGoals.includes(goal))            throw new Error("Invalid goal.");
  if (!validLevels.includes(activity_level)) throw new Error("Invalid activity level.");
}

async function fetchNutritionGuide(userInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is missing on backend');
    error.statusCode = 503;
    throw error;
  }

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const { age, weight_kg, height_cm, goal, activity_level } = userInput;

  const requestBody = {
    contents: [{
      parts: [{
        text: `Provide a nutrition guide for: 
        Age ${age}, 
        Weight ${weight_kg}kg, 
        Height ${height_cm}cm, 
        Goal ${goal}, 
        Activity ${activity_level}. 
        Return JSON following this structure: 
        { "daily_calories": number, 
         "macros": { "protein_g": number, 
         "carbs_g": number, 
         "fat_g": number }, 
         "meal_count": number, 
         "recommended_meal_types": [string], 
         "hydration_liters": number, 
         "notes": string }`
      }]
    }]
  };

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) throw new Error("Rate limit exceeded. Try again in 60 seconds.");
      throw new Error(`API Error: ${response.status} — ${errText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) throw new Error("Empty response from AI");

    const jsonText = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '');

    return JSON.parse(jsonText);

  } catch (error) {
    console.error("AI Fetch Error:", error.message);
    throw error;
  }
}

export async function AI_imageScan(req, res) {
  const apiKey = process.env.SPOONACULAR_API_KEY;

  console.log("Using API Key:", apiKey ? "Key Found" : "Key MISSING");

  const SPOONACULAR_API_URL = "https://api.spoonacular.com/food/images/analyze";
  try
  {
    if (!req.file)
    {
      return res.status(400).json({ message: 'No image file provided' });
    }

    if (!apiKey) {
      return res.status(503).json({ message: 'SPOONACULAR_API_KEY is missing on backend' });
    }

    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', blob, req.file.originalname);

    const spoonacularResponse = await fetch(
      `${SPOONACULAR_API_URL}?apiKey=${apiKey}`,
      { method: "POST",
        body: formData,
       }
    );

    if (!spoonacularResponse.ok)
    {
      const errText = await spoonacularResponse.text();
      return res.status(spoonacularResponse.status).json({
        message: `Image scan API error: ${spoonacularResponse.status} ${spoonacularResponse.statusText}`,
        details: errText,
      });
    }

    const result = await spoonacularResponse.json();
    return res.status(200).json(result);

  }
  catch (error)
  {
    console.error('AI Image Scan error:', error);
    return res.status(500).json({ message: error?.message || 'Failed to analyze image' });
  }
}

export async function getStepTracker(req, res)
{
  try
  {
    const { id } = req.params
    const stepInfo = await StepTracker.findOne({userId: id});
    if (!stepInfo)
    {
      stepInfo = await StepTracker.create(
      {
        userId: id,
        startingDate: new Date(),
      });
    }
    return res.status(200).json(stepInfo);
  }
  catch(error)
  {
    console.error('getStepTracker error:', error);
    return res.status(500).json({ message: 'Failed to fetch step tracker' });
  }
}

export async function updateStepGoal(req, res)
{
  try
  {
    const { id } = req.params;
    const { dailyStepGoal, weeklyStepGoal } = req.body;
    const tracker = await StepTracker.findOneAndUpdate(
      { userId: id },
      {
        dailyStepGoal,
        weeklyStepGoal
      },
      { new: true, upsert: true }
    );
    return res.status(200).json(tracker);
  }
  catch (error)
  {
    console.error('updateStepGoal error:', error);
    return res.status(500).json({ message: 'Failed to update step goal' });
  }
}

export async function logSteps(req, res) {
  try {
    const { id }    = req.params;
    const { steps } = req.body;

    const stepCount = Number(steps);
    if (!Number.isFinite(stepCount) || stepCount < 0)
      return res.status(400).json({ message: 'Invalid step count' });

    const today = toMidnight(new Date());

    let tracker = await StepTracker.findOne({ userId: id });
    if (!tracker) {
      tracker = await StepTracker.create({
        userId:       id,
        startingDate: today,
      });
    }

    let todayEntry = tracker.dailyHistory.find(e => isSameDay(e.date, today));
    const previousSteps = todayEntry?.steps ?? 0;

    if (!todayEntry) {
      tracker.dailyHistory.push({ date: today, steps: 0 });
      todayEntry = tracker.dailyHistory[tracker.dailyHistory.length - 1];
    }

    todayEntry.steps          = stepCount;
    todayEntry.distance       = calculateDistance(stepCount, tracker.strideLength);
    todayEntry.caloriesBurned = 100;//fix calorieCalc
    todayEntry.activeMinutes  = calculateActiveMin(stepCount);
    todayEntry.goalMet        = stepCount >= tracker.dailyStepGoal;

    const delta             = stepCount - previousSteps;
    tracker.allTimeSteps    = (tracker.allTimeSteps ?? 0) + delta;

    const daysSinceStart    = Math.max(1, daysBetween(tracker.startingDate, today) + 1);
    tracker.avgDailySteps   = Math.round(tracker.allTimeSteps / daysSinceStart);
    tracker.avgWeeklySteps  = Math.round(tracker.avgDailySteps * 7);

    if (stepCount > (tracker.bestDailySteps ?? 0)) {
      tracker.bestDailySteps = stepCount;
      tracker.bestDailyDate  = today;
    }

    const weeklyTotal = weeklyStepsUpTo(tracker.dailyHistory, today);
    if (weeklyTotal > (tracker.bestWeeklySteps ?? 0))
      tracker.bestWeeklySteps = weeklyTotal;

    tracker.weeklyGoalMet = weeklyTotal >= tracker.weeklyStepGoal;

    const lastActive = tracker.lastActiveDate;

    if (!lastActive || isSameDay(lastActive, today)) {
      tracker.currentStreak = Math.max(tracker.currentStreak, 1);

    } else {
      const gap = daysBetween(lastActive, today);

      if (gap === 1) {
        tracker.currentStreak = (tracker.currentStreak ?? 0) + 1;
      } else {
        tracker.currentStreak = 1;
      }
    }

    if (tracker.currentStreak > (tracker.longestStreak ?? 0))
      tracker.longestStreak = tracker.currentStreak;

    tracker.lastActiveDate = today;

    await tracker.save();

    return res.status(200).json({
      message:       'Steps logged successfully',
      today: {
        steps:          todayEntry.steps,
        distance:       todayEntry.distance,
        caloriesBurned: todayEntry.caloriesBurned,
        activeMinutes:  todayEntry.activeMinutes,
        goalMet:        todayEntry.goalMet,
      },
      stats: {
        allTimeSteps:   tracker.allTimeSteps,
        avgDailySteps:  tracker.avgDailySteps,
        avgWeeklySteps: tracker.avgWeeklySteps,
        weeklyTotal,
        weeklyGoalMet:  tracker.weeklyGoalMet,
        currentStreak:  tracker.currentStreak,
        longestStreak:  tracker.longestStreak,
        bestDailySteps: tracker.bestDailySteps,
        bestWeeklySteps:tracker.bestWeeklySteps,
      },
    });

  } catch (error) {
    console.error('logSteps error:', error);
    return res.status(500).json({ message: 'Failed to log steps' });
  }
}
export async function getStepHistory(req, res) {

  try
  {
    const { id } = req.params;
    const { range } = req.query;
    const tracker = await StepTracker.findOne({ userId: id });
    if (!tracker)
    {
      return res.status(404).json({ message: 'No tracker found' });
    }

    let history = tracker.dailyHistory;
    const now = new Date();

    if (range === 'week')
    {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        history = history.filter(e => new Date(e.date) >= startOfWeek);
    }
    else if (range === 'month')
    {
      const startOfMonth = new Date(now);
      startOfMonth.setDate(now.getDate() - 30);
      history = history.filter(e => new Date(e.date) >= startOfMonth);
    }

    return res.status(200).json(history);
  }
  catch (error)
  {
    console.error('getStepHistory error:', error);
    return res.status(500).json({ message: 'Failed to fetch step history' });
  }
}

export async function resetDailySteps(req, res)
{
  const { id } = req.params;
  try
  {
    const tracker = await StepTracker.findOneAndUpdate(
      { userId: id },
      {
        dailySteps: 0,
        dailyDistance: 0,
        dailyCaloriesBurned: 0,
        dailyActiveMinutes: 0,
        dailyGoalMet: false,
      },
      { new: true }
    );
    return res.status(200).json(tracker);
  }
  catch (error)
  {
    console.error('resetDailySteps error:', error);
    return res.status(500).json({ message: 'Failed to reset daily steps' });
  }
}
const MS_PER_DAY = 86_400_000;

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

function toMidnight(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(a, b) {
  return Math.round((toMidnight(b) - toMidnight(a)) / MS_PER_DAY);
}

function weeklyStepsUpTo(dailyHistory, date)
{
  const start   = toMidnight(date);
  start.setDate(start.getDate() - 6);
  const end     = toMidnight(date);

  return dailyHistory
    .filter(e => e.date >= start && e.date <= end)
    .reduce((sum, e) => sum + e.steps, 0);
}
function calculateDistance(steps, length)
{
  return steps*length;
}

function calculateActiveMin(steps)
{
  return Math.floor(steps/100);
}

function sendChatPlaceholder(res, action) {
  return res.status(501).json({
    message: `Chat ${action} is scaffolded but not implemented yet`,
  });
}

async function verifyUserInBuddyPair(userId, buddyPairId) {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(buddyPairId)) {
    return false;
  }

  const pair = await BuddyPair.findOne({ _id: buddyPairId, members: userId, status: 'active' }).select('_id');
  return Boolean(pair);
}

export async function getChatMessages(req, res) {
  try {
    const { id, buddyPairId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(buddyPairId)) {
      return res.status(400).json({ message: 'Invalid user id or buddy pair id' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) return res.status(404).json({ message: 'User not found' });

    const isMember = await verifyUserInBuddyPair(id, buddyPairId);
    if (!isMember) return res.status(403).json({ message: 'User is not a member of this buddy pair' });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? new Date(req.query.before) : null;
    const after = req.query.after ? new Date(req.query.after) : null;

    const filter = { buddyPairId };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lt: before };
    if (after && !Number.isNaN(after.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $gt: after };

    const messages = await ChatMessage.find(filter).sort({ createdAt: 1 }).limit(limit).lean();

    return res.status(200).json({ buddyPairId, messages });
  } catch (error) {
    console.error('getChatMessages error:', error);
    return res.status(500).json({ message: 'Failed to fetch chat messages' });
  }
}

export async function sendChatMessage(req, res) {
  try {
    const { id, buddyPairId } = req.params;
    const { text } = req.body || {};

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(buddyPairId)) {
      return res.status(400).json({ message: 'Invalid user id or buddy pair id' });
    }

    const user = await Users.findById(id).select('_id name');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMember = await verifyUserInBuddyPair(id, buddyPairId);
    if (!isMember) return res.status(403).json({ message: 'User is not a member of this buddy pair' });

    const message = await ChatMessage.create({
      buddyPairId,
      senderId: id,
      text: typeof text === 'string' ? text.trim() : '',
    });

    // emit realtime event if socket server is available
    try {
      const io = req.app?.get('io');
      if (io) io.to(String(buddyPairId)).emit('chat:message', message);
    } catch (emitErr) {
      console.warn('Failed to emit socket event:', emitErr && emitErr.message);
    }

    return res.status(201).json({ message });
  } catch (error) {
    console.error('sendChatMessage error:', error);
    return res.status(500).json({ message: 'Failed to send message' });
  }
}

export async function markChatMessagesRead(req, res) {
  try {
    const { id, buddyPairId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(buddyPairId)) {
      return res.status(400).json({ message: 'Invalid user id or buddy pair id' });
    }

    const isMember = await verifyUserInBuddyPair(id, buddyPairId);
    if (!isMember) return res.status(403).json({ message: 'User is not a member of this buddy pair' });

    const now = new Date();
    const result = await ChatMessage.updateMany(
      { buddyPairId, senderId: { $ne: id }, readAt: null },
      { $set: { readAt: now } }
    );

    return res.status(200).json({ modifiedCount: result.modifiedCount || result.nModified || 0 });
  } catch (error) {
    console.error('markChatMessagesRead error:', error);
    return res.status(500).json({ message: 'Failed to mark messages read' });
  }
}

function getMondayStart(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekWindow(date) {
  const start = getMondayStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatWeekKey(date) {
  const weekStart = getMondayStart(date);
  return weekStart.toISOString().slice(0, 10);
}

function buildLastSevenWeeks(referenceDate = new Date()) {
  const currentStart = getMondayStart(referenceDate);
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - ((6 - index) * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return {
      weekStartDate: start,
      weekEndDate: end,
      weekKey: start.toISOString().slice(0, 10),
    };
  });
}

function normalizeHabitGoalType(category, goalType) {
  if (goalType === 'do' || goalType === 'avoid') {
    return goalType;
  }

  return category === 'bad' ? 'avoid' : 'do';
}

function normalizeHabitTargetCount(category, goalType, targetCount) {
  const parsed = Number(targetCount);

  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return normalizeHabitGoalType(category, goalType) === 'avoid' ? 0 : 1;
}

function buildHabitWeeklyProgress(habit, weeks) {
  const logs = Array.isArray(habit.logs) ? habit.logs : [];
  const countsByWeek = new Map();

  for (const log of logs) {
    const loggedDate = new Date(log.loggedAt || log.createdAt || new Date());
    const weekKey = formatWeekKey(loggedDate);
    countsByWeek.set(weekKey, (countsByWeek.get(weekKey) || 0) + 1);
  }

  return weeks.map((week) => {
    const occurrenceCount = countsByWeek.get(week.weekKey) || 0;
    const goalType = habit.goalType || normalizeHabitGoalType(habit.category, habit.goalType);
    const targetCount = Number.isInteger(habit.targetCount) ? habit.targetCount : normalizeHabitTargetCount(habit.category, goalType);
    const met = goalType === 'avoid'
      ? occurrenceCount <= targetCount
      : occurrenceCount >= targetCount;

    return {
      weekStartDate: week.weekStartDate,
      weekEndDate: week.weekEndDate,
      occurrenceCount,
      targetCount,
      status: met ? 'green' : 'red',
      met,
    };
  });
}

function splitHabitsByCategory(habits, weeks) {
  const good = [];
  const bad = [];

  for (const habit of habits) {
    const row = {
      habitId: habit._id,
      name: habit.name,
      category: habit.category,
      source: habit.source,
      goalType: habit.goalType,
      targetCount: habit.targetCount,
      isActive: habit.isActive,
      weeklyProgress: buildHabitWeeklyProgress(habit, weeks),
    };

    if (habit.category === 'bad') {
      bad.push(row);
    } else {
      good.push(row);
    }
  }

  return { good, bad };
}

export async function getHabitLibrary(req, res) {
  return res.status(200).json({
    good: PREDEFINED_GOOD_HABITS,
    bad: PREDEFINED_BAD_HABITS,
  });
}

export async function getUserHabits(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const weeks = buildLastSevenWeeks();
    const habits = await Habit.find({ userId: id, isActive: true }).sort({ createdAt: -1 }).lean();
    const tables = splitHabitsByCategory(habits, weeks);

    return res.status(200).json({
      userId: id,
      weeks: weeks.map((week) => ({
        weekStartDate: week.weekStartDate,
        weekEndDate: week.weekEndDate,
        weekKey: week.weekKey,
      })),
      goodHabits: tables.good,
      badHabits: tables.bad,
    });
  } catch (error) {
    console.error('getUserHabits error:', error);
    return res.status(500).json({ message: 'Failed to fetch habits' });
  }
}

export async function createHabit(req, res) {
  try {
    const { id } = req.params;
    const { name, category, goalType, targetCount, source } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedCategory = category === 'good' || category === 'bad' ? category : '';

    if (!normalizedName || !normalizedCategory) {
      return res.status(400).json({ message: 'name and category are required' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resolvedGoalType = normalizeHabitGoalType(normalizedCategory, goalType);
    const resolvedTargetCount = normalizeHabitTargetCount(normalizedCategory, resolvedGoalType, targetCount);

    const habit = await Habit.create({
      userId: id,
      name: normalizedName,
      category: normalizedCategory,
      source: source === 'predefined' ? 'predefined' : 'custom',
      goalType: resolvedGoalType,
      targetCount: resolvedTargetCount,
      isActive: true,
      logs: [],
    });

    return res.status(201).json({ habit });
  } catch (error) {
    console.error('createHabit error:', error);
    return res.status(500).json({ message: 'Failed to create habit' });
  }
}

export async function logHabitOccurrence(req, res) {
  try {
    const { id, habitId } = req.params;
    const { note } = req.body || {};

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(habitId)) {
      return res.status(400).json({ message: 'Invalid user id or habit id' });
    }

    const habit = await Habit.findOne({ _id: habitId, userId: id, isActive: true });
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    habit.logs.push({
      loggedAt: new Date(),
      note: typeof note === 'string' ? note.trim() : null,
    });

    await habit.save();

    return res.status(201).json({ habit });
  } catch (error) {
    console.error('logHabitOccurrence error:', error);
    return res.status(500).json({ message: 'Failed to log habit occurrence' });
  }
}

export async function updateHabitGoal(req, res) {
  try {
    const { id, habitId } = req.params;
    const { goalType, targetCount, name, category } = req.body || {};

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(habitId)) {
      return res.status(400).json({ message: 'Invalid user id or habit id' });
    }

    const habit = await Habit.findOne({ _id: habitId, userId: id, isActive: true });
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    if (typeof name === 'string' && name.trim()) {
      habit.name = name.trim();
    }

    if (category === 'good' || category === 'bad') {
      habit.category = category;
    }

    habit.goalType = normalizeHabitGoalType(habit.category, goalType || habit.goalType);
    habit.targetCount = normalizeHabitTargetCount(habit.category, habit.goalType, targetCount ?? habit.targetCount);

    await habit.save();

    return res.status(200).json({ habit });
  } catch (error) {
    console.error('updateHabitGoal error:', error);
    return res.status(500).json({ message: 'Failed to update habit goal' });
  }
}

export async function deleteHabit(req, res) {
  try {
    const { id, habitId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(habitId)) {
      return res.status(400).json({ message: 'Invalid user id or habit id' });
    }

    const result = await Habit.deleteOne({ _id: habitId, userId: id });
    return res.status(200).json({ deletedCount: result.deletedCount || 0 });
  } catch (error) {
    console.error('deleteHabit error:', error);
    return res.status(500).json({ message: 'Failed to delete habit' });
  }
}

function getCalendarMonthWindow(monthValue = new Date()) {
  const referenceDate = new Date(monthValue);
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getDateKey(date) {
  const day = new Date(date);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const datePart = String(day.getDate()).padStart(2, '0');
  return `${year}-${month}-${datePart}`;
}

function buildCalendarDays(start, end) {
  const days = [];
  const dayCursor = new Date(start);

  while (dayCursor <= end) {
    const dateKey = getDateKey(dayCursor);
    days.push({
      date: new Date(dayCursor),
      dateKey,
      items: [],
      counts: {
        workouts: 0,
        habits: 0,
        calories: 0,
        steps: 0,
        goals: 0,
        challenges: 0,
        sessions: 0,
      },
    });
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return days;
}

function addCalendarItem(dayMap, date, item) {
  if (!date) {
    return;
  }

  const dayKey = getDateKey(date);
  const bucket = dayMap.get(dayKey);

  if (!bucket) {
    return;
  }

  bucket.items.push(item);

  if (item.group && bucket.counts[item.group] !== undefined) {
    bucket.counts[item.group] += 1;
  }
}

function summarizeCalendarDays(days) {
  return days.map((day) => ({
    date: day.date,
    dateKey: day.dateKey,
    items: day.items.sort((a, b) => new Date(a.date || a.startDate || 0) - new Date(b.date || b.startDate || 0)),
    counts: day.counts,
  }));
}

export async function getCalendarView(req, res) {
  try {
    const { id } = req.params;
    const monthParam = typeof req.query.month === 'string' && req.query.month.trim() ? req.query.month.trim() : null;
    const referenceMonth = monthParam ? new Date(`${monthParam}-01T00:00:00.000Z`) : new Date();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (Number.isNaN(referenceMonth.getTime())) {
      return res.status(400).json({ message: 'Invalid month value. Use YYYY-MM.' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { start, end } = getCalendarMonthWindow(referenceMonth);
    const days = buildCalendarDays(start, end);
    const dayMap = new Map(days.map((day) => [day.dateKey, day]));

    const [stepTracker, calorieIntakes, calorieTrackers, habits, weeklyGoals, buddyChallenges, buddyPairs, workoutSessions] = await Promise.all([
      StepTracker.findOne({ userId: id }).lean(),
      CalorieIntake.find({ userId: id, date: { $gte: start, $lte: end } }).sort({ date: 1 }).lean(),
      CalorieTracker.find({ userId: id, date: { $gte: start, $lte: end } }).sort({ date: 1 }).lean(),
      Habit.find({ userId: id, isActive: true }).lean(),
      WeeklyGoal.find({ participants: id }).sort({ startDate: 1 }).lean(),
      BuddyChallenge.find({ $or: [{ challenger: id }, { target: id }] }).sort({ createdAt: 1 }).lean(),
      BuddyPair.find({ members: id }).select('_id').lean(),
      ActiveWorkoutModelSession.find({ userId: id, startTime: { $gte: start, $lte: end } }).sort({ startTime: 1 }).lean(),
    ]);

    const buddyPairIds = buddyPairs.map((pair) => pair._id);
    const buddyWorkouts = buddyPairIds.length > 0
      ? await BuddyWorkout.find({ buddyPairId: { $in: buddyPairIds } }).lean()
      : [];

    for (const entry of stepTracker?.dailyHistory || []) {
      const entryDate = new Date(entry.date);
      if (entryDate >= start && entryDate <= end) {
        addCalendarItem(dayMap, entryDate, {
          group: 'steps',
          type: 'step_goal',
          title: `Steps: ${entry.steps || 0}`,
          status: entry.goalMet ? 'green' : 'red',
          date: entryDate,
          meta: {
            steps: entry.steps || 0,
            distance: entry.distance || 0,
            caloriesBurned: entry.caloriesBurned || 0,
            activeMinutes: entry.activeMinutes || 0,
            goalMet: Boolean(entry.goalMet),
          },
        });
      }
    }

    for (const entry of calorieIntakes) {
      const entryDate = new Date(entry.date);
      addCalendarItem(dayMap, entryDate, {
        group: 'calories',
        type: 'calorie_intake',
        title: entry.foodName,
        status: 'info',
        date: entryDate,
        meta: {
          intakeCalories: entry.intakeCalories,
          grams: entry.grams,
          quantity: entry.quantity,
          source: entry.source,
        },
      });
    }

    for (const entry of calorieTrackers) {
      const entryDate = new Date(entry.date);
      addCalendarItem(dayMap, entryDate, {
        group: 'calories',
        type: 'calorie_tracker',
        title: `Calorie log: ${entry.workout}`,
        status: entry.goalmet ? 'green' : 'red',
        date: entryDate,
        meta: {
          weight: entry.weight,
          goal: entry.goal,
          workout: entry.workout,
          duration: entry.duration,
          calories: entry.calories,
          goalmet: Boolean(entry.goalmet),
        },
      });
    }

    for (const habit of habits) {
      for (const log of habit.logs || []) {
        const logDate = new Date(log.loggedAt || log.createdAt || new Date());
        if (logDate >= start && logDate <= end) {
          addCalendarItem(dayMap, logDate, {
            group: 'habits',
            type: habit.category === 'bad' ? 'bad_habit' : 'good_habit',
            title: habit.name,
            status: habit.category === 'bad' ? 'red' : 'green',
            date: logDate,
            meta: {
              note: log.note || null,
              goalType: habit.goalType,
              category: habit.category,
              source: habit.source,
            },
          });
        }
      }
    }

    for (const goal of weeklyGoals) {
      if (goal.startDate) {
        addCalendarItem(dayMap, goal.startDate, {
          group: 'goals',
          type: 'weekly_goal_start',
          title: `Weekly goal starts: ${goal.weeklyWorkoutGoal}`,
          status: 'info',
          date: goal.startDate,
          meta: {
            weeklyWorkoutGoal: goal.weeklyWorkoutGoal,
            stake: goal.stake,
            goalId: goal._id,
          },
        });
      }

      if (goal.endDate) {
        addCalendarItem(dayMap, goal.endDate, {
          group: 'goals',
          type: 'weekly_goal_end',
          title: `Weekly goal ends: ${goal.weeklyWorkoutGoal}`,
          status: 'info',
          date: goal.endDate,
          meta: {
            weeklyWorkoutGoal: goal.weeklyWorkoutGoal,
            stake: goal.stake,
            goalId: goal._id,
          },
        });
      }
    }

    for (const challenge of buddyChallenges) {
      if (challenge.createdAt) {
        addCalendarItem(dayMap, challenge.createdAt, {
          group: 'challenges',
          type: 'challenge_created',
          title: `Challenge: ${challenge.workoutType}`,
          status: challenge.status === 'approved' ? 'green' : challenge.status === 'rejected' ? 'red' : 'info',
          date: challenge.createdAt,
          meta: {
            challengeId: challenge._id,
            points: challenge.points,
            deadline: challenge.deadline,
            challengeStatus: challenge.status,
          },
        });
      }

      if (challenge.deadline) {
        addCalendarItem(dayMap, challenge.deadline, {
          group: 'challenges',
          type: 'challenge_deadline',
          title: `Challenge deadline: ${challenge.workoutType}`,
          status: challenge.status === 'approved' ? 'green' : challenge.status === 'rejected' ? 'red' : 'red',
          date: challenge.deadline,
          meta: {
            challengeId: challenge._id,
            points: challenge.points,
            challengeStatus: challenge.status,
          },
        });
      }
    }

    for (const session of workoutSessions) {
      if (session.startTime) {
        addCalendarItem(dayMap, session.startTime, {
          group: 'sessions',
          type: 'workout_session',
          title: 'Workout session',
          status: 'info',
          date: session.startTime,
          meta: {
            sessionId: session._id,
            modelId: session.modelId,
            progressCount: Array.isArray(session.progress) ? session.progress.length : 0,
          },
        });
      }
    }

    for (const buddyWorkout of buddyWorkouts) {
      for (const entry of buddyWorkout.weeklyHistory || []) {
        const entryDate = new Date(entry.date);
        if (entryDate >= start && entryDate <= end) {
          addCalendarItem(dayMap, entryDate, {
            group: 'workouts',
            type: 'buddy_weekly_workout',
            title: `Weekly workout entries: ${(entry.workouts || []).length}`,
            status: (entry.workouts || []).length > 0 ? 'green' : 'red',
            date: entryDate,
            meta: {
              buddyPairId: buddyWorkout.buddyPairId,
              workoutCount: (entry.workouts || []).length,
            },
          });
        }
      }
    }

    return res.status(200).json({
      userId: id,
      month: getDateKey(start).slice(0, 7),
      range: {
        startDate: start,
        endDate: end,
      },
      days: summarizeCalendarDays(days),
    });
  } catch (error) {
    console.error('getCalendarView error:', error);
    return res.status(500).json({ message: 'Failed to build calendar view' });
  }
}

export async function getWidgetConfig(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    let config = await WidgetConfig.findOne({ userId: id });

    if (!config) {
      // Return default config if none exists
      config = {
        userId: id,
        widgetsEnabled: [
          { type: 'streak', size: 'small', metrics: ['current'], enabled: true },
          { type: 'steps', size: 'medium', metrics: ['current', 'goal', 'percentage'], enabled: true },
          { type: 'calories', size: 'medium', metrics: ['current', 'goal'], enabled: true },
          { type: 'goals', size: 'small', metrics: ['count'], enabled: true },
          { type: 'habits', size: 'medium', metrics: ['completed', 'total'], enabled: true },
        ],
        refreshInterval: 3600,
        theme: 'auto',
      };
    }

    return res.status(200).json(config);
  } catch (error) {
    console.error('getWidgetConfig error:', error);
    return res.status(500).json({ message: 'Failed to retrieve widget config' });
  }
}

export async function saveWidgetConfig(req, res) {
  try {
    const { id } = req.params;
    const { widgetsEnabled, refreshInterval, theme } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const config = await WidgetConfig.findOneAndUpdate(
      { userId: id },
      {
        userId: id,
        widgetsEnabled: widgetsEnabled || [],
        refreshInterval: refreshInterval || 3600,
        theme: theme || 'auto',
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ message: 'Widget config saved', config });
  } catch (error) {
    console.error('saveWidgetConfig error:', error);
    return res.status(500).json({ message: 'Failed to save widget config' });
  }
}

export async function getWidgetData(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [stepTracker, calorieTracker, habits, weeklyGoals, userFitness, buddyWorkouts] = await Promise.all([
      StepTracker.findOne({ userId: id }).lean(),
      CalorieTracker.findOne({ userId: id }).sort({ date: -1 }).lean(),
      Habit.find({ userId: id, isActive: true }).lean(),
      WeeklyGoal.findOne({ participants: id }).sort({ startDate: -1 }).lean(),
      UserFitness.findOne({ userId: id }).lean(),
      BuddyWorkout.find({ members: id }).lean(),
    ]);

    const user = await Users.findById(id).select('streak goals').lean();

    // Calculate metrics
    const widgetData = {
      userId: id,
      timestamp: new Date(),
      metrics: {
        streak: {
          type: 'streak',
          current: user?.streak?.current || 0,
          lastWorkoutDate: user?.streak?.lastWorkoutDate || null,
        },
        steps: {
          type: 'steps',
          current: stepTracker?.dailySteps || 0,
          goal: stepTracker?.dailyGoal || 10000,
          percentage: stepTracker ? Math.round(((stepTracker.dailySteps || 0) / (stepTracker.dailyGoal || 10000)) * 100) : 0,
          goalMet: (stepTracker?.dailySteps || 0) >= (stepTracker?.dailyGoal || 10000),
        },
        calories: {
          type: 'calories',
          current: calorieTracker?.calories || 0,
          goal: user?.goals?.calorieGoal || 2000,
          percentage: user ? Math.round(((calorieTracker?.calories || 0) / (user.goals?.calorieGoal || 2000)) * 100) : 0,
          goalMet: (calorieTracker?.calories || 0) >= (user?.goals?.calorieGoal || 2000),
        },
        goals: {
          type: 'goals',
          active: weeklyGoals ? 1 : 0,
          completed: 0,
          total: 1,
        },
        habits: {
          type: 'habits',
          total: habits.length,
          completed: habits.filter((h) => (h.logs || []).length > 0).length,
          goodHabits: habits.filter((h) => h.category === 'good').length,
          badHabits: habits.filter((h) => h.category === 'bad').length,
        },
      },
    };

    return res.status(200).json(widgetData);
  } catch (error) {
    console.error('getWidgetData error:', error);
    return res.status(500).json({ message: 'Failed to fetch widget data' });
  }
}

function buildDefaultNotificationPreferences(userId) {
  return {
    userId,
    enabled: true,
    types: {
      streak: true,
      steps: true,
      goals: true,
      habits: false,
    },
    frequencyMinutes: 720,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
    },
    inactivityDays: 2,
    tone: 'encouraging',
    deviceTokens: [],
  };
}

export async function getNotificationPreferences(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    let preferences = await NotificationPreference.findOne({ userId: id }).lean();

    if (!preferences) {
      preferences = buildDefaultNotificationPreferences(id);
    }

    return res.status(200).json(preferences);
  } catch (error) {
    console.error('getNotificationPreferences error:', error);
    return res.status(500).json({ message: 'Failed to load notification preferences' });
  }
}

export async function saveNotificationPreferences(req, res) {
  try {
    const { id } = req.params;
    const {
      enabled,
      types,
      frequencyMinutes,
      quietHours,
      inactivityDays,
      tone,
      deviceTokens,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const preferences = await NotificationPreference.findOneAndUpdate(
      { userId: id },
      {
        userId: id,
        enabled: typeof enabled === 'boolean' ? enabled : true,
        types: {
          streak: Boolean(types?.streak ?? true),
          steps: Boolean(types?.steps ?? true),
          goals: Boolean(types?.goals ?? true),
          habits: Boolean(types?.habits ?? false),
        },
        frequencyMinutes: Number.isFinite(Number(frequencyMinutes)) ? Number(frequencyMinutes) : 720,
        quietHours: {
          enabled: Boolean(quietHours?.enabled ?? false),
          start: typeof quietHours?.start === 'string' && quietHours.start.trim() ? quietHours.start.trim() : '22:00',
          end: typeof quietHours?.end === 'string' && quietHours.end.trim() ? quietHours.end.trim() : '07:00',
          timezone: typeof quietHours?.timezone === 'string' && quietHours.timezone.trim() ? quietHours.timezone.trim() : 'UTC',
        },
        inactivityDays: Number.isFinite(Number(inactivityDays)) ? Number(inactivityDays) : 2,
        tone: ['friendly', 'direct', 'encouraging'].includes(tone) ? tone : 'encouraging',
        deviceTokens: Array.isArray(deviceTokens)
          ? [...new Set(deviceTokens.map((token) => (typeof token === 'string' ? token.trim() : '')).filter(Boolean))]
          : [],
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ message: 'Notification preferences saved', preferences });
  } catch (error) {
    console.error('saveNotificationPreferences error:', error);
    return res.status(500).json({ message: 'Failed to save notification preferences' });
  }
}

export async function getNotificationFeed(req, res) {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const notifications = await NotificationEvent.find({ userId: id })
      .sort({ scheduledFor: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ userId: id, count: notifications.length, notifications });
  } catch (error) {
    console.error('getNotificationFeed error:', error);
    return res.status(500).json({ message: 'Failed to load notifications' });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id, notificationId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(notificationId)) {
      return res.status(400).json({ message: 'Invalid identifier' });
    }

    const notification = await NotificationEvent.findOneAndUpdate(
      { _id: notificationId, userId: id },
      { $set: { readAt: new Date(), status: 'read' } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('markNotificationRead error:', error);
    return res.status(500).json({ message: 'Failed to update notification' });
  }
}

export async function getPerformanceSummary(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const summary = await buildPerformanceSummary(id);

    if (!summary) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(summary);
  } catch (error) {
    console.error('getPerformanceSummary error:', error);
    return res.status(500).json({ message: 'Failed to build performance summary' });
  }
}

async function loadAdminUser(adminId) {
  if (!mongoose.isValidObjectId(adminId)) {
    return null;
  }

  const adminUser = await Users.findById(adminId).select('_id name email role moderationStatus').lean();
  if (!adminUser || adminUser.role !== 'admin') {
    return null;
  }

  const status = adminUser.moderationStatus?.status || 'active';
  if (status !== 'active') {
    return null;
  }

  return adminUser;
}

function normalizeEvidenceList(evidence) {
  if (Array.isArray(evidence)) {
    return evidence.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }

  if (typeof evidence === 'string' && evidence.trim()) {
    return [evidence.trim()];
  }

  return [];
}

function getModerationOutcome(action, durationDays) {
  const now = new Date();

  switch (action) {
    case 'warn':
      return {
        reportStatus: 'resolved',
        targetStatus: null,
        outcome: 'User warned',
        notificationTitle: 'Moderation warning',
        notificationBody: 'A moderator reviewed the report and issued a warning.',
      };
    case 'restrict': {
      const restrictedUntil = Number.isFinite(Number(durationDays)) && Number(durationDays) > 0
        ? new Date(now.getTime() + (Number(durationDays) * 24 * 60 * 60 * 1000))
        : new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

      return {
        reportStatus: 'resolved',
        targetStatus: {
          status: 'restricted',
          reason: 'Policy violation',
          restrictedUntil,
          suspendedUntil: null,
          updatedAt: now,
        },
        outcome: `Account restricted until ${restrictedUntil.toISOString()}`,
        notificationTitle: 'Account restricted',
        notificationBody: 'Your account has been restricted due to a policy violation.',
      };
    }
    case 'suspend':
    case 'ban': {
      const suspendedUntil = action === 'ban'
        ? null
        : (Number.isFinite(Number(durationDays)) && Number(durationDays) > 0
          ? new Date(now.getTime() + (Number(durationDays) * 24 * 60 * 60 * 1000))
          : null);

      return {
        reportStatus: 'resolved',
        targetStatus: {
          status: 'suspended',
          reason: 'Policy violation',
          restrictedUntil: null,
          suspendedUntil,
          updatedAt: now,
        },
        outcome: suspendedUntil
          ? `Account suspended until ${suspendedUntil.toISOString()}`
          : 'Account suspended indefinitely',
        notificationTitle: 'Account suspended',
        notificationBody: 'Your account has been suspended due to a policy violation.',
      };
    }
    case 'dismiss':
      return {
        reportStatus: 'dismissed',
        targetStatus: null,
        outcome: 'Report dismissed',
        notificationTitle: 'Report reviewed',
        notificationBody: 'Your report was reviewed and dismissed.',
      };
    default:
      return {
        reportStatus: 'resolved',
        targetStatus: null,
        outcome: 'Report resolved',
        notificationTitle: 'Report reviewed',
        notificationBody: 'Your report was reviewed.',
      };
  }
}

async function notifyModerationOutcome({ report, adminUser, targetUser, reporterUser, outcome, session }) {
  const notifications = [];

  if (targetUser?._id) {
    notifications.push({
      userId: targetUser._id,
      type: 'general',
      title: outcome.notificationTitle,
      body: outcome.notificationBody,
      payload: {
        kind: 'moderation-outcome',
        reportId: report._id,
        actionBy: adminUser?._id || null,
        actionByName: adminUser?.name || null,
        targetUserId: targetUser._id,
      },
      source: 'moderation',
      scheduledFor: new Date(),
      deliveredAt: new Date(),
      status: 'delivered',
    });
  }

  if (reporterUser?._id && String(reporterUser._id) !== String(targetUser?._id)) {
    notifications.push({
      userId: reporterUser._id,
      type: 'general',
      title: 'Report reviewed',
      body: `Your report was reviewed. Outcome: ${outcome.outcome}.`,
      payload: {
        kind: 'moderation-report-reviewed',
        reportId: report._id,
        actionBy: adminUser?._id || null,
        actionByName: adminUser?.name || null,
        outcome: outcome.outcome,
      },
      source: 'moderation',
      scheduledFor: new Date(),
      deliveredAt: new Date(),
      status: 'delivered',
    });
  }

  if (notifications.length > 0) {
    await NotificationEvent.insertMany(notifications, { session, ordered: true });
  }
}

export async function createModerationReport(req, res) {
  try {
    const { id } = req.params;
    const {
      targetUserId,
      category,
      targetContentType,
      targetContentId,
      description,
      evidence,
    } = req.body || {};

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user id or target user id' });
    }

    const reporter = await Users.findById(id).select('_id role moderationStatus');
    if (!reporter) {
      return res.status(404).json({ message: 'Reporter not found' });
    }

    const targetUser = await Users.findById(targetUserId).select('_id name role');
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    if (!normalizedDescription) {
      return res.status(400).json({ message: 'description is required' });
    }

    const report = await ModerationReport.create({
      reporterId: reporter._id,
      targetUserId: targetUser._id,
      targetContentType: ['behavior', 'message', 'challenge', 'habit', 'workout', 'profile', 'other'].includes(targetContentType)
        ? targetContentType
        : 'behavior',
      targetContentId: typeof targetContentId === 'string' && targetContentId.trim() ? targetContentId.trim() : null,
      category: ['harassment', 'spam', 'hate', 'abuse', 'fraud', 'inappropriate', 'other'].includes(category)
        ? category
        : 'other',
      description: normalizedDescription,
      evidence: normalizeEvidenceList(evidence),
      status: 'open',
      priority: 'medium',
    });

    return res.status(201).json({ message: 'Report submitted', report });
  } catch (error) {
    console.error('createModerationReport error:', error);
    return res.status(500).json({ message: 'Failed to submit report' });
  }
}

export async function getModerationReports(req, res) {
  try {
    const { adminId } = req.params;
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

    const adminUser = await loadAdminUser(adminId);
    if (!adminUser) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const filter = {};
    if (status && ['open', 'under_review', 'resolved', 'dismissed'].includes(status)) {
      filter.status = status;
    }

    const reports = await ModerationReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('reporterId', '_id name email role')
      .populate('targetUserId', '_id name email role moderationStatus')
      .populate('reviewedBy', '_id name email role')
      .lean();

    return res.status(200).json({ adminId, count: reports.length, reports });
  } catch (error) {
    console.error('getModerationReports error:', error);
    return res.status(500).json({ message: 'Failed to fetch moderation reports' });
  }
}

export async function getModerationReport(req, res) {
  try {
    const { adminId, reportId } = req.params;

    const adminUser = await loadAdminUser(adminId);
    if (!adminUser) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ message: 'Invalid report id' });
    }

    const report = await ModerationReport.findById(reportId)
      .populate('reporterId', '_id name email role')
      .populate('targetUserId', '_id name email role moderationStatus')
      .populate('reviewedBy', '_id name email role')
      .lean();

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    return res.status(200).json(report);
  } catch (error) {
    console.error('getModerationReport error:', error);
    return res.status(500).json({ message: 'Failed to fetch moderation report' });
  }
}

export async function reviewModerationReport(req, res) {
  try {
    const { adminId, reportId } = req.params;
    const { action, note, durationDays } = req.body || {};

    const adminUser = await loadAdminUser(adminId);
    if (!adminUser) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ message: 'Invalid report id' });
    }

    const normalizedAction = typeof action === 'string' ? action.trim().toLowerCase() : '';
    if (!['warn', 'restrict', 'suspend', 'ban', 'resolve', 'dismiss'].includes(normalizedAction)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const session = await mongoose.startSession();
    let responseReport = null;
    let responseTargetUser = null;

    try {
      await session.withTransaction(async () => {
        const report = await ModerationReport.findById(reportId).session(session);
        if (!report) {
          const notFoundError = new Error('Report not found');
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const targetUser = await Users.findById(report.targetUserId).session(session);
        if (!targetUser) {
          const notFoundError = new Error('Target user not found');
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const reporterUser = await Users.findById(report.reporterId).select('_id name email role').lean();
        const now = new Date();
        const outcome = getModerationOutcome(normalizedAction, durationDays);

        if (outcome.targetStatus) {
          targetUser.moderationStatus = outcome.targetStatus;
          await targetUser.save({ session });
        }

        const previousStatus = report.status;
        report.status = outcome.reportStatus;
        report.reviewedBy = adminUser._id;
        report.reviewedAt = now;
        report.resolvedAt = now;
        report.outcome = note && typeof note === 'string' && note.trim() ? note.trim() : outcome.outcome;
        report.actions.push({
          adminId: adminUser._id,
          action: normalizedAction,
          note: typeof note === 'string' ? note.trim() : '',
          previousStatus,
          nextStatus: report.status,
          durationDays: Number.isFinite(Number(durationDays)) ? Number(durationDays) : null,
          createdAt: now,
        });

        await report.save({ session });

        await notifyModerationOutcome({
          report,
          adminUser,
          targetUser,
          reporterUser,
          outcome,
          session,
        });

        responseReport = report.toObject();
        responseTargetUser = {
          _id: targetUser._id,
          role: targetUser.role,
          moderationStatus: targetUser.moderationStatus,
        };
      });
    } finally {
      session.endSession();
    }

    return res.status(200).json({
      message: 'Moderation report reviewed',
      report: responseReport,
      targetUser: responseTargetUser,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('reviewModerationReport error:', error);
    return res.status(500).json({ message: 'Failed to review moderation report' });
  }
}

export async function createNotification(req, res) {
  try {
    const { id } = req.params;
    const { type = 'general', title, body, payload = {}, source = 'manual', preferenceId = null, delivered = true } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required' });
    }

    const userExists = await Users.exists({ _id: id });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const notification = await NotificationEvent.create({
      userId: id,
      preferenceId,
      type,
      title,
      body,
      payload,
      source,
      scheduledFor: now,
      deliveredAt: delivered ? now : null,
      status: delivered ? 'delivered' : 'queued',
    });

    return res.status(201).json({ message: 'Notification created', notification });
  } catch (error) {
    console.error('createNotification error:', error);
    return res.status(500).json({ message: 'Failed to create notification' });
  }
}

export async function deleteNotification(req, res) {
  try {
    const { id, notificationId } = req.params;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(notificationId)) {
      return res.status(400).json({ message: 'Invalid identifier' });
    }

    const deleted = await NotificationEvent.findOneAndDelete({ _id: notificationId, userId: id });
    if (!deleted) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('deleteNotification error:', error);
    return res.status(500).json({ message: 'Failed to delete notification' });
  }
}