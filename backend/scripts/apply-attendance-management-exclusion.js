// Explicit session DATABASE_URL/DIRECT_URL only; dry-run unless --apply is supplied.
const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

const fingerprint = `SELECT count(*)::int AS count,
  md5(COALESCE(string_agg((to_jsonb(a) - 'managementExcluded' - 'updatedAt')::text, '' ORDER BY a.id), '')) AS fingerprint
  FROM "AttendanceEntry" a`;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw Error('Explicit session database URL is required');
  assertSafeApplicationDatabaseEnv({ DATABASE_URL: url, DIRECT_URL: url });
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const before = await db.$queryRawUnsafe(`SELECT e.id, e."orgId", e."employeeNo", e.name,
      e.status, e."alwaysFullAttendance", e."payrollExcluded", count(a.id)::int AS "existingRecords"
      FROM "Employee" e LEFT JOIN "AttendanceEntry" a ON a."workerId" = e.id AND a."orgId" = e."orgId"
      WHERE e."alwaysFullAttendance" OR e."payrollExcluded"
      GROUP BY e.id ORDER BY e."orgId", e.id`);
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', exceptions: before }));
    if (!process.argv.includes('--apply')) return;
    const migration = readFileSync(path.join(__dirname, '../prisma/migrations/20260921090000_attendance_management_exclusion/migration.sql'), 'utf8');
    const sql = `BEGIN;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '30s';
      LOCK TABLE "Employee" IN SHARE ROW EXCLUSIVE MODE;
      LOCK TABLE "AttendanceEntry" IN SHARE ROW EXCLUSIVE MODE;
      CREATE TEMP TABLE attendance_management_before ON COMMIT DROP AS ${fingerprint};
      ${migration}
      DO $verify$
      BEGIN
        IF EXISTS (SELECT 1 FROM attendance_management_before b CROSS JOIN (${fingerprint}) a
          WHERE b.count <> a.count OR b.fingerprint <> a.fingerprint) THEN
          RAISE EXCEPTION 'Original attendance data changed unexpectedly';
        END IF;
        IF EXISTS (SELECT 1 FROM "AttendanceEntry" a JOIN "Employee" e ON e.id = a."workerId" AND e."orgId" = a."orgId"
          WHERE a."managementExcluded" IS DISTINCT FROM (e."alwaysFullAttendance" OR e."payrollExcluded")) THEN
          RAISE EXCEPTION 'Attendance management state is inconsistent';
        END IF;
      END;
      $verify$;
      COMMIT;`;
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--schema', path.join(__dirname, '../prisma/schema.prisma'), '--stdin'], {
      input: sql, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    });
    if (result.status !== 0) {
      // Never log connection strings from a subprocess error.
      const details = String(result.stderr || result.stdout || result.error || '').split(url).join('[database]').replace(/postgres(?:ql)?:\/\/\S+/g, '[database]');
      throw Error(`Attendance migration failed: ${details}`);
    }
    const after = await db.$queryRawUnsafe(`SELECT count(*)::int AS "totalRecords",
      count(*) FILTER (WHERE "managementExcluded")::int AS "unmanagedRecords" FROM "AttendanceEntry"`);
    const triggers = await db.$queryRawUnsafe(`SELECT tgname FROM pg_trigger
      WHERE NOT tgisinternal AND tgname IN ('attendance_management_state', 'employee_attendance_management_state') ORDER BY tgname`);
    console.log(JSON.stringify({ applied: true, originalPunchesPreserved: true, after, triggers }));
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[database]')); process.exitCode = 1; });
