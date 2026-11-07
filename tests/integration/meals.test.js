import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin } from '../helpers/auth.js';
import { prisma } from '../../src/lib/prisma.js';

const app = createApp();
let authHeader;
let food;

beforeEach(async () => {
  const { token } = await registerAndLogin(app);
  authHeader = `Bearer ${token}`;
  food = await prisma.food.findFirst({ where: { isDefault: true, name: 'Chicken breast' } });
});

describe('Meal endpoints', () => {
  it('logs a meal and calculates calories', async () => {
    const res = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 150,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    expect(res.status).toBe(201);
    expect(res.body.calculatedCalories).toBe(247.5);
  });

  it('returns daily totals', async () => {
    await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 150,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    const res = await request(app)
      .get('/api/v1/meals?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-09-21');
    expect(res.body.items.length).toBe(1);
    expect(res.body.totals.calories).toBe(247.5);
    expect(res.body.totals.protein).toBe(46.5);
  });

  it('removes deleted meal from totals', async () => {
    const meal = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 150,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    await request(app)
      .delete(`/api/v1/meals/${meal.body.id}`)
      .set('Authorization', authHeader);

    const res = await request(app)
      .get('/api/v1/meals?date=2026-09-21')
      .set('Authorization', authHeader);

    expect(res.body.items.length).toBe(0);
    expect(res.body.totals.calories).toBe(0);
  });

  it('recalculates calories on quantity update', async () => {
    const meal = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 100,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    const res = await request(app)
      .patch(`/api/v1/meals/${meal.body.id}`)
      .set('Authorization', authHeader)
      .send({ quantityGrams: 200 });

    expect(res.status).toBe(200);
    expect(res.body.calculatedCalories).toBe(330);
  });

  it('moves a meal entry between meal types', async () => {
    const meal = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 100,
        mealDate: '2026-09-21',
        mealType: 'breakfast',
      });

    const res = await request(app)
      .patch(`/api/v1/meals/${meal.body.id}`)
      .set('Authorization', authHeader)
      .send({ mealType: 'dinner' });

    expect(res.status).toBe(200);
    expect(res.body.mealType).toBe('dinner');
  });

  it('copies all meals from one date to another', async () => {
    await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({ foodId: food.id, quantityGrams: 150, mealDate: '2026-09-21', mealType: 'lunch' });
    await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({ foodId: food.id, quantityGrams: 50, mealDate: '2026-09-21', mealType: 'snack' });

    const res = await request(app)
      .post('/api/v1/meals/copy')
      .set('Authorization', authHeader)
      .send({ fromDate: '2026-09-21', toDate: '2026-09-22' });

    expect(res.status).toBe(201);
    expect(res.body.copied).toBe(2);

    const target = await request(app)
      .get('/api/v1/meals?date=2026-09-22')
      .set('Authorization', authHeader);

    expect(target.body.items.length).toBe(2);
    expect(target.body.totals.calories).toBe(330);
    expect(target.body.items[0].mealType).toBe('lunch');
    expect(target.body.items[1].mealType).toBe('snack');
  });

  it('copy does not touch other users meals', async () => {
    const other = await registerAndLogin(app);
    await request(app)
      .post('/api/v1/meals')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ foodId: food.id, quantityGrams: 100, mealDate: '2026-09-21', mealType: 'lunch' });

    const res = await request(app)
      .post('/api/v1/meals/copy')
      .set('Authorization', authHeader)
      .send({ fromDate: '2026-09-21', toDate: '2026-09-22' });

    expect(res.body.copied).toBe(0);
  });

  it('rejects copy when dates are equal or missing', async () => {
    const same = await request(app)
      .post('/api/v1/meals/copy')
      .set('Authorization', authHeader)
      .send({ fromDate: '2026-09-21', toDate: '2026-09-21' });
    expect(same.status).toBe(400);

    const missing = await request(app)
      .post('/api/v1/meals/copy')
      .set('Authorization', authHeader)
      .send({ fromDate: '2026-09-21' });
    expect(missing.status).toBe(400);
  });

  it('blocks editing another user meal', async () => {
    const other = await registerAndLogin(app);
    const meal = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 100,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    const res = await request(app)
      .patch(`/api/v1/meals/${meal.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ quantityGrams: 200 });

    expect(res.status).toBe(403);
  });

  it('blocks deleting another user meal', async () => {
    const other = await registerAndLogin(app);
    const meal = await request(app)
      .post('/api/v1/meals')
      .set('Authorization', authHeader)
      .send({
        foodId: food.id,
        quantityGrams: 100,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      });

    const res = await request(app)
      .delete(`/api/v1/meals/${meal.body.id}`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(res.status).toBe(403);
  });
});
