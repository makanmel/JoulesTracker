import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('Auth endpoints', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth1@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe('auth1@test.com');
    expect(res.body.accessToken).toBeDefined();
  });

  it('returns 409 for duplicate email', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth2@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth2@test.com', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('logs in and returns a token', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth3@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth3@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth4@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth4@test.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@test.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('logs out an authenticated user', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'auth5@test.com', password: 'password123' });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(res.status).toBe(204);
  });
});
