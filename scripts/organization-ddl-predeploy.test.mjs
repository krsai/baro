import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('backend/migration_fix.sql','utf8');
const start=sql.indexOf('CREATE OR REPLACE FUNCTION pg_temp.baro_validate_organization_ddl()');
const helper=sql.slice(start,sql.indexOf('END $$;',start)+7);
test('Organization DDL validates queued constraints and preserves deferred guards and rollback',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "Organization" (id INT PRIMARY KEY,name TEXT);INSERT INTO "Organization" VALUES (1,'Before');
   CREATE TABLE "ValidationReceipt" (id SERIAL PRIMARY KEY);
   CREATE FUNCTION organization_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='INVALID' THEN RAISE EXCEPTION 'IDENTITY_MISMATCH'; END IF; INSERT INTO "ValidationReceipt" DEFAULT VALUES;RETURN NEW;END $$;
   CREATE CONSTRAINT TRIGGER "Organization_guard" AFTER UPDATE ON "Organization" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION organization_guard();`);
  await assert.rejects(db.exec(`BEGIN;UPDATE "Organization" SET name='Valid';CREATE INDEX test_idx ON "Organization"(name);COMMIT;`),/pending trigger events/);
  await db.exec('ROLLBACK');
  await db.exec(helper);
  await db.exec(`BEGIN;UPDATE "Organization" SET name='Valid';SELECT pg_temp.baro_validate_organization_ddl();CREATE INDEX test_idx ON "Organization"(name);COMMIT;`);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "ValidationReceipt"')).rows[0].n,1);
  assert.equal((await db.query('SELECT tginitdeferred FROM pg_trigger WHERE tgname=$1',['Organization_guard'])).rows[0].tginitdeferred,true);
  await assert.rejects(db.exec(`BEGIN;UPDATE "Organization" SET name='INVALID';SELECT pg_temp.baro_validate_organization_ddl();CREATE INDEX bad_idx ON "Organization"(id);COMMIT;`),/IDENTITY_MISMATCH/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT name FROM "Organization"')).rows[0].name,'Valid');
  assert.equal((await db.query("SELECT to_regclass('bad_idx') AS index")).rows[0].index,null);
 }finally{await db.close();}
});
