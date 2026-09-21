import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, foodSchema, foodUpdateSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const where = {
      AND: [
        { name: { contains: q } },
        { OR: [{ isDefault: true }, { createdById: req.user.id }] },
      ],
    };

    const [items, total] = await Promise.all([
      prisma.food.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      prisma.food.count({ where }),
    ]);

    res.json({ items, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = parseRequest(foodSchema, req.body);
    const food = await prisma.food.create({
      data: { ...data, createdById: req.user.id },
    });
    res.status(201).json(food);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const food = await prisma.food.findUnique({ where: { id: req.params.id } });
    if (!food) {
      throw new AppError('Food not found', 404);
    }
    if (!food.isDefault && food.createdById !== req.user.id) {
      throw new AppError('Forbidden', 403);
    }
    res.json(food);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const food = await prisma.food.findUnique({ where: { id: req.params.id } });
    if (!food) {
      throw new AppError('Food not found', 404);
    }
    if (food.isDefault || food.createdById !== req.user.id) {
      throw new AppError('Forbidden', 403);
    }
    const data = parseRequest(foodUpdateSchema, req.body);
    const updated = await prisma.food.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const food = await prisma.food.findUnique({ where: { id: req.params.id } });
    if (!food) {
      throw new AppError('Food not found', 404);
    }
    if (food.isDefault || food.createdById !== req.user.id) {
      throw new AppError('Forbidden', 403);
    }
    await prisma.food.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2003') {
      return next(new AppError('Food is referenced by meal entries', 409));
    }
    next(err);
  }
});

export default router;
