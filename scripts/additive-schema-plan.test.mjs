import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {additiveSchemaPlan}=require('../backend/scripts/additive-schema-plan.js');
test('preserves SQL tables and their foreign keys while adding application columns',()=>{
 const plan=additiveSchemaPlan('-- DropForeignKey\nALTER TABLE "OrderShipment" DROP CONSTRAINT "owner_fk";\n-- DropTable\nDROP TABLE "OrderShipment";\nALTER TABLE "Factory" ADD COLUMN "newValue" TEXT;');
 assert.deepEqual(plan.preservedTables,['OrderShipment']);
 assert.doesNotMatch(plan.sql,/DROP/);
 assert.match(plan.sql,/BEGIN;[\s\S]*ADD COLUMN[\s\S]*COMMIT;/);
});
test('blocks destructive changes to modeled tables before execution',()=>{
 for(const sql of ['ALTER TABLE "Factory" DROP COLUMN "name";', 'DROP INDEX "some_index";', 'ALTER TABLE "Factory" ALTER COLUMN "name" SET NOT NULL;']) assert.throws(()=>additiveSchemaPlan(sql),/explicit migration/);
});
test('factory unique index supports both initialized and prepared databases',()=>{
 assert.match(additiveSchemaPlan('CREATE UNIQUE INDEX "Factory_orgId_factoryCode_key" ON "Factory"("orgId", "factoryCode");').sql,/CREATE UNIQUE INDEX IF NOT EXISTS/);
});
test('applies and retries without losing shipment rows or company FK protection',async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE TABLE "Factory" (id INT PRIMARY KEY,"orgId" INT,"factoryCode" TEXT); CREATE TABLE "OrderShipment" (id INT PRIMARY KEY,"factoryId" INT REFERENCES "Factory"(id)); INSERT INTO "Factory" VALUES (1,1,\'A\'); INSERT INTO "OrderShipment" VALUES (1,1); CREATE UNIQUE INDEX "Factory_orgId_factoryCode_key" ON "Factory"("orgId","factoryCode") WHERE "factoryCode" IS NOT NULL;');
  const plan=additiveSchemaPlan('ALTER TABLE "OrderShipment" DROP CONSTRAINT "OrderShipment_factoryId_fkey"; DROP TABLE "OrderShipment"; CREATE UNIQUE INDEX "Factory_orgId_factoryCode_key" ON "Factory"("orgId", "factoryCode");');
  await db.exec(plan.sql);
  await db.exec(plan.sql);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "OrderShipment"')).rows[0].n,1);
  await assert.rejects(db.exec('DELETE FROM "Factory" WHERE id=1'),/foreign key/);
 } finally {await db.close();}
});
