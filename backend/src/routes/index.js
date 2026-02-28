const express = require('express');
const workoutRoutes = require('./workoutRoutes');

const router = express.Router();

router.use('/workouts', workoutRoutes);

module.exports = router;