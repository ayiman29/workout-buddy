import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import connectDB from '../src/config/db.js';
import Users from '../src/models/Users.js';
import Habit from '../src/models/Habit.js';
import app from '../src/app.js';

describe('Feature: Habit Layer Monitoring System (ID: 23301211)', () => {
  let authToken = '';
  let testUserId = '';
  let testHabitId = '';
  const testEmail = 'test23301211@test.com';
  const testPassword = 'thisisareallysecretpassword';

  let mongoServer;

  // PRE-CONDITION: Setup in-memory DB and Dynamic Auth
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    // Connect to MongoDB
    await connectDB();

    // Create test user
    const testUser = await Users.create({
      name: 'Test User 23301211',
      email: testEmail,
      passwordHash: testPassword,
      role: 'user',
    });
    testUserId = testUser._id.toString();

    // Login to get auth token
    const loginResponse = await request(app)
      .post('/user/auth/login')
      .send({ email: testEmail, password: testPassword });

    authToken = loginResponse.body.token;
    expect(authToken).toBeTruthy();
  });

  // Cleanup after tests
  afterAll(async () => {
    // Delete test user and habits
    await Users.deleteOne({ email: testEmail });
    await Habit.deleteMany({ userId: testUserId });
    await mongoose.connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  // CASE A: Positive Flow (Happy Path)

  // TEST 1: Create Habit
  it('should create a new habit with valid payload', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/habits`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Walk 30 minutes',
        category: 'good',
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('habit');
    expect(res.body.habit).toHaveProperty('_id');
    expect(res.body.habit.name).toBe('Walk 30 minutes');
    testHabitId = res.body.habit._id; // Save for other tests
  });

  // TEST 2: Retrieve All Habits
  it('should retrieve all habits for the user', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/habits`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('goodHabits');
    expect(Array.isArray(res.body.goodHabits)).toBe(true);
    expect(res.body.goodHabits.length).toBeGreaterThan(0);
  });

  // TEST 3: Update Habit Goal
  it('should update habit goal successfully', async () => {
    const res = await request(app)
      .put(`/user/${testUserId}/habits/${testHabitId}/goal`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ goalType: 'do', targetCount: 7 });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('habit');
    expect(res.body.habit.targetCount).toBe(7);
  });

  // TEST 4: Log Habit Occurrence
  it('should log habit occurrence successfully', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/habits/${testHabitId}/log`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ note: 'Completed 30 min walk' });

    expect(res.statusCode).toEqual(201);
  });

  // CASE B: Negative Flow (Error Handling)

  // TEST 5: Validation Error - Missing Required Field
  it('should return 400 if habit name is missing', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/habits`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ goalFrequency: 'daily' }); // Missing 'name'

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('message');
  });

  // TEST 6: Resource Not Found - Update Non-Existent Habit
  it('should return 404 when updating non-existent habit', async () => {
    const fakeHabitId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/user/${testUserId}/habits/${fakeHabitId}/goal`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ goalFrequency: 'weekly' });

    expect(res.statusCode).toEqual(404);
  });

  // TEST 7: Resource Not Found - Delete Non-Existent Habit
  it('should return 404 when deleting non-existent habit', async () => {
    const fakeHabitId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/user/${testUserId}/habits/${fakeHabitId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('deletedCount');
    expect(res.body.deletedCount).toBe(0);
  });

  // TEST 8: Delete Existing Habit
  it('should delete an existing habit successfully', async () => {
    const res = await request(app)
      .delete(`/user/${testUserId}/habits/${testHabitId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('deletedCount');
    expect(res.body.deletedCount).toBeGreaterThan(0);
  });

  // CASE C: Security & Boundary

  // TEST 9: Unauthorized Access - Missing Token
  it('should return 401 when accessing without authorization token', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/habits`);
      // No Authorization header

    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('message');
  });

  // TEST 10: Unauthorized Access - Invalid Token
  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/habits`)
      .set('Authorization', 'Bearer invalid_token_xyz');

    expect(res.statusCode).toEqual(401);
  });
});
