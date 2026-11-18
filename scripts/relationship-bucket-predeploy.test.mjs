import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const sql=readFileSync('backend/migration_fix.sql','utf8');
const start=sql.lastIndexOf('DO $$',sql.indexOf('  rel RECORD;'));
const backfill=sql.slice(start,sql.indexOf('END $$;',start)+7);
const guardStart=sql.lastIndexOf('DO $$',sql.indexOf('  missing_standard_count INTEGER;'));
const guard=sql.slice(guardStart,sql.indexOf('END $$;',guardStart)+7);
const schema=execFileSync(process.execPath,[require.resolve('../backend/node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel','backend/prisma/schema.prisma','--script'],{encoding:'utf8',maxBuffer:8*1024*1024});
async function fixture(run){const db=new PGlite();try{
 await db.exec(schema);
 await db.exec(`INSERT INTO "Organization" (id,name,type,"updatedAt") VALUES (1,'Factory','MANUFACTURER',now()),(2,'Customer','BRAND',now()),(3,'Service','SERVICE',now());
 INSERT INTO "OrgRelationship" (id,"manufacturerOrgId","brandOrgId","updatedAt") VALUES (4,1,2,now()),(5,3,2,now());`);
 await run(db);
}finally{await db.close();}}
const style=`INSERT INTO "StyleProduct" (id,"ownerOrgId",fields) VALUES (1,2,'{}');
 INSERT INTO "StyleProductRevision" ("productId",revision,"ownerOrgId","actorOrgId",fields) VALUES (1,1,2,1,'{}');
 INSERT INTO "Style" (id,"productStyleId","productOwnerOrgId","orgId","customerOrgId",code,name,"updatedAt") VALUES (1,1,2,1,2,'SHIRT','Shirt',now());`;
test('predeploy leaves new manufacturing/service relationships unconfigured and creates no invented buckets',()=>fixture(async db=>{
 await db.exec(style);
 await db.exec(backfill);await db.exec(backfill);
 assert.deepEqual((await db.query('SELECT id,"timeBucketSetVersionId" FROM "OrgRelationship" ORDER BY id')).rows,[{id:4,timeBucketSetVersionId:null},{id:5,timeBucketSetVersionId:null}]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "QuantityBucketSetVersion"')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "Style"')).rows[0].n,1);
}));
test('missing historical source for real manufacturer processes still fails atomically',()=>fixture(async db=>{
 await db.exec(style+`INSERT INTO "StyleProcess" (id,"orgId","styleId","processCode","processName","ptSeconds","updatedAt") VALUES (1,1,1,'SEW','Sewing',12,now());`);
 await assert.rejects(db.exec(backfill),/relationship 4 has no source quantity bucket version/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "QuantityBucketSetVersion"')).rows[0].n,0);
 assert.equal((await db.query('SELECT "ptSeconds" FROM "StyleProcess"')).rows[0].ptSeconds,12);
}));
test('another company process cannot force a relationship backfill or supply its source',()=>fixture(async db=>{
 await db.exec(style+`INSERT INTO "StyleProcess" (id,"orgId","styleId","processCode","processName","ptSeconds","updatedAt") VALUES (1,2,1,'SEW','Customer process',19,now());`);
 await db.exec(backfill);await db.exec(backfill);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "QuantityBucketSetVersion"')).rows[0].n,0);
 assert.deepEqual((await db.query('SELECT "orgId","ptSeconds" FROM "StyleProcess"')).rows,[{orgId:2,ptSeconds:19}]);
}));
test('historical source migration retains its quantities and remains idempotent',()=>fixture(async db=>{
 await db.exec(style+`INSERT INTO "QuantityBucketSet" (id,"orgId",name,"updatedAt") VALUES (1,2,'OLD',now());
 INSERT INTO "QuantityBucketSetVersion" (id,"orgId","quantityBucketSetId","versionNumber") VALUES (1,2,1,1);
 INSERT INTO "QuantityBucketEntry" ("orgId","quantityBucketSetVersionId","bucketQuantity") VALUES (2,1,100),(2,1,500);
 UPDATE "Style" SET "timeBucketSetVersionId"=1,"timeBucketSource"='CUSTOMER_DEFAULT';
 SELECT setval(pg_get_serial_sequence('"QuantityBucketSet"','id'),2,false),setval(pg_get_serial_sequence('"QuantityBucketSetVersion"','id'),2,false);`);
 await db.exec(backfill);
 const before=(await db.query('SELECT * FROM "QuantityBucketSetVersion" ORDER BY id')).rows;
 await db.exec(backfill);
 assert.deepEqual((await db.query('SELECT * FROM "QuantityBucketSetVersion" ORDER BY id')).rows,before);
 assert.deepEqual((await db.query('SELECT "bucketQuantity" FROM "QuantityBucketEntry" WHERE "quantityBucketSetVersionId"=(SELECT "timeBucketSetVersionId" FROM "OrgRelationship" WHERE id=4) ORDER BY "bucketQuantity"')).rows,[{bucketQuantity:100},{bucketQuantity:500}]);
}));
test('sparse ST is preserved without invented values; missing real copies still fail',()=>fixture(async db=>{
 await db.exec(style+`INSERT INTO "QuantityBucketSet" (id,"orgId",name,"updatedAt") VALUES (1,2,'SOURCE',now());
 INSERT INTO "QuantityBucketSetVersion" (id,"orgId","quantityBucketSetId","versionNumber") VALUES (1,2,1,1);
 INSERT INTO "QuantityBucketEntry" (id,"orgId","quantityBucketSetVersionId","bucketQuantity") VALUES (1,2,1,100),(2,2,1,500);
 UPDATE "Style" SET "timeBucketSetVersionId"=1,"timeBucketSource"='CUSTOMER_DEFAULT';
 INSERT INTO "StyleProcess" (id,"orgId","styleId","processCode","processName","ptSeconds","updatedAt") VALUES (1,1,1,'SEW','Sew',12,now());
 INSERT INTO "StyleProcessStandard" ("orgId","styleProcessId","quantityBucketEntryId","quantityBucketSetVersionId","bucketStSeconds","updatedAt") VALUES (1,1,1,1,37,now());
 SELECT setval(pg_get_serial_sequence('"QuantityBucketSet"','id'),2,false),setval(pg_get_serial_sequence('"QuantityBucketSetVersion"','id'),2,false),setval(pg_get_serial_sequence('"QuantityBucketEntry"','id'),3,false);`);
 await db.exec(backfill);await db.exec(guard);await db.exec(backfill);await db.exec(guard);
 const version=(await db.query('SELECT "timeBucketSetVersionId" AS id FROM "OrgRelationship" WHERE id=4')).rows[0].id;
 assert.deepEqual((await db.query('SELECT "bucketStSeconds" FROM "StyleProcessStandard" WHERE "quantityBucketSetVersionId"=$1',[version])).rows,[{bucketStSeconds:37}]);
 await db.query('DELETE FROM "StyleProcessStandard" WHERE "quantityBucketSetVersionId"=$1',[version]);
 await assert.rejects(db.exec(guard),/StyleProcessStandard rows missing/);
 assert.equal((await db.query('SELECT "bucketStSeconds" FROM "StyleProcessStandard" WHERE "quantityBucketSetVersionId"=1')).rows[0].bucketStSeconds,37);
}));
