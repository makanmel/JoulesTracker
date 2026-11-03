import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { onlineCount } from '../lib/presence.js';
import { parseRequest, profileSchema, onboardingSchema } from '../lib/validation.js';
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
    birthDate: user.birthDate,
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

router.get('/stats', profileLimiter, authenticate, async (req, res, next) => {
  try {
    const registered = await prisma.user.count();
    res.json({ online: onlineCount(), registered });
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

router.get('/onboarding', profileLimiter, authenticate, (req, res) => {
  res.json({ state: req.user.onboardingState });
});

router.put('/onboarding', profileLimiter, authenticate, (req, res, next) => {
  const { state } = parseRequest(onboardingSchema, req.body);
  prisma.user.update({
    where: { id: req.user.id },
    data: { onboardingState: state },
    select: { onboardingState: true },
  }).then((user) => res.json({ state: user.onboardingState })).catch(next);
});

export default router;
