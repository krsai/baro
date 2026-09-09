import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../backend/scripts/remove-line-domain.sql', import.meta.url), 'utf8');
const fixture = [
  'CREATE TABLE "Factory" (id int PRIMARY KEY, "orgId" int NOT NULL, UNIQUE(id,"orgId"));',
  'CREATE TABLE "Line" (id int PRIMARY KEY, "orgId" int NOT NULL, "factoryId" int REFERENCES "Factory");',
  'CREATE TABLE "Employee" (id int PRIMARY KEY, "orgId" int NOT NULL, "factoryId" int REFERENCES "Factory", "lineId" int REFERENCES "Line");',
  'CREATE TABLE "LineAssignment" (id int PRIMARY KEY, "employeeId" int REFERENCES "Employee", "lineId" int REFERENCES "Line");',
  'CREATE TABLE "AssignmentPlan" (id int PRIMARY KEY, "orgId" int NOT NULL, "externalId" text, "lineId" int NOT NULL REFERENCES "Line", "factoryId" int, "assignmentCtSnapshot" jsonb, "assignmentStSnapshot" jsonb);',
  'CREATE TABLE "WorkLog" (id int PRIMARY KEY, "orgId" int NOT NULL, "factoryId" int, records jsonb);',
  'CREATE TABLE "WorkRecord" (id int PRIMARY KEY, "orgId" int NOT NULL, "workLogId" int REFERENCES "WorkLog", "assignmentPlanId" int REFERENCES "AssignmentPlan", "lineId" int REFERENCES "Line", quantity int, "ctSeconds" numeric);',
  'CREATE TABLE "OutsourcedWorkRecord" (id int PRIMARY KEY, "orgId" int NOT NULL, "workLogId" int REFERENCES "WorkLog", "assignmentPlanId" int REFERENCES "AssignmentPlan", "lineId" int REFERENCES "Line", quantity int);',
  'CREATE TABLE "PayrollSnapshot" (id int PRIMARY KEY, data jsonb);',
  'CREATE TABLE "AssignmentBoardState" (id int PRIMARY KEY, "orgId" int, assignments jsonb NOT NULL);',
  'INSERT INTO "Factory" VALUES (71,1),(82,2);',
  'INSERT INTO "Line" VALUES (900,1,71),(901,1,71),(902,2,82);',
  'INSERT INTO "Employee" VALUES (1,1,71,900);',
  'INSERT INTO "LineAssignment" VALUES (1,1,900),(2,1,901);',
  'INSERT INTO "AssignmentPlan" VALUES (11,1,\'A-old-line-900\',900,NULL,\'{"ct":123.45}\',\'{"st":678.9}\'),(12,1,\'A-other\',901,71,\'{"ct":55}\',\'{"st":99}\');',
  'INSERT INTO "WorkLog" VALUES (21,1,NULL,\'{"lineId":900,"lineName":"old","note":"preserve"}\'),(22,1,71,NULL);',
  'INSERT INTO "WorkRecord" VALUES (31,1,21,11,900,100,123.45),(32,1,21,12,901,40,55);',
  'INSERT INTO "OutsourcedWorkRecord" VALUES (41,1,22,12,901,15);',
  'INSERT INTO "PayrollSnapshot" VALUES (1,\'[{"workerId":1,"totalSalary":1234567,"processes":[{"lineId":900,"totalEarnings":500}]}]\');',
  'INSERT INTO "AssignmentBoardState" VALUES (1,1,\'[{"id":"A-old-line-900","lineId":"900","quantity":100}]\');',
].join('\n');
async function database() { const db = new PGlite(); await db.exec(fixture); return db; }

test('migration preserves an empty assignment board', async () => {
  const db = await database();
  try {
    await db.exec(`UPDATE "AssignmentBoardState" SET assignments = '[]'::jsonb`);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT assignments FROM "AssignmentBoardState"')).rows[0].assignments, []);
  } finally { await db.close(); }
});

