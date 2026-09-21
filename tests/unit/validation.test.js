import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  foodSchema,
  mealSchema,
  dailyTargetSchema,
  parseRequest,
} from '../../src/lib/validation.js';

describe('registerSchema', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(() => registerSchema.parse({ email: 'a@b.com', password: 'short' })).toThrow();
  });

  it('rejects invalid email addresses', () => {
    expect(() =>
      registerSchema.parse({ email: 'not-an-email', password: 'password123' })
    ).toThrow();
  });

  it('accepts valid input', () => {
    expect(() =>
      registerSchema.parse({ email: 'user@example.com', password: 'password123' })
    ).not.toThrow();
  });
});

describe('foodSchema', () => {
  it('rejects empty name', () => {
    expect(() => foodSchema.parse({ name: '', caloriesPer100g: 100 })).toThrow();
  });

  it('rejects negative calories', () => {
    expect(() => foodSchema.parse({ name: 'X', caloriesPer100g: -1 })).toThrow();
  });

  it('rejects negative macros', () => {
    expect(() =>
      foodSchema.parse({ name: 'X', caloriesPer100g: 100, proteinPer100g: -1 })
    ).toThrow();
  });
});

describe('mealSchema', () => {
  it('rejects invalid mealType', () => {
    expect(() =>
      mealSchema.parse({
        foodId: '550e8400-e29b-41d4-a716-446655440000',
        quantityGrams: 100,
        mealDate: '2026-09-21',
        mealType: 'brunch',
      })
    ).toThrow();
  });

  it('rejects non-positive quantity', () => {
    expect(() =>
      mealSchema.parse({
        foodId: '550e8400-e29b-41d4-a716-446655440000',
        quantityGrams: 0,
        mealDate: '2026-09-21',
        mealType: 'lunch',
      })
    ).toThrow();
  });

  it('rejects malformed date', () => {
    expect(() =>
      mealSchema.parse({
        foodId: '550e8400-e29b-41d4-a716-446655440000',
        quantityGrams: 100,
        mealDate: '21-09-2026',
        mealType: 'lunch',
      })
    ).toThrow();
  });
});

describe('dailyTargetSchema', () => {
  it('rejects negative target', () => {
    expect(() =>
      dailyTargetSchema.parse({ targetDate: '2026-09-21', targetCalories: -1 })
    ).toThrow();
  });
});

describe('parseRequest', () => {
  it('throws AppError with status 400 on validation failure', () => {
    expect(() => parseRequest(foodSchema, { name: '', caloriesPer100g: 100 })).toThrow(
      'name: String must contain at least 1 character(s)'
    );
  });
});
