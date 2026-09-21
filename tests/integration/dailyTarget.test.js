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

describe('Daily target endpoints', () => {
  it('returns null when no target is set', async () => {
    const res = await request(app)
      .get('/api/v1/daily-target?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-09-21');
    expect(res.body.targetCalories).toBeNull();
  });

  it('sets and returns a daily target', async () => {
    await request(app)
      .put('/api/v1/daily-target')
      .set('Authorization', authHeader)
      .send({ targetDate: '2026-09-21', targetCalories: 2000 });

    const res = await request(app)
      .get('/api/v1/daily-target?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.targetCalories).toBe(2000);
  });

  it('updates an existing target', async () => {
    await request(app)
      .put('/api/v1/daily-target')
      .set('Authorization', authHeader)
      .send({ targetDate: '2026-09-21', targetCalories: 2000 });

    const res = await request(app)
      .put('/api/v1/daily-target')
      .set('Authorization', authHeader)
      .send({ targetDate: '2026-09-21', targetCalories: 2200 });

    expect(res.status).toBe(200);
    expect(res.body.targetCalories).toBe(2200);
  });

  it('rejects negative target calories', async () => {
    const res = await request(app)
      .put('/api/v1/daily-target')
      .set('Authorization', authHeader)
      .send({ targetDate: '2026-09-21', targetCalories: -1 });

    expect(res.status).toBe(400);
  });
});
