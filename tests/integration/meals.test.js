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
  food = await prisma.food.findFirst({ where: { isDefault: true } });
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
