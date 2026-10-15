export function assertSafeTestDatabase(databaseUrl, nodeEnv) {
  if (nodeEnv !== 'test') {
    throw new Error('Refusing destructive test cleanup outside NODE_ENV=test');
  }

  if (!databaseUrl) {
    throw new Error('Refusing destructive test cleanup without DATABASE_URL');
  }

  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Tests require a dedicated PostgreSQL database');
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  assertTestDatabaseName(databaseName);
}

export function assertTestDatabaseName(databaseName) {
  const normalized = databaseName.toLowerCase();
  if (!normalized.endsWith('_test')) {
    throw new Error(`Refusing destructive test cleanup on database "${databaseName}"; its name must end with "_test"`);
  }
}

// Neon endpoints can silently fall back to a branch's default database when the
// requested database name does not exist there (e.g. after the endpoint is
// reattached to another branch during a restore). The URL check above cannot
// catch that — verify the database we actually connected to.
export async function assertConnectedDatabaseIsTest(prisma) {
  const [{ db }] = await prisma.$queryRawUnsafe('SELECT current_database() AS "db"');
  assertTestDatabaseName(db);
}
