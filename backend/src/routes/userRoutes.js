import express from 'express';
import {
  getUsers,
  signup,
  login,
  fetchPairingCode,
  buddyUp,
  getBuddyInfo,
  getBuddyMoneyInfo,
  toggleBuddyMonetary,
  getWeeklyWorkoutRoutine,
  getUserHistory,
  getChallengePhotos,
  getCurrentStakes,
  getAllowedStakes,
  addWeeklyGoalStake,
  updateWeeklyGoal,
  getHabitLibrary,
  getCalendarView,
  getUserHabits,
  createHabit,
  logHabitOccurrence,
  updateHabitGoal,
  deleteHabit,
  createBuddyChallenge,
  getBuddyChallenges,
  submitBuddyChallengeProof,
  getBuddyChallengeProof,
  submitWeeklyGoalProof,
  getWeeklyGoalProof,
  getWeeklyGoalDetails,
  SearchFoods,
  CalorieIntakeLogger,
  GetCalorieIntakeHistory,
  CalorieLogger,
  GetCalorieHistory,
  WorkoutGetter,
  WorkoutModelGetter,
  WorkoutModelCreator,
  WorkoutModelDeleter,
  WorkoutModelEditor,
  WorkoutModelSessionStarter,
  WorkoutModelSessionTracker,
  WorkoutModelSessionUpdater,
  WorkoutModelSessionEnder,
  FitnessGetter,
  FitnessSetter,
  FitnessUpdater,
  AI_Nutrition,
  AI_imageScan,
  getStepTracker,
  logSteps,
  getStepHistory,
  resetDailySteps,
  updateStepGoal,
  getChatMessages,
  sendChatMessage,
  markChatMessagesRead,
  getWidgetConfig,
  saveWidgetConfig,
  getWidgetData,
  getPerformanceSummary,
  getNotificationPreferences,
  saveNotificationPreferences,
  createNotification,
  deleteNotification,
  getNotificationFeed,
  markNotificationRead,
  createModerationReport,
  getModerationReports,
  getModerationReport,
  reviewModerationReport,
} from '../controllers/userController.js';
import proofUpload from '../middleware/proofUpload.js';
import imageUpload from '../middleware/imageUpload.js';
import accountStatusGuard from '../middleware/accountStatus.js';

const router = express.Router();


/**
 * router.put('/weekly challenges)
 * router.put('/evidence)
 */
router.get('/users', getUsers);
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/admin/:adminId/reports', getModerationReports);
router.get('/admin/:adminId/reports/:reportId', getModerationReport);
router.patch('/admin/:adminId/reports/:reportId', reviewModerationReport);
router.get('/weekly-goals/allowed-stakes', getAllowedStakes);
router.get('/habits/library', getHabitLibrary);
router.use('/:id', accountStatusGuard);
router.get('/:id/weekly-goals/allowed-stakes', getAllowedStakes); //just added
router.post('/:id/weekly-goals/allowed-stakes', addWeeklyGoalStake); //just added
router.get('/:id/pairing-code', fetchPairingCode);
router.put('/:id/buddy/:pairingCode', buddyUp);
router.get('/:id/buddy', getBuddyInfo);
router.get('/:id/buddy/money', getBuddyMoneyInfo);
router.put('/:id/buddy/money/toggle', toggleBuddyMonetary);
router.get('/:id/weekly-workout-routine', getWeeklyWorkoutRoutine);
router.get('/:id/history', getUserHistory);
router.get('/:id/challenge-photos', getChallengePhotos);
router.get('/:id/current-stakes', getCurrentStakes);
router.get('/:id/calendar', getCalendarView);
router.post('/:id/reports', createModerationReport);
router.get('/:id/habits', getUserHabits);
router.post('/:id/habits', createHabit);
router.post('/:id/habits/:habitId/log', logHabitOccurrence);
router.put('/:id/habits/:habitId/goal', updateHabitGoal);
router.delete('/:id/habits/:habitId', deleteHabit);
router.post('/:id/weekly-goals', updateWeeklyGoal); //just added
router.get('/:id/challenges', getBuddyChallenges);
router.post('/:id/challenges', createBuddyChallenge);
router.post('/:id/challenges/:challengeId/proof', proofUpload.single('proof'), submitBuddyChallengeProof);
router.get('/:id/challenges/:challengeId/proof', getBuddyChallengeProof);
router.post('/:id/weekly-goals/:weeklyGoalId/proof', proofUpload.single('proof'), submitWeeklyGoalProof); //just added
router.get('/:id/weekly-goals/:weeklyGoalId/proof/:proofId', getWeeklyGoalProof); //just added
router.get('/:id/weekly-goals/:weeklyGoalId/details', getWeeklyGoalDetails); //just added
router.get('/foods/search', SearchFoods);
router.post('/:id/calories/intake/log', CalorieIntakeLogger);
router.get('/:id/calories/intake/history', GetCalorieIntakeHistory);
router.post('/:id/calories/log', CalorieLogger);
router.get('/:id/calories/history', GetCalorieHistory);
router.get('/workout/get', WorkoutGetter);
router.get('/workout-models/get', WorkoutModelGetter);
router.get('/:id/workout-models/get', WorkoutModelGetter);
router.post('/:id/workout-models/create', WorkoutModelCreator);
router.post('/:id/workout-models/delete', WorkoutModelDeleter);
router.post('/:id/workout-models/edit', WorkoutModelEditor);
router.post('/:id/active-workout-model-session/start', WorkoutModelSessionStarter);
router.get('/:id/active-workout-model-session/tracker', WorkoutModelSessionTracker);
router.post('/:id/active-workout-model-session/update', WorkoutModelSessionUpdater);
router.delete('/:id/active-workout-model-session/end/:sessionId', WorkoutModelSessionEnder);
router.get('/:id/user-fitness/stats', FitnessGetter);
router.post('/:id/user-fitness/survey', FitnessSetter);
router.post('/:id/user-fitness/update', FitnessUpdater);
router.post('/:id/AI-Nutrition/guide', AI_Nutrition);
router.post('/:id/AI-Image-Scan/image', imageUpload.single('image'), AI_imageScan);
router.get('/:id/steps/get', getStepTracker);
router.post('/:id/steps/log', logSteps);
router.get('/:id/steps/history', getStepHistory);
router.post('/:id/steps/reset', resetDailySteps);
router.put('/:id/steps/goal', updateStepGoal);
router.get('/:id/chat/:buddyPairId/messages', getChatMessages);
router.post('/:id/chat/:buddyPairId/messages', sendChatMessage);
router.patch('/:id/chat/:buddyPairId/messages/read', markChatMessagesRead);
router.get('/:id/widget-config', getWidgetConfig);
router.post('/:id/widget-config', saveWidgetConfig);
router.get('/:id/widget-data', getWidgetData);
router.get('/:id/performance', getPerformanceSummary);
router.get('/:id/notification-settings', getNotificationPreferences);
router.post('/:id/notification-settings', saveNotificationPreferences);
router.post('/:id/notifications', createNotification);
router.get('/:id/notifications', getNotificationFeed);
router.patch('/:id/notifications/:notificationId/read', markNotificationRead);
router.delete('/:id/notifications/:notificationId', deleteNotification);
/*
bet has to connection to the points yet
*/


export default router;