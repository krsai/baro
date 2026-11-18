const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const {
  assertSafeApplicationDatabaseEnv,
} = require("../src/config/databaseTargetGuard");

dotenv.config({ override: false });
const prismaCli = require.resolve("prisma/build/index.js");

const effectiveDbUrl =
  String(process.env.DIRECT_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim();

if (!effectiveDbUrl) {
  console.error(
    "[prisma-safe-deploy] DIRECT_URL / DATABASE_URL is empty. Aborting deployment."
  );
  process.exit(1);
}

const commandEnv = {
  ...process.env,
  DIRECT_URL: effectiveDbUrl,
  DATABASE_URL: String(process.env.DATABASE_URL || "").trim() || effectiveDbUrl,
};

try {
  assertSafeApplicationDatabaseEnv(commandEnv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const { additiveSchemaPlan } = require('./additive-schema-plan');
const diff = spawnSync(process.execPath, [prismaCli, 'migrate', 'diff',
  '--from-schema-datasource', 'prisma/schema.prisma',
  '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { env: commandEnv, encoding: 'utf8', stdio: 'pipe' });
if (diff.status !== 0) {
  if (diff.stderr) process.stderr.write(diff.stderr);
  process.exit(diff.status || 1);
}
try {
  const plan = additiveSchemaPlan(diff.stdout);
  console.log('[prisma-safe-deploy] Preserving SQL-managed tables: ' + plan.preservedTables.join(', '));
  if (plan.sql) {
    const applied = spawnSync(process.execPath, [prismaCli, 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
      { env: commandEnv, input: plan.sql, encoding: 'utf8', stdio: 'pipe' });
    if (applied.stdout) process.stdout.write(applied.stdout);
    if (applied.stderr) process.stderr.write(applied.stderr);
    process.exitCode = applied.status || (applied.error ? 1 : 0);
  }
} catch (error) {
  console.error('[prisma-safe-deploy] ' + error.message);
  process.exitCode = 1;
}
