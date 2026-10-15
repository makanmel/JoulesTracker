import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import foodRoutes from './routes/foods.js';
import mealRoutes from './routes/meals.js';
import dailyTargetRoutes from './routes/dailyTarget.js';
import userRoutes from './routes/users.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimit } from 'express-rate-limit';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  // Render sits behind a proxy; trust one hop so req.ip resolves correctly
  // and express-rate-limit stops throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set('trust proxy', 1);

  app.use(cors());
  // Photo scans upload a base64 image — keep the limit tight but sufficient.
  app.use(express.json({ limit: '4mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: pkg.version });
  });

  app.use('/api/v1', apiLimiter);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/foods', authenticate, foodRoutes);
  app.use('/api/v1/meals', authenticate, mealRoutes);
  app.use('/api/v1/daily-target', authenticate, dailyTargetRoutes);
  app.use('/api/v1/users', authenticate, userRoutes);

  app.use(express.static('public'));

  app.use(errorHandler);

  return app;
}
