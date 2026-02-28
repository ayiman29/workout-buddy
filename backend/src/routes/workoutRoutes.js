const express = require('express');
const {
  getWorkouts,
  createWorkout,
} = require('../controllers/workoutController');

const router = express.Router();

router.get('/', getWorkouts);
router.post('/', createWorkout);

module.exports = router;
