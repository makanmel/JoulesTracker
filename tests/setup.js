import './loadEnv.js';
import { assertConnectedDatabaseIsTest } from './helpers/databaseSafety.js';
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
  await assertConnectedDatabaseIsTest(prisma);
  await prisma.mealEntry.deleteMany({});
  await prisma.dailyTarget.deleteMany({});
  await prisma.food.deleteMany({ where: { isDefault: false } });
  await prisma.user.deleteMany({});
  await seedDefaultFoods();
});

afterAll(async () => {
  await prisma.$disconnect();
});
