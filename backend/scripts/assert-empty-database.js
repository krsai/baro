async function assertEmptyDatabase(db) {
  const tables = await db.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;
  if (tables.length) throw new Error('database:initialize requires an empty public schema. Use database:prepare or database:upgrade:legacy for an existing installation.');
}

if (require.main === module) {
  require('dotenv').config({ override: false });
  const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
  assertSafeApplicationDatabaseEnv();
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
  assertEmptyDatabase(db).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
}
module.exports = { assertEmptyDatabase };
