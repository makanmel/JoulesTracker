import dotenv from 'dotenv';
import { assertSafeTestDatabase } from './helpers/databaseSafety.js';

// Must run before src/lib/prisma.js evaluates: new PrismaClient() binds
// DATABASE_URL at construction and auto-loads .env, so it must see the
// test URL first (ESM evaluates imports in order).
process.env.NODE_ENV = 'test';
dotenv.config({ path: '.env.test', override: true });
assertSafeTestDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
