import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
} from '../../src/lib/auth.js';

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await comparePassword('secret123', hash)).toBe(true);
    expect(await comparePassword('wrong', hash)).toBe(false);
  });

  it('signs and verifies tokens', () => {
    const token = signToken({ userId: 'abc-123' });
    const payload = verifyToken(token);
    expect(payload.userId).toBe('abc-123');
  });
});
