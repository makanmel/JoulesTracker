import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import foodRoutes from './routes/foods.js';
import mealRoutes from './routes/meals.js';
import dailyTargetRoutes from './routes/dailyTarget.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/foods', authenticate, foodRoutes);
  app.use('/api/v1/meals', authenticate, mealRoutes);
  app.use('/api/v1/daily-target', authenticate, dailyTargetRoutes);

  app.use(express.static('public'));

  app.use(errorHandler);

  return app;
}
