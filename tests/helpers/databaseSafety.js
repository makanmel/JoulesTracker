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
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing destructive test cleanup on database "${databaseName}"; its name must end with "_test"`);
  }
}
