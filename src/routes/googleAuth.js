import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { comparePassword, signToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { parseRequest } from '../lib/validation.js';
import { createGoogleNonce, verifyGoogleCredential, readGoogleNonce, GOOGLE_NONCE_COOKIE, googleCookieOptions } from '../lib/googleAuth.js';

const router = Router();
const configLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });
const credentialSchema = z.object({ credential: z.string().min(1).max(10000), password: z.string().min(1).max(1024).optional() });

router.get('/config', configLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.json({ enabled: false });
  const nonce = createGoogleNonce();
  res.cookie(GOOGLE_NONCE_COOKIE, nonce, { ...googleCookieOptions(), maxAge: 10 * 60 * 1000 });
  res.json({ enabled: true, clientId, nonce });
});

router.post('/', loginLimiter, (req, res, next) => {
  Promise.resolve().then(async () => {
    res.set('Cache-Control', 'no-store');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError('Google sign-in is not configured', 503);
    const data = parseRequest(credentialSchema, req.body);
    const identity = await verifyGoogleCredential(data.credential, readGoogleNonce(req), clientId);
    let user = await prisma.user.findUnique({ where: { googleSubject: identity.subject } });
    if (!user) {
      const existing = await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: 'insensitive' } } });
      if (existing) {
        if (existing.googleSubject) throw new AppError('This account is linked to a different Google identity', 409);
        if (!data.password) return res.status(409).json({ code: 'GOOGLE_LINK_REQUIRED', email: identity.email });
        const valid = existing.passwordHash && await comparePassword(data.password, existing.passwordHash);
        if (!valid) throw new AppError('Invalid credentials', 401);
        const linked = await prisma.user.updateMany({
          where: { id: existing.id, googleSubject: null },
          data: { googleSubject: identity.subject },
        });
        if (linked.count !== 1) throw new AppError('Account changed. Please retry Google sign-in.', 409);
        user = existing;
      } else {
        user = await prisma.user.create({ data: { email: identity.email, googleSubject: identity.subject } });
      }
    }
    res.clearCookie(GOOGLE_NONCE_COOKIE, googleCookieOptions());
    res.json({ email: user.email, accessToken: signToken({ userId: user.id }) });
  }).catch((error) => next(error.code === 'P2002' ? new AppError('Account changed. Please retry sign-in.', 409) : error));
});

export default router;
