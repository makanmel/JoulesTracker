import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabase } from '../helpers/databaseSafety.js';

const testUrl = 'postgresql://postgres:postgres@localhost:5432/joules_test';

describe('test database safety', () => {
  it('accepts a dedicated PostgreSQL test database', () => {
    expect(() => assertSafeTestDatabase(testUrl, 'test')).not.toThrow();
  });

  it.each([
    ['production environment', testUrl, 'production'],
    ['missing URL', undefined, 'test'],
    ['SQLite URL', 'file:./test.db', 'test'],
    ['production database name', 'postgresql://user:pass@production.example/neondb', 'test'],
    ['misleading database name', 'postgresql://user:pass@production.example/test_backup', 'test'],
  ])('rejects %s', (_, databaseUrl, nodeEnv) => {
    expect(() => assertSafeTestDatabase(databaseUrl, nodeEnv)).toThrow(/Refusing|require/);
  });
});
