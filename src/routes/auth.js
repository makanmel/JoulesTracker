import { Router } from 'express';
import { hashPassword, comparePassword, signToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { parseRequest, registerSchema, loginSchema } from '../lib/validation.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const data = parseRequest(registerSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError('Email already exists', 409);
    }
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash },
    });
    const accessToken = signToken({ userId: user.id });
    res.status(201).json({
      id: user.id,
      email: user.email,
      accessToken,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = parseRequest(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }
    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }
    const accessToken = signToken({ userId: user.id });
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, (req, res) => {
  res.status(204).send();
});

export default router;
