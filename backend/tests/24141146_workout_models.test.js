import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import connectDB from '../src/config/db.js';
import Users from '../src/models/Users.js';
import WorkoutModel from '../src/models/WorkoutModel.js';
import Workout from '../src/models/Workout.js';
import app from '../src/app.js';

describe('Feature: Workout Models (ID: 23141146)', () => {
  let authToken = '';
  let testUserId = '';
  let testModelId = '';
  let exerciseId = '';

  const testEmail = 'test23141146@test.com';
  const testPassword = '$2b$10$anotherexamplehashedpasswordstring';

  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDB();

    const testUser = await Users.create({
      name: 'Test User 23141146',
      email: testEmail,
      passwordHash: testPassword,
      role: 'user',
    });
    testUserId = testUser._id.toString();

    // create a referenced exercise
    const exercise = await Workout.create({
      title: 'Test Pushup',
      met: 3.8,
      muscleGroup: 'chest',
      exerciseType: 'strength',
      difficulty: 'beginner',
    });
    exerciseId = exercise._id.toString();

    const loginRes = await request(app)
      .post('/user/auth/login')
      .send({ email: testEmail, password: testPassword });

    authToken = loginRes.body.token;
    expect(authToken).toBeTruthy();
  });

  afterAll(async () => {
    await Users.deleteOne({ email: testEmail });
    await WorkoutModel.deleteMany({ userId: testUserId });
    await Workout.deleteOne({ _id: exerciseId });
    await mongoose.connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  it('should create a workout model (201)', async () => {
    const payload = {
      category: 'full body',
      title: 'Beginner Routine',
      workouts: [
        { exercise: exerciseId, sets: 3, reps: 10, rest: 60 }
      ]
    };

    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/create`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('_id');
    testModelId = res.body._id;
  });

  it('should return 400 for invalid create payload (missing title)', async () => {
    const payload = { category: 'full body', workouts: [{ exercise: exerciseId, sets:1, reps:5, rest:30 }] };
    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/create`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    expect(res.statusCode).toBe(400);
  });

  it('should fetch models for the user (200)', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/workout-models/get`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should edit the workout model (200)', async () => {
    const payload = {
      category: 'upper body',
      title: 'Beginner Routine', // matches existing title to find
      workouts: [ { exercise: exerciseId, sets: 4, reps: 8, rest: 90 } ]
    };

    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/edit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 404 when editing non-existent model', async () => {
    const payload = { category: 'x', title: 'NoSuchTitle', workouts: [ { exercise: exerciseId, sets:1, reps:1, rest:1 } ] };
    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/edit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    expect(res.statusCode).toBe(404);
  });

  it('should delete the workout model by id (200)', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/delete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ modelId: testModelId });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 404 when deleting non-existent model', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/user/${testUserId}/workout-models/delete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ modelId: fakeId.toString() });

    expect(res.statusCode).toBe(404);
  });

  it('should return 401 for protected route without token', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/workout-models/get`);

    expect(res.statusCode).toBe(401);
  });
});
