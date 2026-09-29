# JoulesTracker

Calorie and macronutrient tracker.

## Themes

Choose a visual preset from Settings. To add a preset, append a theme object with the documented schema to `public/themes.js` and add its translated `nameKey` to both locale files.

## Food database

Foods store per-100g calories, protein, carbs, fat plus fiber, sugar, saturated fat and salt, and may carry a barcode, brand and category. Besides the local catalog, the Foods panel searches the Ukrainian [OpenFoodFacts](https://ua.openfoodfacts.org) dataset (`GET /api/v1/foods/external/search?q=`), looks products up by barcode (`GET /api/v1/foods/barcode/:barcode`, local catalog first) and imports them into the user's catalog (`POST /api/v1/foods/import`). When a product is not found, the custom-food form is prefilled so the user can create it manually. Set `OPENFOODFACTS_BASE_URL` to point at a different OpenFoodFacts instance.

## Development workflow

All changes go through Pull Requests. CI runs tests and lint on every PR and on every push to `main`. See `CONTRIBUTING.md` for details.

### Test database safety

Tests delete database records before each case. Never point `.env.test` at a development or production database.

1. Create a dedicated PostgreSQL database whose name ends with `_test`, such as `joules_test`.
2. Copy `.env.test.example` to `.env.test` and update its connection details (`DATABASE_URL` and `DATABASE_DIRECT_URL` can point to the same test database).
3. Apply migrations with `npx prisma migrate deploy` using the test database URL.
4. Run `npm test`.

The test setup overrides inherited environment values and refuses destructive cleanup unless `NODE_ENV` is `test`, the URL uses PostgreSQL, and the database name ends with `_test`. CI uses the dedicated `joules_test` database.

## Deployment

The app is deployed on [Render](https://render.com) as a free web service defined in `render.yaml`, backed by a free [Neon](https://neon.tech) Postgres database. Every merge to `main` is deployed automatically once CI checks pass; on startup the service runs `prisma migrate deploy` and the idempotent seed, so schema migrations and default foods are applied with each release.

One-time setup:

1. Create a Neon project and copy its **direct** (non-pooled) connection string, e.g. `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require` (Prisma migrations do not run through the pooler).
2. In Render, choose **New → Blueprint**, connect this repository and apply `render.yaml`.
3. When prompted, set `DATABASE_URL` to the Neon connection string (`JWT_SECRET` is generated automatically).
4. If your `DATABASE_URL` points to a pooled endpoint, also set `DATABASE_DIRECT_URL` to the same Neon direct connection string so `prisma migrate deploy` can acquire advisory locks.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
