import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { styleAccessWhere, canManageStyle } = require('../backend/dist/utils/styleOwnership.js');
const { preservationBefore, preservationAfter } = require('../backend/scripts/transfer-manufacturer-ownership.js');
const sql = readFileSync('backend/scripts/transfer-manufacturer-ownership.sql', 'utf8');
const fixture = `
CREATE TABLE "Organization" (id SERIAL PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, "ownerOrgId" INTEGER);
CREATE TABLE "OrgRelationship" (id SERIAL PRIMARY KEY,"manufacturerOrgId" INTEGER NOT NULL,"brandOrgId" INTEGER NOT NULL);
CREATE TABLE "Style" (id SERIAL PRIMARY KEY,"orgId" INTEGER NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL DEFAULT 'Style',"updatedAt" TEXT NOT NULL DEFAULT 'original');
CREATE TABLE "WorkOrder" (id SERIAL PRIMARY KEY,"orgId" INTEGER NOT NULL,"sellerOrgId" INTEGER,"buyerOrgId" INTEGER,"totalQuantity" INTEGER,"snapshot" JSONB);
CREATE TABLE "StyleProcess" (id SERIAL PRIMARY KEY,"orgId" INTEGER,"styleId" INTEGER,"ctSeconds" INTEGER);
INSERT INTO "Organization" (id,type,name) VALUES (1,'MANUFACTURER','Factory'),(2,'BRAND','Customer');
INSERT INTO "OrgRelationship" ("manufacturerOrgId","brandOrgId") VALUES (1,2);
INSERT INTO "Style" ("orgId",code) VALUES (2,'SHIRT');
INSERT INTO "WorkOrder" ("orgId","sellerOrgId","buyerOrgId","totalQuantity",snapshot) VALUES (2,1,2,100,'{"paid":42}');
INSERT INTO "StyleProcess" ("orgId","styleId","ctSeconds") VALUES (1,1,120),(2,1,135);
`;
const migrate = db => db.exec(`BEGIN; ${preservationBefore} ${sql} ${preservationAfter} COMMIT;`);

test('manufacturer owns transferred data while customer/process scope and all business values survive retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    const processes = (await db.query('SELECT * FROM "StyleProcess" ORDER BY id')).rows;
    await migrate(db); await migrate(db);
    assert.deepEqual((await db.query('SELECT "orgId","customerOrgId",code,"updatedAt" FROM "Style"')).rows,
      [{ orgId: 1, customerOrgId: 2, code: 'SHIRT', updatedAt: 'original' }]);
    assert.deepEqual((await db.query('SELECT "orgId","buyerOrgId","totalQuantity",snapshot FROM "WorkOrder"')).rows,
      [{ orgId: 1, buyerOrgId: 2, totalQuantity: 100, snapshot: { paid: 42 } }]);
    assert.deepEqual((await db.query('SELECT * FROM "StyleProcess" ORDER BY id')).rows, processes);
    assert.deepEqual((await db.query('SELECT DISTINCT o."dataOwnerOrgId" FROM "StyleProcess" p JOIN "Organization" o ON o.id=p."orgId"')).rows,
      [{ dataOwnerOrgId: 1 }]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "DataOwnershipTransfer"')).rows[0].count, 3);
  } finally { await db.close(); }
});

test('ambiguous manufacturer mapping rolls back ownership fields and original data', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture + `INSERT INTO "Organization" (id,type,name) VALUES (3,'MANUFACTURER','Other');
      INSERT INTO "OrgRelationship" ("manufacturerOrgId","brandOrgId") VALUES (3,2);`);
    await assert.rejects(migrate(db), /OWNERSHIP_AMBIGUOUS/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT "orgId" FROM "WorkOrder"')).rows[0].orgId, 2);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='Style' AND column_name='customerOrgId'`)).rows[0].count, 0);
  } finally { await db.close(); }
});

test('database assigns manufacturer ownership for old writers and refuses a brand owner', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture); await migrate(db);
    await db.exec(`INSERT INTO "Style" ("orgId",code,name) VALUES (2,'NEW','New style');
      INSERT INTO "WorkOrder" ("orgId","sellerOrgId","buyerOrgId") VALUES (2,1,2);`);
    assert.equal((await db.query(`SELECT "orgId" FROM "Style" WHERE code='NEW'`)).rows[0].orgId, 1);
    assert.deepEqual((await db.query('SELECT DISTINCT "orgId" FROM "WorkOrder"')).rows, [{ orgId: 1 }]);
    await db.exec('UPDATE "Style" SET "orgId"=2 WHERE id=1');
    assert.equal((await db.query('SELECT "orgId" FROM "Style" WHERE id=1')).rows[0].orgId, 1);
    await assert.rejects(db.exec('UPDATE "Organization" SET "dataOwnerOrgId"=2 WHERE id=2'), /data owner must be a manufacturer/);
  } finally { await db.close(); }
});

test('ownership does not give another manufacturer or customer mutation rights', () => {
  const owner = { id: 1, type: 'MANUFACTURER' }, other = { id: 3, type: 'MANUFACTURER' }, customer = { id: 2, type: 'BRAND' };
  assert.equal(canManageStyle(owner, { orgId: 1 }), true);
  assert.equal(canManageStyle(other, { orgId: 1 }), false);
  assert.equal(canManageStyle(customer, { orgId: 1 }), false);
  assert.deepEqual(styleAccessWhere(owner), { orgId: 1 });
  assert.deepEqual(styleAccessWhere(other, 1), { orgId: 3, AND: [{ orgId: 1 }] });
  assert.deepEqual(styleAccessWhere(customer), { customerOrgId: 2 });
});

