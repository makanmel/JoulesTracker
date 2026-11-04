import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken(options) { return verifyIdToken(options); } } }));

const app = createApp();
const originalClientId = process.env.GOOGLE_CLIENT_ID;
let agent;
let claims;
let clientNumber = 1;

beforeEach(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  agent = request.agent(app).set('X-Forwarded-For', `198.51.100.${clientNumber++}`);
  const response = await agent.get('/api/v1/auth/google/config');
  claims = { sub: 'google-subject-1', email: 'google-user@example.com', email_verified: true, nonce: response.body.nonce };
  verifyIdToken.mockReset();
  verifyIdToken.mockImplementation(async () => ({ getPayload: () => claims }));
});

afterEach(() => {
  if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalClientId;
});

const signIn = (body = {}) => agent.post('/api/v1/auth/google').send({ credential: 'google-id-token', ...body });

describe('Google sign-in', () => {
  it('stays disabled without configuration while password registration works', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const config = await agent.get('/api/v1/auth/google/config');
    expect(config.body).toEqual({ enabled: false });
    expect((await signIn()).status).toBe(503);
    expect((await agent.post('/api/v1/auth/register').send({ email: 'backup@example.com', password: 'password123' })).status).toBe(201);
  });

  it('creates a Google-only account with a usable application session', async () => {
    const result = await signIn();
    expect(result.status).toBe(200);
    expect(result.body.accessToken).toBeDefined();
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'google-id-token', audience: process.env.GOOGLE_CLIENT_ID });
    const user = await prisma.user.findUnique({ where: { email: claims.email } });
    expect(user.googleSubject).toBe(claims.sub);
    expect(user.passwordHash).toBeNull();
    const me = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${result.body.accessToken}`);
    expect(me.body.id).toBe(user.id);
    expect((await agent.post('/api/v1/auth/login').send({ email: claims.email, password: 'anything' })).status).toBe(401);
    expect(result.headers['set-cookie'].join(';')).toContain('Expires=Thu, 01 Jan 1970');
    expect((await signIn()).status).toBe(401);
  });

  it('finds returning users by Google subject even if Google email changes', async () => {
    const user = await prisma.user.create({ data: { email: 'original@example.com', googleSubject: claims.sub } });
    const result = await signIn();
    expect(result.status).toBe(200);
    expect(result.body.email).toBe(user.email);
    expect(await prisma.user.count()).toBe(1);
  });

  it('requires the existing password before linking an unverified local account', async () => {
    await agent.post('/api/v1/auth/register').send({ email: claims.email, password: 'password123' });
    const first = await signIn();
    expect(first.status).toBe(409);
    expect(first.body.code).toBe('GOOGLE_LINK_REQUIRED');
    expect((await prisma.user.findUnique({ where: { email: claims.email } })).googleSubject).toBeNull();
    expect((await signIn({ password: 'wrong-password' })).status).toBe(401);
    expect((await signIn({ password: 'password123' })).status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: claims.email } });
    expect(user.googleSubject).toBe(claims.sub);
    expect(user.passwordHash).not.toBeNull();
    expect((await agent.post('/api/v1/auth/login').send({ email: claims.email, password: 'password123' })).status).toBe(200);
  });

  it('links historical mixed-case addresses without creating another account', async () => {
    await agent.post('/api/v1/auth/register').send({ email: claims.email, password: 'password123' });
    await prisma.user.updateMany({ data: { email: 'GOOGLE-USER@EXAMPLE.COM' } });
    expect((await signIn()).body.code).toBe('GOOGLE_LINK_REQUIRED');
    expect((await signIn({ password: 'password123' })).status).toBe(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it('does not relink an account already associated with another subject', async () => {
    await prisma.user.create({ data: { email: claims.email, googleSubject: 'another-subject' } });
    expect((await signIn()).status).toBe(409);
  });

  it('rejects missing and fabricated nonce cookies before verifying credentials', async () => {
    expect((await request(app).post('/api/v1/auth/google').send({ credential: 'token' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/google').set('Cookie', 'joules_google_nonce=fake').send({ credential: 'token' })).status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects expired nonce challenges', async () => {
    const nonce = jwt.sign({ purpose: 'google-login' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: -1 });
    expect((await request(app).post('/api/v1/auth/google').set('Cookie', `joules_google_nonce=${nonce}`).send({ credential: 'token' })).status).toBe(401);
  });

  it('rejects mismatched nonce claims and unverified email', async () => {
    const nonce = claims.nonce;
    claims.nonce = 'different-session';
    expect((await signIn()).status).toBe(401);
    claims.nonce = nonce;
    claims.email_verified = false;
    expect((await signIn()).status).toBe(401);
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects token verification failures and malformed credential requests', async () => {
    verifyIdToken.mockRejectedValue(new Error('Invalid signature, issuer, audience or expiration'));
    expect((await signIn()).status).toBe(401);
    expect((await agent.post('/api/v1/auth/google').send({})).status).toBe(400);
  });
});
