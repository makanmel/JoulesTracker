import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { parseRequest, profileSchema } from '../lib/validation.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function sanitizeProfile(user) {
  return {
    weightKg: user.weightKg,
    heightCm: user.heightCm,
    age: user.age,
    gender: user.gender,
    activityLevel: user.activityLevel,
  };
}

router.get('/profile', profileLimiter, authenticate, async (req, res, next) => {
  try {
    res.json(sanitizeProfile(req.user));
  } catch (err) {
    next(err);
  }
});

router.put('/profile', profileLimiter, authenticate, async (req, res, next) => {
  try {
    const data = parseRequest(profileSchema, req.body);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
    });
    res.json(sanitizeProfile(user));
  } catch (err) {
    next(err);
  }
});

export default router;
