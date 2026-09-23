import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, foodSchema, foodUpdateSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';
import { searchProducts, getProductByBarcode, isValidBarcode } from '../lib/openFoodFacts.js';

const router = Router();

function visibleTo(userId) {
  return { OR: [{ isDefault: true }, { createdById: userId }] };
}

function findLocalByBarcode(barcode, userId) {
  return prisma.food.findFirst({
    where: { AND: [{ barcode }, visibleTo(userId)] },
    orderBy: [{ createdById: 'desc' }, { isDefault: 'desc' }],
  });
}

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const where = {
      AND: [{ name: { contains: q, mode: 'insensitive' } }, visibleTo(req.user.id)],
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

router.get('/external/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      throw new AppError('q query parameter must be at least 2 characters', 400);
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const result = await searchProducts(q, { limit, page });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const { barcode } = req.params;
    if (!isValidBarcode(barcode)) {
      throw new AppError('Barcode must be 8-14 digits', 400);
    }

    const local = await findLocalByBarcode(barcode, req.user.id);
    if (local) {
      return res.json({ source: 'local', saved: true, food: local });
    }

    const product = await getProductByBarcode(barcode);
    if (!product) {
      throw new AppError('Product not found. You can create it as a custom food.', 404);
    }
    res.json({ source: 'openfoodfacts', saved: false, food: product });
  } catch (err) {
    next(err);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const barcode = String(req.body?.barcode || '');
    if (!isValidBarcode(barcode)) {
      throw new AppError('Barcode must be 8-14 digits', 400);
    }

    const existing = await findLocalByBarcode(barcode, req.user.id);
    if (existing) {
      return res.json(existing);
    }

    const product = await getProductByBarcode(barcode);
    if (!product) {
      throw new AppError('Product not found. You can create it as a custom food.', 404);
    }
    const food = await prisma.food.create({
      data: { ...product, createdById: req.user.id },
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
