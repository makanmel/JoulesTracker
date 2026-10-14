import dotenv from 'dotenv';
import { assertSafeTestDatabase } from './helpers/databaseSafety.js';

process.env.NODE_ENV = 'test';
dotenv.config({ path: '.env.test', override: true });
assertSafeTestDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);

import { prisma } from '../src/lib/prisma.js';

const defaultFoods = [
  { name: 'Chicken breast', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, isDefault: true },
  { name: 'White rice (cooked)', caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, isDefault: true },
  { name: 'Egg (large)', caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, isDefault: true },
  { name: 'Apple', caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 14, fatPer100g: 0.2, isDefault: true },
  { name: 'Greek yogurt', caloriesPer100g: 59, proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, isDefault: true },
  { name: 'Buckwheat (cooked)', caloriesPer100g: 132, proteinPer100g: 4.5, carbsPer100g: 24, fatPer100g: 1.6, isDefault: true },
  { name: 'Pasta (cooked)', caloriesPer100g: 131, proteinPer100g: 5, carbsPer100g: 25, fatPer100g: 1.1, isDefault: true },
  { name: 'Fried potato', caloriesPer100g: 164, proteinPer100g: 2.5, carbsPer100g: 20, fatPer100g: 8.7, isDefault: true },
  { name: 'Roasted pork', caloriesPer100g: 247, proteinPer100g: 27, carbsPer100g: 0, fatPer100g: 15, isDefault: true },
  { name: 'Mashed potato', caloriesPer100g: 113, proteinPer100g: 2, carbsPer100g: 17, fatPer100g: 4.3, isDefault: true },
  { name: 'Beef stew', caloriesPer100g: 172, proteinPer100g: 22, carbsPer100g: 4, fatPer100g: 7, isDefault: true },
  { name: 'Omelette', caloriesPer100g: 154, proteinPer100g: 11, carbsPer100g: 1.4, fatPer100g: 11, isDefault: true },
];

async function seedDefaultFoods() {
  for (const food of defaultFoods) {
    const existing = await prisma.food.findFirst({ where: { name: food.name, isDefault: true } });
    if (!existing) {
      await prisma.food.create({ data: food });
    }
  }
}

beforeEach(async () => {
  await prisma.mealEntry.deleteMany({});
  await prisma.dailyTarget.deleteMany({});
  await prisma.food.deleteMany({ where: { isDefault: false } });
  await prisma.user.deleteMany({});
  await seedDefaultFoods();
});

afterAll(async () => {
  await prisma.$disconnect();
});
