import mongoose from 'mongoose';

const CalorieTrackerSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  weight:    { type: Number, required: true, min: 10},
  goal:      { type: Number, required: true, min: 1 },
  workout:   { type: String, required: true, trim: true },
  duration:  { type: Number, required: true, min: 1 },
  calories:  { type: Number, min: 0 },
  goalmet:   { type: Boolean, default: false},
  date:      { type: Date, required: true, default: Date.now },
},
{
  timestamps: true
});
const CalorieTracker = mongoose.model('CalorieTracker', CalorieTrackerSchema, 'Calories');

export default CalorieTracker;