test('BARO transfer keeps process IDs and ST values, archives unused duplicates, and is repeatable against the full schema', async () => {
  const db = new PGlite();
  try {
    const schema = execFileSync(process.execPath, [require.resolve('../backend/node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve('backend/prisma/schema.prisma'), '--script'], { encoding: 'utf8' });
    await db.exec(schema);
    await db.exec(`
      INSERT INTO "Organization" (id,name,type,"updatedAt") VALUES (1,'BARO GARMENT','MANUFACTURER',now()),(2,'CUSTOMER','BRAND',now());
      INSERT INTO "OrgRelationship" ("manufacturerOrgId","brandOrgId","updatedAt") VALUES (1,2,now());
      INSERT INTO "Style" (id,"orgId","customerOrgId",code,name,"updatedAt") VALUES (1,2,2,'S','Shirt',now());
      INSERT INTO "StyleProcess" (id,"orgId","styleId","processCode","processName","ptSeconds","updatedAt")
        VALUES (1,1,1,'P','Sew',10,now()),(2,2,1,'P','Old sew',20,now());
      INSERT INTO "QuantityBucketSet" (id,"orgId",name,"updatedAt") VALUES (1,2,'DEFAULT_TIME_BUCKETS',now());
      INSERT INTO "QuantityBucketSetVersion" (id,"orgId","quantityBucketSetId","versionNumber") VALUES (1,2,1,1);
      INSERT INTO "QuantityBucketEntry" (id,"orgId","quantityBucketSetVersionId","bucketQuantity") VALUES (1,2,1,100);
      INSERT INTO "StyleProcessStandard" (id,"orgId","styleProcessId","quantityBucketEntryId","quantityBucketSetVersionId","bucketStSeconds","updatedAt") VALUES (1,2,2,1,1,123.5,now());
      INSERT INTO "QuantityBucketSet" (id,"orgId",name,"updatedAt") VALUES (2,1,'RELATIONSHIP_TIME_BUCKETS_1',now());
      INSERT INTO "QuantityBucketSetVersion" (id,"orgId","quantityBucketSetId","versionNumber") VALUES (2,1,2,1);
      INSERT INTO "QuantityBucketEntry" (id,"orgId","quantityBucketSetVersionId","bucketQuantity") VALUES (2,1,2,100);
      INSERT INTO "StyleProcessStandard" (id,"orgId","styleProcessId","quantityBucketEntryId","quantityBucketSetVersionId","bucketStSeconds","updatedAt") VALUES (2,1,1,2,2,100,now());
      UPDATE "OrgRelationship" SET "timeBucketSetVersionId"=2;
      INSERT INTO "AttrCategory" (id,"orgId",code,name) VALUES (1,1,'A','Main'),(2,2,'A','Old');
      INSERT INTO "AssignmentCard" (id,"orgId","cardId",payload,"updatedAt") VALUES (1,1,'C','{"quantity":10}',now()),(2,2,'C','{"quantity":10}',now());
    `);
    const businessSql = readFileSync('backend/scripts/transfer-baro-business-data.sql', 'utf8');
    const run = () => db.exec(`BEGIN; ${preservationBefore} ${sql} ${businessSql} ${preservationAfter} COMMIT;`);
    await run(); await run();
    // The deployed Currency table has the SQL default used by legacy seeds;
    // Prisma's @updatedAt alone is client-side and absent from migrate diff.
    await db.exec('ALTER TABLE "Currency" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP');
    await db.exec(`DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id' AND column_default LIKE 'nextval%' LOOP
        EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,''id''),COALESCE(MAX(id),0)+1,false) FROM %I',quote_ident(r.table_name),r.table_name);
      END LOOP;
    END $$;`);
    await db.exec(readFileSync('backend/migration_fix.sql', 'utf8'));
    await run();
    const scopedTables = (await db.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='orgId' AND table_name<>'OrganizationSubscription'`)).rows;
    for (const { table_name } of scopedTables) {
      assert.equal((await db.query(`SELECT count(*)::int AS count FROM "${table_name}" WHERE "orgId"<>1`)).rows[0].count, 0, table_name);
    }
    assert.deepEqual((await db.query('SELECT id,"orgId","sourceOrgId","isActive","ptSeconds" FROM "StyleProcess" ORDER BY id')).rows,
      [{ id: 1, orgId: 1, sourceOrgId: 0, isActive: true, ptSeconds: 10 }, { id: 2, orgId: 1, sourceOrgId: 2, isActive: false, ptSeconds: 20 }]);
    assert.deepEqual((await db.query('SELECT id,"orgId","styleProcessId","bucketStSeconds" FROM "StyleProcessStandard" WHERE id=1')).rows,
      [{ id: 1, orgId: 1, styleProcessId: 2, bucketStSeconds: 123.5 }]);
    assert.deepEqual((await db.query('SELECT id,"orgId" FROM "AssignmentCard"')).rows, [{ id: 1, orgId: 1 }]);
    const archive = (await db.query(`SELECT row FROM "ManufacturerDataArchive" WHERE "sourceTable"='StyleProcess'`)).rows[0].row;
    assert.equal(archive.id, 2); assert.equal(archive.orgId, 2); assert.equal(archive.ptSeconds, 20); assert.equal(archive.isActive, true);
  } finally { await db.close(); }
});
