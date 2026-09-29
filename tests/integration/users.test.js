import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin } from '../helpers/auth.js';

const app = createApp();
let authHeader;

beforeEach(async () => {
  const { token } = await registerAndLogin(app);
  authHeader = `Bearer ${token}`;
});

describe('User profile endpoints', () => {
  it('returns an empty profile by default', async () => {
    const res = await request(app).get('/api/v1/users/profile').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      weightKg: null,
      heightCm: null,
      age: null,
      gender: null,
      activityLevel: null,
    });
  });

  it('updates and returns the user profile', async () => {
    const body = { weightKg: 70, heightCm: 175, age: 30, gender: 'male', activityLevel: 'moderate' };
    const res = await request(app).put('/api/v1/users/profile').set('Authorization', authHeader).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(body);

    const get = await request(app).get('/api/v1/users/profile').set('Authorization', authHeader);
    expect(get.body).toMatchObject(body);
  });

  it('rejects invalid profile data', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', authHeader)
      .send({ weightKg: -1, heightCm: 0, age: 0, gender: 'other', activityLevel: 'none' });

    expect(res.status).toBe(400);
  });
});
