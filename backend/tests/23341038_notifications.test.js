import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import connectDB from '../src/config/db.js';
import Users from '../src/models/Users.js';
import NotificationEvent from '../src/models/NotificationEvent.js';
import app from '../src/app.js';

describe('Feature: Smart Motivational Notification System (ID: 23341038)', () => {
  let authToken = '';
  let testUserId = '';
  let notificationId = '';
  const testEmail = 'test23341038@test.com';
  const testPassword = '$2b$10$anotherexamplehashedpasswordstring';

  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDB();

    const testUser = await Users.create({
      name: 'Test User 23341038',
      email: testEmail,
      passwordHash: testPassword,
      role: 'user',
    });
    testUserId = testUser._id.toString();

    const loginRes = await request(app)
      .post('/user/auth/login')
      .send({ email: testEmail, password: testPassword });

    authToken = loginRes.body.token;
    expect(authToken).toBeTruthy();
  });

  afterAll(async () => {
    await Users.deleteOne({ email: testEmail });
    await NotificationEvent.deleteMany({ userId: testUserId });
    await mongoose.connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  it('should create a notification (201)', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/notifications`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Well done!', body: 'You hit your step goal today', type: 'general' });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('notification');
    expect(res.body.notification).toHaveProperty('_id');
    notificationId = res.body.notification._id;
  });

  it('should return validation error when required fields missing (400)', async () => {
    const res = await request(app)
      .post(`/user/${testUserId}/notifications`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'Missing title' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('should list notifications (200)', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/notifications`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  it('should mark notification as read (200)', async () => {
    const res = await request(app)
      .patch(`/user/${testUserId}/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('notification');
  });

  it('should return 404 when marking non-existent notification', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/user/${testUserId}/notifications/${fakeId}/read`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.statusCode).toBe(404);
  });

  it('should delete notification (200)', async () => {
    const res = await request(app)
      .delete(`/user/${testUserId}/notifications/${notificationId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 404 when deleting non-existent notification', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/user/${testUserId}/notifications/${fakeId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(404);
  });

  it('should return 401 when accessing without token', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/notifications`);

    expect(res.statusCode).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get(`/user/${testUserId}/notifications`)
      .set('Authorization', 'Bearer invalidtoken123');

    expect(res.statusCode).toBe(401);
  });
});
