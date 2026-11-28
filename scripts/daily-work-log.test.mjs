import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import coverage from '../backend/dist/work-records/workLogCoverage.js';
import roster from '../backend/dist/work-records/dailyWorkLogRoster.js';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
import { prismaPGlite } from './helpers/prisma-pglite.mjs';
const { validateEmployeeWorkLogDailyCoverage: validate } = coverage;
const { validateDailyWorkLogRoster } = roster;

test('new records are daily; saved periods retain their exact original dates', () => {
  assert.equal(validate({ coverageStartDate: '2026-11-28', coverageEndDate: '2026-11-28' }), null);
  assert.ok(validate({ coverageStartDate: '2026-11-01', coverageEndDate: '2026-11-28' }));
  const existing = { displayDate: '2026-10-31', coverageStartDate: '2026-10-01', coverageEndDate: '2026-10-31' };
  assert.equal(validate({ ...existing, existing }), null);
  assert.ok(validate({ coverageStartDate: '2026-10-02', coverageEndDate: '2026-10-31', existing }));
  assert.ok(validate({ coverageStartDate: '2026-10-31', coverageEndDate: '2026-10-31', existing }));
});

test('every eligible worker must have actual work or an explicit no-work review', () => {
  const data = { workerIds: [1, 2], records: [{ workerId: 1 }], reviews: [{ workerId: 1, noWork: false }, { workerId: 2, noWork: true }] };
  assert.equal(validateDailyWorkLogRoster(data), null);
  assert.equal(validateDailyWorkLogRoster({ ...data, reviews: data.reviews.slice(0, 1) }), 'WORK_LOG_ROSTER_INCOMPLETE');
  assert.equal(validateDailyWorkLogRoster({ ...data, reviews: [...data.reviews, data.reviews[0]] }), 'WORK_LOG_ROSTER_INVALID');
  assert.equal(validateDailyWorkLogRoster({ ...data, reviews: [{ workerId: 1, noWork: true }, data.reviews[1]] }), 'WORK_LOG_ROSTER_WORK_CONFLICT');
  assert.ok(validateDailyWorkLogRoster({ ...data, workerIds: [1] }));
  assert.equal(validateDailyWorkLogRoster({ workerIds: [1], records: [], reviews: [{ workerId: 1, noWork: true }] }), null);
});

test('migration is repeatable, preserves old logs, isolates companies and rolls back with its transaction', async () => {
  const pg = new PGlite();
  const sql = readFileSync('backend/prisma/migrations/20261128020000_daily_work_log_roster/migration.sql', 'utf8');
  try {
    await pg.exec('CREATE TABLE "WorkLog"(id INT PRIMARY KEY,"orgId" INT); CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,UNIQUE(id,"orgId")); INSERT INTO "WorkLog" VALUES(10,1),(11,2); INSERT INTO "Employee" VALUES(20,1),(21,2);');
    await pg.exec(sql); await pg.exec(sql);
    assert.equal((await pg.query('SELECT count(*)::int n FROM "WorkLogWorkerReview"')).rows[0].n, 0);
    await pg.exec('INSERT INTO "WorkLogWorkerReview" VALUES(10,1,20,true)');
    await assert.rejects(pg.exec('INSERT INTO "WorkLogWorkerReview" VALUES(10,1,21,true)'), /foreign key/);
    await assert.rejects(pg.exec('INSERT INTO "WorkLogWorkerReview" VALUES(11,1,20,true)'), /foreign key/);
    await pg.exec('BEGIN; DELETE FROM "WorkLogWorkerReview"; ROLLBACK;');
    assert.equal((await pg.query('SELECT count(*)::int n FROM "WorkLogWorkerReview"')).rows[0].n, 1);
    assert.equal((await pg.query('SELECT count(*)::int n FROM "WorkLog"')).rows[0].n, 2);
    await pg.exec('DELETE FROM "WorkLog" WHERE id=10');
    assert.equal((await pg.query('SELECT count(*)::int n FROM "WorkLogWorkerReview"')).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('actual save transaction validates current factory roster, rejects duplicate days and preserves saved reviews on failure', async () => {
  const f = await prismaPGlite();
  const { saveDailyWorkerReviews } = loadSourceBindings('backend/src/index.ts', ['loadDailyRosterWorkerIds', 'saveDailyWorkerReviews'], {
    validateDailyWorkLogRoster,
    createHttpError: (status, message) => Object.assign(new Error(message), { status }),
    evaluateWorkerEmploymentInDateRange: ({ joinedAt, leftAt, startDateKey }) => ({ passed: (!joinedAt || joinedAt.toISOString().slice(0, 10) <= startDateKey) && (!leftAt || leftAt.toISOString().slice(0, 10) >= startDateKey) }),
  });
  try {
    await f.pg.exec(`CREATE TYPE "WorkLogRecordKind" AS ENUM ('EMPLOYEE','OUTSOURCING');
      CREATE TYPE "OrgUserRole" AS ENUM ('WORKER','ADMIN');
      CREATE TYPE "OrgMembershipStatus" AS ENUM ('ACTIVE','TERMINATED','SUSPENDED');
      CREATE TABLE "Factory"(id INT PRIMARY KEY,"orgId" INT);
      CREATE TABLE "WorkLog"(id INT PRIMARY KEY,"orgId" INT,"factoryId" INT,"workDate" TEXT,"recordKind" "WorkLogRecordKind");
      CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,"factoryId" INT,"orgRole" "OrgUserRole",status "OrgMembershipStatus","joinedAt" TIMESTAMP,"leftAt" TIMESTAMP,UNIQUE(id,"orgId"));
      INSERT INTO "Factory" VALUES(1,1),(2,2);
      INSERT INTO "WorkLog" VALUES(10,1,1,'2026-11-28','EMPLOYEE'),(20,2,2,'2026-11-28','EMPLOYEE');
      INSERT INTO "Employee" VALUES(1,1,1,'WORKER','ACTIVE',NULL,NULL),(2,1,1,'WORKER','ACTIVE',NULL,NULL),(3,1,1,'WORKER','TERMINATED',NULL,'2026-10-31'),(4,1,1,'WORKER','ACTIVE','2026-12-01',NULL),(5,2,2,'WORKER','ACTIVE',NULL,NULL);`);
    await f.pg.exec(readFileSync('backend/prisma/migrations/20261128020000_daily_work_log_roster/migration.sql','utf8'));
    const normalized = { factoryId: 1, displayDate: '2026-11-28', records: [{ workerId: 1 }] };
    const reviews = [{ workerId: 1, noWork: false }, { workerId: 2, noWork: true }];
    await f.db.$transaction(tx => saveDailyWorkerReviews(tx, 1, 10, normalized, reviews, true));
    await assert.rejects(f.db.$transaction(tx => saveDailyWorkerReviews(tx, 1, 10, normalized, reviews.slice(0, 1), false)));
    assert.equal(await f.db.workLogWorkerReview.count({where:{workLogId:10}}), 2);
    await f.pg.exec(`INSERT INTO "WorkLog" VALUES(11,1,1,'2026-11-28','EMPLOYEE')`);
    await assert.rejects(f.db.$transaction(tx => saveDailyWorkerReviews(tx, 1, 11, normalized, reviews, true)), /already exists/);
    assert.equal(await f.db.workLogWorkerReview.count({where:{workLogId:11}}), 0);
    await f.db.$transaction(tx => saveDailyWorkerReviews(tx, 1, 11, normalized, [], false));
  } finally { await f.close(); }
});
