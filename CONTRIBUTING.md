# Contributing to JoulesTracker

## Branch workflow

1. **Create a feature branch** from the latest `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-change-name
   ```
2. **Make your changes** and follow the existing code style.
3. **Run tests and lint** before committing:
   ```bash
   npm test
   npm run lint
   ```
4. **Push the branch** and open a Pull Request against `main`.
5. **Ensure CI passes** before merging.

## Local setup

You need a running PostgreSQL instance. Copy `.env.example` to `.env` and point `DATABASE_URL` at it, then:

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Tests use the `DATABASE_URL` from `.env.test` (create it, ideally pointing at a separate database such as `joules_test`). Tests wipe user data between cases, so never point them at your dev database.

## Requirements

- Node.js 20 or higher
- npm
- PostgreSQL 14 or higher (locally or via Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=joules postgres:16`)

All changes must go through a Pull Request. Direct pushes to `main` should be disabled in the GitHub repository settings.
