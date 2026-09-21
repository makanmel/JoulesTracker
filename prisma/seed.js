import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultFoods = [
  { name: 'Chicken breast', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, isDefault: true },
  { name: 'White rice (cooked)', caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, isDefault: true },
  { name: 'Egg (large)', caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, isDefault: true },
  { name: 'Apple', caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 14, fatPer100g: 0.2, isDefault: true },
  { name: 'Greek yogurt', caloriesPer100g: 59, proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, isDefault: true },
];

async function main() {
  for (const food of defaultFoods) {
    const existing = await prisma.food.findFirst({ where: { name: food.name, isDefault: true } });
    if (!existing) {
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
