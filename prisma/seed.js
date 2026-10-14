import { PrismaClient } from '@prisma/client';
import { topFoods } from './topFoods.js';

const prisma = new PrismaClient();

const defaultFoods = topFoods.map((food) => ({ ...food, isDefault: true, isPublic: true }));

async function main() {
  for (const food of defaultFoods) {
    const existing = await prisma.food.findFirst({ where: { name: food.name, isDefault: true } });
    if (existing) {
      await prisma.food.update({ where: { id: existing.id }, data: food });
    } else {
      await prisma.food.create({ data: food });
    }
  }
  console.log('Seeded default foods');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
