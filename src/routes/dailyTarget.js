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

function targetFields(target) {
  return {
    targetCalories: target?.targetCalories ?? null,
    proteinPct: target?.proteinPct ?? null,
    carbsPct: target?.carbsPct ?? null,
    fatPct: target?.fatPct ?? null,
    fiberGrams: target?.fiberGrams ?? null,
    saltGrams: target?.saltGrams ?? null,
    sugarGrams: target?.sugarGrams ?? null,
    saturatedFatGrams: target?.saturatedFatGrams ?? null,
    modes: target?.modes ? JSON.parse(target.modes) : null,
  };
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
    res.json({ date, targetDate: target?.targetDate ?? null, ...targetFields(target) });
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
    const fields = {
      targetCalories: data.targetCalories,
      proteinPct: data.proteinPct ?? null,
      carbsPct: data.carbsPct ?? null,
      fatPct: data.fatPct ?? null,
      fiberGrams: data.fiberGrams ?? null,
      saltGrams: data.saltGrams ?? null,
      sugarGrams: data.sugarGrams ?? null,
      saturatedFatGrams: data.saturatedFatGrams ?? null,
      modes: data.modes ? JSON.stringify(data.modes) : null,
    };
    const target = await prisma.dailyTarget.upsert({
      where: { userId_targetDate: { userId: req.user.id, targetDate: data.targetDate } },
      update: data.modes === undefined ? { ...fields, modes: undefined } : fields,
      create: {
        userId: req.user.id,
        targetDate: data.targetDate,
        ...fields,
      },
    });
    res.json(target);
  } catch (err) {
    next(err);
  }
});

export default router;
