import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: process.argv[2] || '.env', override: true });
const url = new URL(process.env.DATABASE_URL);
console.log(`Endpoint: ${url.hostname} | db in URL: ${url.pathname.slice(1)}`);

const prisma = new PrismaClient();
const q = (sql) => prisma.$queryRawUnsafe(sql).catch((e) => [{ err: String(e).slice(0, 160) }]);

console.log('databases on this branch:', JSON.stringify(await q("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1")));
for (const t of ['User', 'Food', 'MealEntry', 'DailyTarget']) {
  const r = await q(`SELECT COUNT(*)::int AS c FROM "${t}"`);
  console.log(`${t}: ${r[0]?.c ?? r[0]?.err}`);
}
const audit = await q('SELECT * FROM "_DeleteAudit" ORDER BY id DESC LIMIT 5');
console.log('audit rows:', JSON.stringify(audit));
await prisma.$disconnect();
