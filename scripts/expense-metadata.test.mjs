import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import metadata from '../backend/dist/services/expenseMetadata.js';
const {prepareExpenseMetadata,registerExpenseUnitRoutes}=metadata;
test('multiple order/style references validate every tenant and membership, preserve inactive retained units',async()=>{
 const tx={workOrder:{findMany:async({where})=>where.orgId===1?where.id.in.filter(id=>id!==99).map(id=>({id})):[]},workOrderItem:{findFirst:async({where})=>where.styleId===999?null:{id:1}},expenseUnit:{findUnique:async({where})=>where.id===1?{id:1,isActive:true}:where.id===2?{id:2,isActive:false}:null}};
 const body={unitId:1,linkedOrderIds:[10,20],linkedStyles:[{workOrderId:10,styleId:30},{workOrderId:20,styleId:40}]};
 const value=await prepareExpenseMetadata(tx,1,body);assert.deepEqual(value.orderIds,[10,20]);assert.equal(value.styles.length,2);
 const sanitized=await prepareExpenseMetadata(tx,1,{...body,linkedStyles:[{workOrderId:10,styleId:30,costId:'another-cost',orgId:2}]});assert.deepEqual(sanitized.styles,[{workOrderId:10,styleId:30}]);
 for(const patch of [{linkedOrderIds:[10,99]},{linkedOrderIds:[10,10]},{linkedStyles:[{workOrderId:99,styleId:30}]},{linkedStyles:[{workOrderId:10,styleId:999}]},{unitId:2},{unitId:999}])await assert.rejects(prepareExpenseMetadata(tx,1,{...body,...patch}),/INVALID_/);
 const retained=await prepareExpenseMetadata(tx,1,{...body,unitId:2,linkedStyles:[{workOrderId:10,styleId:999}]},{unitId:2,workOrderId:10,styleId:999});assert.equal(retained.unitId,2);
});
test('only SYSTEM administrators can change the unit catalogue; company members can read it',async()=>{
 const handlers=new Map(),app={};for(const method of ['get','put','post'])app[method]=(path,fn)=>handlers.set(method+path,fn);
 const rows=[{id:1,code:'PCS',nameEn:'Piece'}];let writes=0;
 registerExpenseUnitRoutes(app,{expenseUnit:{findMany:async()=>rows,update:async({where,data})=>{writes++;Object.assign(rows.find(row=>row.id===where.id),data);return rows[0];}}},{requireSystemAdmin:async(req)=>req.system?{}:null,requireOrgRole:async(req)=>req.member?{}:null});
 const response=()=>({json(value){this.body=value;}});
 let res=response();await handlers.get('get/expense-units')({member:true},res);assert.equal(res.body,rows);
 res=response();await handlers.get('put/system-setting-defaults/expense-units/:id')({params:{id:'1'},body:{code:'ITEM',nameEn:'Item'},member:true},res);assert.equal(writes,0);
 await handlers.get('put/system-setting-defaults/expense-units/:id')({params:{id:'1'},body:{code:'ITEM',nameEn:'Item'},system:true},res);assert.equal(writes,1);assert.equal(rows[0].id,1);assert.equal(rows[0].code,'ITEM');
});
test('reference SQL preserves old costs, enforces real company FKs, audit and payment/final locks',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "WorkOrder"(id INT,"orgId" INT,"invoiceFinalLockedAt" TIMESTAMP,UNIQUE(id,"orgId"));
 CREATE TABLE "Style"(id INT,"orgId" INT,UNIQUE(id,"orgId"));
 CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"expenseRequestId" INT,"workOrderId" INT,amount NUMERIC);
 CREATE TABLE "ExpenseRequestAudit"("orgId" INT,"clientKey" TEXT,"actorId" INT,"beforeSnapshot" JSONB,"afterSnapshot" JSONB);
 CREATE TABLE "BankLedgerEntry"(id TEXT PRIMARY KEY,"voidedAt" TIMESTAMP);
 CREATE TABLE "BankLedgerEvidenceAllocation"("entryId" TEXT,"expenseItemId" TEXT);
 INSERT INTO "WorkOrder" VALUES(10,1,NULL),(20,1,NULL),(99,2,NULL);
 INSERT INTO "Style" VALUES(30,1),(40,1),(99,2);
 INSERT INTO "PartnerTransactionCost" VALUES('cost',1,1,10,1234),('old',1,NULL,NULL,100);`);
 const sql=fs.readFileSync('backend/prisma/migrations/20261030090000_expense_units_references/migration.sql','utf8');
 await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('SELECT * FROM "ExpenseUnit"')).rows.length,7);
 assert.equal((await db.query(`SELECT "unitId" FROM "PartnerTransactionCost" WHERE id='old'`)).rows[0].unitId,null);
 const write=async(text,{audit=true,auditCostId='cost'}={})=>db.transaction(async tx=>{
  await tx.exec(`SELECT set_config('baro.expense_editor_org','1',true),set_config('baro.expense_editor_key','EXPENSE_REQUEST_EDIT:1:test',true),set_config('baro.expense_editor_actor','20',true)`);
  await tx.exec(text);
  if(audit)await tx.query(`INSERT INTO "ExpenseRequestAudit" VALUES(1,'EXPENSE_REQUEST_EDIT:1:test',20,NULL,$1::jsonb)`,[JSON.stringify({costs:[{id:auditCostId}]})]);
 });
 await assert.rejects(db.exec(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId") VALUES('cost',1,10)`),/context/);
 await assert.rejects(write(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId") VALUES('cost',1,10)`,{audit:false}),/audit required/);
 await assert.rejects(write(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId") VALUES('cost',1,10)`,{auditCostId:'another-cost'}),/audit required/);
 await assert.rejects(write(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId","styleId") VALUES('cost',1,99,30)`),/foreign key/);
 await assert.rejects(write(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId","styleId") VALUES('cost',1,10,99)`),/foreign key/);
 await write(`INSERT INTO "ExpenseItemReference"("costId","orgId","workOrderId","styleId") VALUES('cost',1,10,NULL),('cost',1,10,30),('cost',1,20,NULL),('cost',1,20,40)`);
 assert.equal((await db.query('SELECT count(*)::int n FROM "ExpenseItemReference"')).rows[0].n,4);
 await db.exec(`UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=now() WHERE id=20`);
 await assert.rejects(write(`DELETE FROM "ExpenseItemReference" WHERE "workOrderId"=20`),/finally locked/);
 await db.exec(`UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=NULL;INSERT INTO "BankLedgerEntry" VALUES('bank',NULL);INSERT INTO "BankLedgerEvidenceAllocation" VALUES('bank','cost')`);
 await assert.rejects(write(`DELETE FROM "ExpenseItemReference" WHERE "costId"='cost'`),/EXPENSE_ALREADY_RECONCILED/);
 await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET "unitId"=999 WHERE id='cost'`),/foreign key/);
 assert.deepEqual((await db.query('SELECT id,amount::text FROM "PartnerTransactionCost" ORDER BY id')).rows,[{id:'cost',amount:'1234'},{id:'old',amount:'100'}]);
 }finally{await db.close();}
});