test('full Prisma schema and repeated bootstrap do not recreate the Line domain', async () => {
  const db = new PGlite();
  try {
    const sql = execFileSync(process.execPath, [
      'backend/node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty',
      '--to-schema-datamodel', 'backend/prisma/schema.prisma', '--script',
    ], { encoding:'utf8', maxBuffer:10*1024*1024 });
    await db.exec(sql);
    // Operational bootstrap predates Prisma @updatedAt and relies on SQL timestamp
    // defaults for its seed inserts. Reproduce those defaults in this empty fixture.
    await db.exec(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='updatedAt'
      LOOP EXECUTE format('ALTER TABLE %I ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP',r.table_name); END LOOP;
    END $$;`);
    const bootstrap=fs.readFileSync(new URL('../backend/migration_fix.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(bootstrap);
    await db.exec(migration);
    await db.exec(bootstrap);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND column_name='lineId'")).rows[0].n,0);
  } finally { await db.close(); }
});

test('migration preserves production, CT/ST and frozen salary and removes relational line references', async () => {
  const db = await database();
  try {
    const before = (await db.query('SELECT data FROM "PayrollSnapshot"')).rows;
    const snapshots = (await db.query('SELECT id,"assignmentCtSnapshot","assignmentStSnapshot" FROM "AssignmentPlan" ORDER BY id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT data FROM "PayrollSnapshot"')).rows, before);
    assert.deepEqual((await db.query('SELECT id,"assignmentCtSnapshot","assignmentStSnapshot" FROM "AssignmentPlan" ORDER BY id')).rows, snapshots);
    assert.deepEqual((await db.query('SELECT id,"factoryId" FROM "AssignmentPlan" ORDER BY id')).rows, [{ id:11,factoryId:71 },{ id:12,factoryId:71 }]);
    assert.deepEqual((await db.query('SELECT id,"factoryId",records FROM "WorkLog" ORDER BY id')).rows, [{id:21,factoryId:71,records:{note:'preserve'}},{id:22,factoryId:71,records:null}]);
    assert.equal(Number((await db.query('SELECT sum(quantity * "ctSeconds") AS amount FROM "WorkRecord"')).rows[0].amount), 14545);
    assert.equal(Number((await db.query('SELECT sum(quantity) AS qty FROM "OutsourcedWorkRecord"')).rows[0].qty), 15);
    assert.deepEqual((await db.query('SELECT assignments FROM "AssignmentBoardState"')).rows[0].assignments,[{id:'A-old-line-900',quantity:100,factoryId:71}]);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND column_name='lineId'")).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('Line','LineAssignment')")).rows[0].n,0);
    await db.exec(migration);
    await assert.rejects(db.exec('INSERT INTO "AssignmentPlan" (id,"orgId","factoryId") VALUES (99,1,82)'));
    await assert.rejects(db.exec('INSERT INTO "AssignmentPlan" (id,"orgId","factoryId") VALUES (99,1,NULL)'));
  } finally { await db.close(); }
});

for (const [name, mutation, message] of [
  ['plan conflicts with factory', 'UPDATE "AssignmentPlan" SET "factoryId"=82 WHERE id=11', /AssignmentPlan factory conflicts/],
  ['log conflicts with historical records', 'UPDATE "WorkLog" SET "factoryId"=82 WHERE id=21', /WorkLog factory evidence/],
  ['cross-factory employee history', 'UPDATE "LineAssignment" SET "lineId"=902 WHERE id=2', /Historical staff assignments/],
  ['unresolvable work ownership', 'UPDATE "WorkRecord" SET "lineId"=NULL,"assignmentPlanId"=NULL; UPDATE "WorkLog" SET records=NULL WHERE id=21', /no provable factory/],
  ['unexpected dependent table', 'CREATE TABLE "Unexpected" (id int, "lineId" int REFERENCES "Line");', /depend/],
]) {
  test('migration rolls back completely for ' + name, async () => {
    const db = await database();
    try {
      await db.exec(mutation);
      await assert.rejects(db.exec(migration), message);
      await db.exec('ROLLBACK');
      assert.equal((await db.query('SELECT "factoryId" FROM "AssignmentPlan" WHERE id=12')).rows[0].factoryId,71);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='Line'")).rows[0].n,1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM "WorkRecord"')).rows[0].n,2);
    } finally { await db.close(); }
  });
}
