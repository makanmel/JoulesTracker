import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin } from '../helpers/auth.js';

const app = createApp();
let authHeader;

function birthDateForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().split('T')[0];
}

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

  it('suggests the previous day target when present', async () => {
    await request(app)
      .put('/api/v1/daily-target')
      .set('Authorization', authHeader)
      .send({ targetDate: '2026-09-20', targetCalories: 2100 });

    const res = await request(app)
      .get('/api/v1/daily-target/suggest?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.previousDate).toBe('2026-09-20');
    expect(res.body.previousTargetCalories).toBe(2100);
    expect(res.body.targetCalories).toBeNull();
    expect(res.body.bmr).toBeNull();
  });

  it('suggests BMR and TDEE when profile is complete', async () => {
    await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', authHeader)
      .send({ weightKg: 70, heightCm: 175, birthDate: birthDateForAge(30), gender: 'male', activityLevel: 'moderate' });

    const res = await request(app)
      .get('/api/v1/daily-target/suggest?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.bmr).toBe(Math.round(10 * 70 + 6.25 * 175 - 5 * 30 + 5));
    expect(res.body.tdee).toBe(Math.round(res.body.bmr * 1.55));
  });
});
