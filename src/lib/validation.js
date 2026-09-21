import { z } from 'zod';
import { AppError } from './errors.js';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const foodSchema = z.object({
  name: z.string().min(1).max(200),
  caloriesPer100g: z.number().nonnegative(),
  proteinPer100g: z.number().nonnegative().default(0),
  carbsPer100g: z.number().nonnegative().default(0),
  fatPer100g: z.number().nonnegative().default(0),
});

export const foodUpdateSchema = foodSchema.partial();

export const mealSchema = z.object({
  foodId: z.string().uuid(),
  quantityGrams: z.number().positive(),
  mealDate: z.string().regex(dateRegex),
  mealType: z.enum(mealTypes),
});

export const mealUpdateSchema = mealSchema.partial();

export const dailyTargetSchema = z.object({
  targetDate: z.string().regex(dateRegex),
  targetCalories: z.number().nonnegative(),
});

export function parseRequest(schema, data) {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(message, 400);
    }
    throw err;
  }
}
