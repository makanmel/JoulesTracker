import { Router, urlencoded } from 'express';
import { createHash, randomBytes } from 'node:crypto';
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
const credentialSchema = z.object({
  credential: z.string().min(1).max(10000).optional(),
  code: z.string().min(1).max(256).optional(),
  password: z.string().min(1).max(1024).optional(),
}).refine((data) => Boolean(data.credential) !== Boolean(data.code), { message: 'Provide either credential or code' });

// One-time codes hand a completed Google sign-in back to the app after a
// ux_mode=redirect round-trip (installed PWAs can't use the popup channel —
// the Google tab can't postMessage to the PWA window). Session codes are
// consumed on use; pending link codes stay until the password step succeeds.
const pendingGoogleAuth = new Map();

const issueCode = (payload) => {
  const code = randomBytes(24).toString('base64url');
  pendingGoogleAuth.set(code, { ...payload, expires: Date.now() + 10 * 60 * 1000 });
  return code;
};
const readCode = (code) => {
  const pending = pendingGoogleAuth.get(code);
  if (pending && pending.expires > Date.now()) return pending;
  pendingGoogleAuth.delete(code);
  return null;
};

async function resolveGoogleUser(identity, password) {
  const linkedUser = await prisma.user.findUnique({ where: { googleSubject: identity.subject } });
  if (linkedUser) return { user: linkedUser };
  const existing = await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: 'insensitive' } } });
  if (!existing) {
    return { user: await prisma.user.create({ data: { email: identity.email, googleSubject: identity.subject } }) };
  }
  if (existing.googleSubject) throw new AppError('This account is linked to a different Google identity', 409);
  if (!password) return { linkRequired: existing.email };
  const valid = existing.passwordHash && await comparePassword(password, existing.passwordHash);
  if (!valid) throw new AppError('Invalid credentials', 401);
  const linked = await prisma.user.updateMany({
    where: { id: existing.id, googleSubject: null },
    data: { googleSubject: identity.subject },
  });
  if (linked.count !== 1) throw new AppError('Account changed. Please retry Google sign-in.', 409);
  return { user: existing };
}

router.get('/config', configLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.json({ enabled: false });
  const nonce = createGoogleNonce();
  res.cookie(GOOGLE_NONCE_COOKIE, createHash('sha256').update(nonce).digest('hex'), { ...googleCookieOptions(), maxAge: 10 * 60 * 1000 });
  res.json({ enabled: true, clientId, nonce });
});

// Google POSTs the ID token here in ux_mode=redirect. The POST runs in the
// browser tab, not the PWA, so we stash the outcome behind a one-time code
// and redirect to the app. Whatever window opens the link — the tab, or the
// PWA via Android intent routing — redeems it through POST /.
router.post('/redirect', loginLimiter, urlencoded({ extended: false, limit: '8kb' }), (req, res) => {
  Promise.resolve().then(async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError('Google sign-in is not configured', 503);
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!credential) throw new AppError('Missing Google credential', 400);
    const identity = await verifyGoogleCredential(credential, readGoogleNonce(req), clientId, { allowMissingCookie: true });
    const outcome = await resolveGoogleUser(identity);
    const payload = outcome.linkRequired
      ? { identity }
      : { session: { email: outcome.user.email, accessToken: signToken({ userId: outcome.user.id }) } };
    res.redirect(`/?authCode=${issueCode(payload)}`);
  }).catch(() => res.redirect('/?authError=google'));
});

router.post('/', loginLimiter, (req, res, next) => {
  Promise.resolve().then(async () => {
    res.set('Cache-Control', 'no-store');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError('Google sign-in is not configured', 503);
    const data = parseRequest(credentialSchema, req.body);
    let identity;
    let pendingCode = null;
    if (data.code) {
      const pending = readCode(data.code);
      if (!pending) throw new AppError('Google sign-in session expired. Please retry.', 401);
      if (pending.session) {
        pendingGoogleAuth.delete(data.code);
        // A fresh code lets the browser tab offer an "open in app" link whose
        // redemption signs the PWA in too (WebAPKs have separate storage).
        return res.json({ ...pending.session, handoffCode: issueCode({ session: pending.session }) });
      }
      pendingCode = data.code; // consumed below only on success — mistyped passwords may retry
      identity = pending.identity;
    } else {
      identity = await verifyGoogleCredential(data.credential, readGoogleNonce(req), clientId);
    }
    const outcome = await resolveGoogleUser(identity, data.password);
    if (outcome.linkRequired) {
      return res.status(409).json({
        code: 'GOOGLE_LINK_REQUIRED',
        email: outcome.linkRequired,
        ...(pendingCode ? { linkCode: issueCode({ identity }) } : {}),
      });
    }
    if (pendingCode) pendingGoogleAuth.delete(pendingCode);
    const user = outcome.user;
    res.clearCookie(GOOGLE_NONCE_COOKIE, googleCookieOptions());
    res.json({ email: user.email, accessToken: signToken({ userId: user.id }) });
  }).catch((error) => next(error.code === 'P2002' ? new AppError('Account changed. Please retry sign-in.', 409) : error));
});

export default router;
