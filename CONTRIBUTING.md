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

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

## Requirements

- Node.js 20 or higher
- npm

All changes must go through a Pull Request. Direct pushes to `main` should be disabled in the GitHub repository settings.
