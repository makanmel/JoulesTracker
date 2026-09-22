# JoulesTracker

Calorie and macronutrient tracker.

## Themes

Choose a visual preset from Settings. To add a preset, append a theme object with the documented schema to `public/themes.js` and add its translated `nameKey` to both locale files.

## Development workflow

All changes go through Pull Requests. CI runs tests and lint on every PR and on every push to `main`. See `CONTRIBUTING.md` for details.

## Deployment

The app is deployed on [Render](https://render.com) as a free web service defined in `render.yaml`, backed by a free [Neon](https://neon.tech) Postgres database. Every merge to `main` is deployed automatically once CI checks pass; on startup the service runs `prisma migrate deploy` and the idempotent seed, so schema migrations and default foods are applied with each release.

One-time setup:

1. Create a Neon project and copy its **direct** (non-pooled) connection string, e.g. `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require` (Prisma migrations do not run through the pooler).
2. In Render, choose **New → Blueprint**, connect this repository and apply `render.yaml`.
3. When prompted, set `DATABASE_URL` to the Neon connection string (`JWT_SECRET` is generated automatically).

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
