import Users from '../models/Users.js';
import BuddyPair from '../models/BuddyPair.js';
import StepTracker from '../models/StepTracker.js';
import WeeklyGoal from '../models/WeeklyGoal.js';
import Habit from '../models/Habit.js';
import WMCompletionHistory from '../models/WMCompletionHistory.js';

const TIER_THRESHOLDS = [
  { tier: 'Bronze', min: 0 },
  { tier: 'Silver', min: 80 },
  { tier: 'Gold', min: 160 },
  { tier: 'Platinum', min: 260 },
  { tier: 'Diamond', min: 380 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTierFromPoints(points) {
  const normalizedPoints = Math.max(0, Math.round(Number(points) || 0));
  let current = TIER_THRESHOLDS[0];

  for (const threshold of TIER_THRESHOLDS) {
    if (normalizedPoints >= threshold.min) {
      current = threshold;
    }
  }

  const currentIndex = TIER_THRESHOLDS.findIndex((entry) => entry.tier === current.tier);
  const next = TIER_THRESHOLDS[currentIndex + 1] || null;
  const previous = TIER_THRESHOLDS[currentIndex - 1] || null;
  const nextThreshold = next ? next.min : current.min;
  const previousThreshold = previous ? previous.min : current.min;
  const progressToNext = next
    ? clamp(((normalizedPoints - current.min) / (next.min - current.min)) * 100, 0, 100)
    : 100;

  return {
    tier: current.tier,
    points: normalizedPoints,
    currentMin: current.min,
    nextTier: next?.tier || null,
    nextThreshold,
    previousTier: previous?.tier || null,
    previousThreshold,
    progressToNext: Math.round(progressToNext),
  };
}

function getRecentEntries(entries = [], days = 14, dateField = 'date') {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  return entries.filter((entry) => {
    const entryDate = new Date(entry?.[dateField] || entry?.createdAt || entry?.loggedAt || 0);
    return entryDate >= cutoff;
  });
}

function sumRecentHabitLogs(habits = [], days = 7) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  return habits.reduce((sum, habit) => {
    const recentLogs = Array.isArray(habit.logs)
      ? habit.logs.filter((log) => new Date(log.loggedAt || log.createdAt || 0) >= cutoff).length
      : 0;
    return sum + recentLogs;
  }, 0);
}

function getUserWeeklyGoalProgress(weeklyGoal, userId) {
  if (!weeklyGoal) {
    return null;
  }

  const target = Math.max(1, Number(weeklyGoal.weeklyWorkoutGoal) || 1);
  const streakEntry = Array.isArray(weeklyGoal.dailyStreaks)
    ? weeklyGoal.dailyStreaks.find((entry) => String(entry.userId) === String(userId))
    : null;
  const uniqueDays = Array.isArray(streakEntry?.uploadedDays)
    ? [...new Set(streakEntry.uploadedDays)]
    : [];
  const completed = Math.min(uniqueDays.length, target);
  return {
    completed,
    target,
    ratio: completed / target,
    combined: weeklyGoal.combined_streak === true,
  };
}

function scoreIndividualPerformance({ user, stepTracker, weeklyGoal, habits, recentWorkouts, buddyPoints }) {
  const streakScore = clamp((Number(user?.streak?.current) || 0) * 12, 0, 60);

  const recentStepEntries = getRecentEntries(stepTracker?.dailyHistory || [], 14, 'date');
  const stepGoal = Math.max(1, Number(stepTracker?.dailyStepGoal || user?.goals?.stepGoal || 10000));
  const avgStepRatio = recentStepEntries.length > 0
    ? recentStepEntries.reduce((sum, entry) => sum + clamp((Number(entry.steps) || 0) / stepGoal, 0, 1), 0) / recentStepEntries.length
    : 0;
  const stepGoalMetCount = recentStepEntries.filter((entry) => (Number(entry.steps) || 0) >= stepGoal).length;
  const stepScore = clamp(Math.round(avgStepRatio * 40) + (stepGoalMetCount * 2), 0, 50);

  const workoutScore = clamp((recentWorkouts.length || 0) * 15, 0, 60);

  const habitRecentLogs = sumRecentHabitLogs(habits, 7);
  const activeHabitCount = Array.isArray(habits) ? habits.length : 0;
  const habitScore = clamp((activeHabitCount * 4) + (habitRecentLogs * 2), 0, 30);

  const weeklyGoalProgress = getUserWeeklyGoalProgress(weeklyGoal, user?._id);
  const goalScore = weeklyGoalProgress
    ? clamp(Math.round(weeklyGoalProgress.ratio * 35) + (weeklyGoalProgress.combined ? 10 : 0), 0, 45)
    : 0;

  const buddyScore = clamp(Math.floor(Math.max(0, buddyPoints) / 5), 0, 80);

  const totalPoints = streakScore + stepScore + workoutScore + habitScore + goalScore + buddyScore;

  return {
    totalPoints,
    breakdown: {
      streakScore,
      stepScore,
      workoutScore,
      habitScore,
      goalScore,
      buddyScore,
    },
    weeklyGoalProgress,
  };
}

function scoreCombinedPerformance({ buddyPair, weeklyGoal }) {
  if (!buddyPair) {
    return null;
  }

  const memberPoints = Array.isArray(buddyPair.memberScores)
    ? buddyPair.memberScores.reduce((sum, entry) => sum + Math.max(0, (Number(entry.points) || 0) - ((Number(entry.penalties) || 0) * 5)), 0)
    : 0;
  const pairPointsScore = clamp(Math.floor(memberPoints / 5), 0, 90);
  const combinedStreakScore = clamp((Number(buddyPair?.combinedStreak?.current) || 0) * 15, 0, 60);
  const workoutScore = clamp((Number(buddyPair?.totalWorkoutsCompleted) || 0) * 5, 0, 50);
  const goalBonus = weeklyGoal?.combined_streak === true ? 20 : 0;

  return {
    totalPoints: pairPointsScore + combinedStreakScore + workoutScore + goalBonus,
    breakdown: {
      pairPointsScore,
      combinedStreakScore,
      workoutScore,
      goalBonus,
    },
  };
}

export async function buildPerformanceSummary(userId) {
  const [user, stepTracker, weeklyGoal, habits, recentWorkouts, buddyPair] = await Promise.all([
    Users.findById(userId).lean(),
    StepTracker.findOne({ userId }).lean(),
    WeeklyGoal.findOne({ participants: userId }).sort({ startDate: -1 }).lean(),
    Habit.find({ userId, isActive: true }).lean(),
    WMCompletionHistory.find({ userId }).sort({ endTime: -1 }).limit(10).lean(),
    BuddyPair.findOne({ members: userId, status: 'active' })
      .sort({ createdAt: -1 })
      .select('_id members memberScores combinedStreak totalWorkoutsCompleted status createdAt')
      .lean(),
  ]);

  if (!user) {
    return null;
  }

  const buddyScoreEntry = Array.isArray(buddyPair?.memberScores)
    ? buddyPair.memberScores.find((entry) => String(entry.userId) === String(userId))
    : null;
  const buddyPoints = buddyScoreEntry?.points ?? 0;

  const individual = scoreIndividualPerformance({
    user,
    stepTracker,
    weeklyGoal,
    habits,
    recentWorkouts,
    buddyPoints,
  });
  const individualTier = getTierFromPoints(individual.totalPoints);

  const combined = scoreCombinedPerformance({ buddyPair, weeklyGoal });
  const combinedTier = combined ? getTierFromPoints(combined.totalPoints) : null;

  const previousTier = user.performanceTier?.currentTier || null;
  const tierRank = TIER_THRESHOLDS.findIndex((entry) => entry.tier === individualTier.tier);
  const previousRank = previousTier
    ? TIER_THRESHOLDS.findIndex((entry) => entry.tier === previousTier)
    : -1;
  const advanced = tierRank > previousRank;

  await Users.updateOne(
    { _id: userId },
    {
      $set: {
        performanceTier: {
          currentTier: individualTier.tier,
          points: individualTier.points,
        },
      },
    }
  );

  return {
    userId,
    individual: {
      currentTier: individualTier.tier,
      points: individualTier.points,
      progressToNext: individualTier.progressToNext,
      nextTier: individualTier.nextTier,
      currentMin: individualTier.currentMin,
      nextThreshold: individualTier.nextThreshold,
      breakdown: individual.breakdown,
      weeklyGoalProgress: individual.weeklyGoalProgress,
      recognition: advanced
        ? {
            advanced: true,
            fromTier: previousTier,
            toTier: individualTier.tier,
            message: previousTier
              ? `Tier up: ${previousTier} -> ${individualTier.tier}`
              : `Welcome to ${individualTier.tier}`,
          }
        : {
            advanced: false,
            fromTier: previousTier,
            toTier: individualTier.tier,
          },
    },
    combined: combined
      ? {
          currentTier: combinedTier.tier,
          points: combinedTier.points,
          progressToNext: combinedTier.progressToNext,
          nextTier: combinedTier.nextTier,
          breakdown: combined.breakdown,
          combinedStreak: buddyPair?.combinedStreak || null,
          totalWorkoutsCompleted: buddyPair?.totalWorkoutsCompleted || 0,
        }
      : null,
    buddyPair: buddyPair
      ? {
          id: buddyPair._id,
          status: buddyPair.status,
          createdAt: buddyPair.createdAt,
        }
      : null,
  };
}

export function getTierList() {
  return TIER_THRESHOLDS.map((entry) => entry.tier);
}
