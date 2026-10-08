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

    const lunch = await request(app).get('/api/v1/foods?mealType=lunch').set('Authorization', authHeader);
    const lunchNames = lunch.body.items.map((f) => f.name);
    expect(lunchNames.indexOf('Sort B')).toBeLessThan(lunchNames.indexOf('Sort A'));
    // Stale (>30 days) usage must not rank — Sort C lands after recently used foods.
    expect(lunchNames.indexOf('Sort C')).toBeGreaterThan(lunchNames.indexOf('Sort A'));

    const breakfast = await request(app).get('/api/v1/foods?mealType=breakfast').set('Authorization', authHeader);
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
});
