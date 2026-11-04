import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from './errors.js';

const client = new OAuth2Client();
const secret = process.env.JWT_SECRET || 'dev-secret';
export const GOOGLE_NONCE_COOKIE = 'joules_google_nonce';
export const googleCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth/google',
});

export function createGoogleNonce() {
  return jwt.sign({ purpose: 'google-login', random: randomBytes(32).toString('hex') }, secret, { expiresIn: '10m' });
}

export function readGoogleNonce(req) {
  return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${GOOGLE_NONCE_COOKIE}=`))?.slice(GOOGLE_NONCE_COOKIE.length + 1);
}

export async function verifyGoogleCredential(credential, nonce, clientId) {
  if (!nonce || !/^[a-f0-9]{64}$/.test(nonce) || !clientId) throw new AppError('Google sign-in session expired. Please retry.', 401);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId }).catch(() => null);
  const payload = ticket?.getPayload();
  const tokenNonce = typeof payload?.nonce === 'string' ? payload.nonce : '';
  const challenge = await Promise.resolve().then(() => jwt.verify(tokenNonce, secret)).catch(() => null);
  if (challenge?.purpose !== 'google-login') throw new AppError('Google sign-in session expired. Please retry.', 401);
  const expected = Buffer.from(nonce);
  const actual = Buffer.from(createHash('sha256').update(tokenNonce).digest('hex'));
  if (!payload || actual.length !== expected.length || !timingSafeEqual(actual, expected)
    || payload.email_verified !== true || !payload.sub || typeof payload.sub !== 'string'
    || !z.string().email().max(254).safeParse(payload.email).success) {
    throw new AppError('Unable to verify Google sign-in. Please retry.', 401);
  }
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}
