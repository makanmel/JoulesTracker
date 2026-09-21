import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, mealSchema, mealUpdateSchema } from '../lib/validation.js';
import { calculateCalories } from '../lib/calculations.js';
import { AppError } from '../lib/errors.js';

const router = Router();

const mealTypeOrder = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

function mealItemResponse(meal) {
  return {
    id: meal.id,
    food: meal.food,
    quantityGrams: meal.quantityGrams,
    mealType: meal.mealType,
    calculatedCalories: meal.calculatedCalories,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function roundTotals(totals) {
  return {
    calories: round1(totals.calories),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) {
      throw new AppError('date query parameter is required', 400);
    }

    const items = await prisma.mealEntry.findMany({
      where: { userId: req.user.id, mealDate: date },
      include: { food: true },
      orderBy: { createdAt: 'asc' },
    });

    items.sort((a, b) => {
      const aOrder = mealTypeOrder[a.mealType] ?? 99;
      const bOrder = mealTypeOrder[b.mealType] ?? 99;
      return aOrder - bOrder;
    });

    const totals = items.reduce(
      (acc, meal) => {
        const ratio = meal.quantityGrams / 100;
        acc.calories += meal.calculatedCalories;
        acc.protein += meal.food.proteinPer100g * ratio;
        acc.carbs += meal.food.carbsPer100g * ratio;
        acc.fat += meal.food.fatPer100g * ratio;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    res.json({
      date,
      items: items.map(mealItemResponse),
      totals: roundTotals(totals),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = parseRequest(mealSchema, req.body);
    const food = await prisma.food.findUnique({ where: { id: data.foodId } });
    if (!food) {
      throw new AppError('Food not found', 404);
    }
    const calculatedCalories = calculateCalories(food.caloriesPer100g, data.quantityGrams);
    const meal = await prisma.mealEntry.create({
      data: {
        userId: req.user.id,
        foodId: data.foodId,
        quantityGrams: data.quantityGrams,
        mealDate: data.mealDate,
        mealType: data.mealType,
        calculatedCalories,
      },
      include: { food: true },
    });
    res.status(201).json(mealItemResponse(meal));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.mealEntry.findUnique({
      where: { id: req.params.id },
      include: { food: true },
    });
    if (!existing) {
      throw new AppError('Meal not found', 404);
    }
    if (existing.userId !== req.user.id) {
      throw new AppError('Forbidden', 403);
    }

    const data = parseRequest(mealUpdateSchema, req.body);
    let food = existing.food;
    if (data.foodId) {
      food = await prisma.food.findUnique({ where: { id: data.foodId } });
      if (!food) {
        throw new AppError('Food not found', 404);
      }
    }

    const quantityGrams = data.quantityGrams ?? existing.quantityGrams;
    const calculatedCalories = calculateCalories(food.caloriesPer100g, quantityGrams);

    const updated = await prisma.mealEntry.update({
      where: { id: req.params.id },
      data: {
        ...data,
        calculatedCalories,
      },
      include: { food: true },
    });
    res.json(mealItemResponse(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.mealEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw new AppError('Meal not found', 404);
    }
    if (existing.userId !== req.user.id) {
      throw new AppError('Forbidden', 403);
    }
    await prisma.mealEntry.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
