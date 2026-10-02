import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, dailyTargetSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';
import { calculateBmr, calculateTdee } from '../lib/bmr.js';

const router = Router();

function previousDateString(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) {
      throw new AppError('date query parameter is required', 400);
    }
    const target = await prisma.dailyTarget.findFirst({
      where: { userId: req.user.id, targetDate: { lte: date } },
      orderBy: { targetDate: 'desc' },
    });
    res.json({ date, targetDate: target?.targetDate ?? null, targetCalories: target?.targetCalories ?? null });
  } catch (err) {
    next(err);
  }
});

router.get('/suggest', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) {
      throw new AppError('date query parameter is required', 400);
    }

    const [target, previous] = await Promise.all([
      prisma.dailyTarget.findUnique({
        where: { userId_targetDate: { userId: req.user.id, targetDate: date } },
      }),
      prisma.dailyTarget.findUnique({
        where: { userId_targetDate: { userId: req.user.id, targetDate: previousDateString(date) } },
      }),
    ]);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const bmr = calculateBmr(user);
    const tdee = calculateTdee(user);

    res.json({
      date,
      targetCalories: target?.targetCalories ?? null,
      previousDate: previousDateString(date),
      previousTargetCalories: previous?.targetCalories ?? null,
      bmr,
      tdee,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const data = parseRequest(dailyTargetSchema, req.body);
    const target = await prisma.dailyTarget.upsert({
      where: { userId_targetDate: { userId: req.user.id, targetDate: data.targetDate } },
      update: { targetCalories: data.targetCalories },
      create: {
        userId: req.user.id,
        targetDate: data.targetDate,
        targetCalories: data.targetCalories,
      },
    });
    res.json(target);
  } catch (err) {
    next(err);
  }
});

export default router;
