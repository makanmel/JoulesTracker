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

describe('User stats endpoint', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/users/stats');

    expect(res.status).toBe(401);
  });

  it('reports registered and online user counts', async () => {
    const res = await request(app).get('/api/v1/users/stats').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    // One user registered by the beforeEach helper; the authenticated request
    // marks them online.
    expect(res.body.registered).toBe(1);
    expect(res.body.online).toBeGreaterThanOrEqual(1);
  });
});

describe('User profile endpoints', () => {
  it('returns an empty profile by default', async () => {
    const res = await request(app).get('/api/v1/users/profile').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      weightKg: null,
      heightCm: null,
      birthDate: null,
      gender: null,
      activityLevel: null,
    });
  });

  it('updates and returns the user profile', async () => {
    const body = { weightKg: 70, heightCm: 175, birthDate: '1995-06-15', gender: 'male', activityLevel: 'moderate' };
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
      .send({ weightKg: -1, heightCm: 0, birthDate: '2999-01-01', gender: 'other', activityLevel: 'none' });

    expect(res.status).toBe(400);
  });
});

describe('Account onboarding', () => {
  it('requires authentication for reading and updating progress', async () => {
    expect((await request(app).get('/api/v1/users/onboarding')).status).toBe(401);
    expect((await request(app).put('/api/v1/users/onboarding').send({ state: 'done' })).status).toBe(401);
  });

  it('persists progress for only the authenticated account', async () => {
    const initial = await request(app).get('/api/v1/users/onboarding').set('Authorization', authHeader);
    expect(initial.body).toEqual({ state: '0' });
    const saved = await request(app).put('/api/v1/users/onboarding').set('Authorization', authHeader).send({ state: 'done' });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ state: 'done' });
    const loaded = await request(app).get('/api/v1/users/onboarding').set('Authorization', authHeader);
    expect(loaded.body).toEqual({ state: 'done' });
    const other = await registerAndLogin(app);
    const separate = await request(app).get('/api/v1/users/onboarding').set('Authorization', `Bearer ${other.token}`);
    expect(separate.body).toEqual({ state: '0' });
  });

  it('rejects invalid states', async () => {
    const invalid = await request(app).put('/api/v1/users/onboarding').set('Authorization', authHeader).send({ state: '99' });
    expect(invalid.status).toBe(400);
  });
});
