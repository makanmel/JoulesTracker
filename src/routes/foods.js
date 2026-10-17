import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parseRequest, foodSchema, foodUpdateSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';
import { searchProducts, getProductByBarcode, isValidBarcode, mapProduct } from '../lib/openFoodFacts.js';
import { parseVoiceInput } from '../lib/voiceParser.js';
import { recognizePhoto } from '../lib/photoRecognizer.js';

const router = Router();

function visibleTo(userId) {
  return { OR: [{ isDefault: true }, { isPublic: true }, { createdById: userId }] };
}

function findLocalByBarcode(barcode, userId) {
  return prisma.food.findFirst({
    where: { AND: [{ barcode }, visibleTo(userId)] },
    orderBy: [{ createdById: 'desc' }, { isDefault: 'desc' }],
  });
}

function nameMatches(name) {
  const like = { contains: name, mode: 'insensitive' };
  return { OR: [{ name: like }, { nameUk: like }] };
}

// Recognized items can arrive in either locale; try every variant.
function findLocalByNames(names, userId) {
  const candidates = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!candidates.length) return Promise.resolve(null);
  return prisma.food.findFirst({
    where: { AND: [{ OR: candidates.map(nameMatches) }, visibleTo(userId)] },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const mealType = req.query.mealType || null;

    const where = {
      AND: [nameMatches(q), visibleTo(req.user.id)],
    };

    // Own + community foods rank before shared defaults; with mealType, fetch all matches and sort by usage in JS before paging.
    const [items, total] = await Promise.all([
      prisma.food.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdById: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
        ...(mealType ? {} : { take: limit, skip: offset }),
      }),
      prisma.food.count({ where }),
    ]);

    let page = items;
    if (mealType) {
      // Habits change — only recent meals should drive the ranking.
      const usageCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const usage = await prisma.mealEntry.groupBy({
        by: ['foodId'],
        where: { userId: req.user.id, mealType, mealDate: { gte: usageCutoff } },
        _count: { foodId: true },
        _max: { createdAt: true },
      });
      const usageByFood = new Map(usage.map((u) => [u.foodId, u]));
      items.sort((a, b) => {
        const ua = usageByFood.get(a.id);
        const ub = usageByFood.get(b.id);
        if (!ua && !ub) return 0;
        if (!ua) return 1;
        if (!ub) return -1;
        const byCount = ub._count.foodId - ua._count.foodId;
        if (byCount !== 0) return byCount;
        return (ub._max.createdAt?.getTime() ?? 0) - (ua._max.createdAt?.getTime() ?? 0);
      });
      page = items.slice(offset, offset + limit);
    }

    res.json({ items: page, total, limit, offset });
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

router.get('/ai-config', (req, res) => {
  res.json({ configured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY) });
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
    const mealCount = await prisma.mealEntry.count({ where: { foodId: food.id } });
    if (mealCount > 0) {
      throw new AppError('Food is referenced by meal entries', 409);
    }
    await prisma.food.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2003' || err.code === '23001') {
      return next(new AppError('Food is referenced by meal entries', 409));
    }
    next(err);
  }
});

router.post('/parse-voice', async (req, res, next) => {
  try {
    const transcript = String(req.body.transcript || '').trim();
    if (transcript.length < 2) {
      throw new AppError('Transcript must be at least 2 characters', 400);
    }
    const locale = req.body.locale === 'uk' ? 'uk' : 'en';
    const provider = req.headers['x-ai-provider'];
    const apiKey = req.headers['x-ai-key'];
    const model = req.headers['x-ai-model'];
    const items = await parseVoiceInput({ transcript, locale, provider, apiKey, model });
    const resolved = await Promise.all(
      items.map(async (item) => {
        const local = await findLocalByNames([item.name, item.nameEn, item.nameUk], req.user.id);
        return local ? { ...item, foodId: local.id } : item;
      }),
    );
    res.json({ items: resolved });
  } catch (err) {
    next(err);
  }
});

router.post('/recognize-photo', async (req, res, next) => {
  try {
    const image = String(req.body.image || '');
    if (!image.startsWith('data:image/')) {
      throw new AppError('Invalid image data', 400);
    }
    const [header, base64] = image.split(',');
    const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    if (!base64 || base64.length < 100) {
      throw new AppError('Invalid image data', 400);
    }

    const locale = req.body.locale === 'uk' ? 'uk' : 'en';
    const provider = req.headers['x-ai-provider'];
    const apiKey = req.headers['x-ai-key'];
    const model = req.headers['x-ai-model'];
    const ai = await recognizePhoto({ imageBase64: base64, mime, locale, provider, apiKey, model });

    const resolved = await Promise.all(
      ai.items.map(async (item) => ({
        item,
        local: await findLocalByNames([item.name, item.nameEn, item.nameUk], req.user.id),
        off: null,
      })),
    );

    // OpenFoodFacts lookups are slow; only query it for the first few items
    // that have no local match — the rest fall back to AI macros.
    await Promise.all(
      resolved
        .filter((entry) => !entry.local)
        .slice(0, 3)
        .map(async (entry) => {
          entry.off = await searchProducts(entry.item.name, { limit: 5, page: 1 }).then(
            (search) => search.items.map(mapProduct).find(Boolean) || null,
            () => null,
          );
        }),
    );

    const items = resolved.map((entry) => {
      const { item, local, off } = entry;
      if (local) {
        return { source: 'local', saved: true, food: local, weightGrams: item.weightGrams };
      }
      if (off) {
        return { source: 'openfoodfacts', saved: false, food: off, weightGrams: item.weightGrams };
      }
      return {
        source: 'ai',
        saved: false,
        weightGrams: item.weightGrams,
        food: {
          name: item.nameEn || item.name,
          nameUk: item.nameUk || (locale === 'uk' ? item.name : null),
          source: 'ai',
          caloriesPer100g: item.caloriesPer100g ?? 0,
          proteinPer100g: item.proteinPer100g ?? 0,
          carbsPer100g: item.carbsPer100g ?? 0,
          fatPer100g: item.fatPer100g ?? 0,
          saturatedFatPer100g: 0,
          sugarPer100g: 0,
          fiberPer100g: 0,
          saltPer100g: 0,
          brand: null,
          category: null,
          barcode: null,
        },
      };
    });

    res.json({ items, confidence: ai.confidence });
  } catch (err) {
    next(err);
  }
});

export default router;
