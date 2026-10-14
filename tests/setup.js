import dotenv from 'dotenv';
import { assertSafeTestDatabase } from './helpers/databaseSafety.js';

process.env.NODE_ENV = 'test';
dotenv.config({ path: '.env.test', override: true });
assertSafeTestDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);

import { prisma } from '../src/lib/prisma.js';
import { topFoods } from '../prisma/topFoods.js';

const defaultFoods = topFoods.map((food) => ({ ...food, isDefault: true, isPublic: true }));

async function seedDefaultFoods() {
  for (const food of defaultFoods) {
    const existing = await prisma.food.findFirst({ where: { name: food.name, isDefault: true } });
    if (existing) {
      await prisma.food.update({ where: { id: existing.id }, data: food });
    } else {
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
