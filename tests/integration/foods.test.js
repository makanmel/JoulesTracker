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

describe('Food endpoints', () => {
  it('creates a custom food', async () => {
    const res = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Tofu', caloriesPer100g: 76 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Tofu');
    expect(res.body.caloriesPer100g).toBe(76);
    expect(res.body.createdById).toBeDefined();
  });

  it('lists default foods and user-created foods', async () => {
    await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Custom Food', caloriesPer100g: 100 });

    const res = await request(app).get('/api/v1/foods').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(6);
    expect(res.body.total).toBeGreaterThanOrEqual(6);
  });

  it('searches foods by name', async () => {
    await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Quinoa salad', caloriesPer100g: 120 });

    const res = await request(app)
      .get('/api/v1/foods?q=quinoa')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.items.some((f) => f.name === 'Quinoa salad')).toBe(true);
  });

  it('blocks editing a default food', async () => {
    const list = await request(app).get('/api/v1/foods').set('Authorization', authHeader);
    const defaultItem = list.body.items.find((f) => f.isDefault);

    const res = await request(app)
      .patch(`/api/v1/foods/${defaultItem.id}`)
      .set('Authorization', authHeader)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('blocks editing another user food', async () => {
    const other = await registerAndLogin(app);
    const foodRes = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ name: 'Private', caloriesPer100g: 100 });

    const res = await request(app)
      .patch(`/api/v1/foods/${foodRes.body.id}`)
      .set('Authorization', authHeader)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('sorts foods by usage for the given meal type', async () => {
    const a = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Sort A', caloriesPer100g: 100 });
    const b = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Sort B', caloriesPer100g: 100 });

    const recentDate = new Date().toISOString().slice(0, 10);
    const addMeal = (foodId, mealType, mealDate = recentDate) =>
      request(app)
        .post('/api/v1/meals')
        .set('Authorization', authHeader)
        .send({ foodId, quantityGrams: 100, mealDate, mealType });

    await addMeal(a.body.id, 'lunch');
    await addMeal(b.body.id, 'lunch');
    await addMeal(b.body.id, 'lunch');
    await addMeal(a.body.id, 'breakfast');

    const c = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Sort C', caloriesPer100g: 100 });
    await addMeal(c.body.id, 'lunch', '2000-01-02');

    const lunch = await request(app)
      .get('/api/v1/foods?mealType=lunch&limit=500')
      .set('Authorization', authHeader);
    const lunchNames = lunch.body.items.map((f) => f.name);
    expect(lunchNames.indexOf('Sort B')).toBeLessThan(lunchNames.indexOf('Sort A'));
    // Stale (>30 days) usage must not rank — Sort C lands after recently used foods.
    expect(lunchNames.indexOf('Sort C')).toBeGreaterThan(lunchNames.indexOf('Sort A'));

    const breakfast = await request(app)
      .get('/api/v1/foods?mealType=breakfast&limit=500')
      .set('Authorization', authHeader);
    const breakfastNames = breakfast.body.items.map((f) => f.name);
    expect(breakfastNames.indexOf('Sort A')).toBeLessThan(breakfastNames.indexOf('Sort B'));
  });

  it('deletes a custom food when unused', async () => {
    const food = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'To delete', caloriesPer100g: 50 });

    const res = await request(app)
      .delete(`/api/v1/foods/${food.body.id}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(204);
  });

  it('returns 409 when deleting a food referenced by meals', async () => {
    const food = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Referenced', caloriesPer100g: 80 });

    await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({ foodId: food.body.id, quantityGrams: 100, mealDate: '2026-01-03', mealType: 'lunch' });

    const res = await request(app)
      .delete(`/api/v1/foods/${food.body.id}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(409);
  });

  it('recognizes a photo and prefers a local matching food', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'unused',
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Buckwheat (cooked)',
                weightGrams: 250,
                caloriesPer100g: 132,
                proteinPer100g: 4.5,
                carbsPer100g: 24,
                fatPer100g: 1.6,
                confidence: 'high',
              }),
            },
          },
        ],
      }),
    });

    const res = await request(app)
      .post('/api/v1/foods/recognize-photo')
      .set('Authorization', authHeader)
      .send({ image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=' });

    globalThis.fetch = originalFetch;

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].source).toBe('local');
    expect(res.body.items[0].saved).toBe(true);
    expect(res.body.items[0].weightGrams).toBe(250);
    expect(res.body.items[0].food.name).toBe('Buckwheat (cooked)');
  });

  it('shares public foods with other users while keeping private foods hidden', async () => {
    const shared = await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Shared zzz stew', caloriesPer100g: 100, isPublic: true });
    await request(app)
      .post('/api/v1/foods')
      .set('Authorization', authHeader)
      .send({ name: 'Private zzz stew', caloriesPer100g: 100 });

    const { token: otherToken } = await registerAndLogin(app);
    const otherHeader = `Bearer ${otherToken}`;

    const sharedRes = await request(app).get('/api/v1/foods?q=Shared+zzz').set('Authorization', otherHeader);
    expect(sharedRes.body.items.some((f) => f.name === 'Shared zzz stew')).toBe(true);

    const privateRes = await request(app).get('/api/v1/foods?q=Private+zzz').set('Authorization', otherHeader);
    expect(privateRes.body.items.some((f) => f.name === 'Private zzz stew')).toBe(false);

    const patchRes = await request(app)
      .patch(`/api/v1/foods/${shared.body.id}`)
      .set('Authorization', otherHeader)
      .send({ caloriesPer100g: 1 });
    expect(patchRes.status).toBe(403);
  });
});
