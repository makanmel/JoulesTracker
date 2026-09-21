import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, dailyTargetSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) {
      throw new AppError('date query parameter is required', 400);
    }
    const target = await prisma.dailyTarget.findUnique({
      where: { userId_targetDate: { userId: req.user.id, targetDate: date } },
    });
    res.json({ date, targetCalories: target?.targetCalories ?? null });
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
