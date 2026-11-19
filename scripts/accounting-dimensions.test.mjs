import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {validExpenseLine} from '../frontend/src/utils/expenseRequest.mjs';
const require=createRequire(import.meta.url);
const {accountingInputs}=require('../backend/dist/services/accountingInputs');
const {validateCostDimensions}=require('../backend/dist/services/partnerTransactionCost');

test('dimensions require positive L/W/H and preserve fractional millimetres and unchanged historical dimensions',()=>{
 assert.deepEqual(accountingInputs({requiredFields:['length','width']}).requiredFields,['reference','length','width']);
 assert.throws(()=>accountingInputs({requiredFields:['length']}));
 assert.throws(()=>accountingInputs({requiredFields:['length','width','height']}));
 const code={vatEnabled:false,base:{entryMode:'GENERAL',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:['length','width']}};
 const line={quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'DOC',evidenceFile:'proof.pdf',length:'210.5',width:'297',height:'10.25'}};
 assert.equal(validExpenseLine(line,code,'USD'),true);
 for(const details of [{...line.details,height:''},{...line.details,height:'0'},{...line.details,length:'-1'},{...line.details,width:''},{...line.details,height:'NaN'},{...line.details,width:'1e3'}]){
  assert.equal(validExpenseLine({...line,details},code,'USD'),false);
  assert.throws(()=>validateCostDimensions(details));
 }
 const legacy={...line.details};delete legacy.height;assert.doesNotThrow(()=>validateCostDimensions(legacy,legacy));assert.equal(validExpenseLine({...line,itemId:'old',details:legacy,originalDetails:legacy},code,'USD'),true);
 assert.doesNotThrow(()=>validateCostDimensions(line.details));
 assert.doesNotThrow(()=>validateCostDimensions({...line.details,height:'10.25'}));
});

test('SQL preserves unchanged old L/W snapshots while requiring height for new or changed dimensions',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "PartnerTransactionCost"(id INT PRIMARY KEY,details JSONB);');
  const extract=file=>readFileSync(file,'utf8').match(/CREATE OR REPLACE FUNCTION baro_cost_dimensions_guard\(\)[\s\S]*?END \$\$;/)[0];
  await db.exec(extract('backend/prisma/migrations/20261113020000_accounting_dimensions/migration.sql'));
  await db.exec(`CREATE TRIGGER dimensions BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_cost_dimensions_guard();INSERT INTO "PartnerTransactionCost" VALUES(1,'{"length":"10","width":"20"}');`);
  await db.exec(extract('backend/prisma/migrations/20261119120000_material_item_master/migration.sql'));
  await db.exec(`UPDATE "PartnerTransactionCost" SET details=details||'{"evidenceFile":"receipt.pdf"}'::jsonb WHERE id=1;`);
  await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET details=details||'{"width":"30"}'::jsonb WHERE id=1;`),/height required/);
  await assert.rejects(db.exec(`INSERT INTO "PartnerTransactionCost" VALUES(2,'{"length":"10","width":"20"}');`),/height required/);
  await db.exec(`UPDATE "PartnerTransactionCost" SET details=details||'{"height":"5"}'::jsonb WHERE id=1;`);
  assert.equal((await db.query('SELECT details FROM "PartnerTransactionCost" WHERE id=1')).rows[0].details.height,'5');
 }finally{await db.close();}
});

test('company policy, server validation, SQL guard and editor round trip retain LWH',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const {saveExpenseCodeLinkPolicy}=require('../backend/dist/services/expenseCodeLinkPolicy');
  const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
  const {loadExpenseEditorSource,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
  await db.$transaction(tx=>saveExpenseCodeLinkPolicy(tx,org,actor,s.code.baseId,'NONE',{requiredFields:['length','width']}));
  const input=()=>({partnerOrgId:s.vendor.id,requestDate:'2026-04-02',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'DIM',evidenceFile:'proof.pdf',length:'200',width:'300.5',height:'9'}}]});
  const missing=input();delete missing.items[0].details.width;
  await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org,actor,missing)),/REQUIRED_TRANSACTION_FIELD:width/);
  const invalid=input();invalid.items[0].details.height='-1';
  await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org,actor,invalid)),/INVALID_TRANSACTION_DETAILS/);
  const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,input()));
  const form=expenseEditorForm(await loadExpenseEditorSource(db,org,'request',String(doc.id)));
  assert.equal(form.items[0].details.length,'200');assert.equal(form.items[0].details.width,'300.5');assert.equal(form.items[0].details.height,'9');
  const three=input();three.items[0].details.height='12';const doc3=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,three));assert.equal(doc3.items[0].details.height,'12');
  const checked=await db.$queryRawUnsafe('SELECT baro_accounting_inputs_valid($1::jsonb) AS valid',JSON.stringify({orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:['length']}));assert.equal(checked[0].valid,false);
  const existing=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:doc.id}});
  await assert.rejects(db.partnerTransactionCost.create({data:{...existing,id:undefined,clientKey:randomUUID(),expenseRequestId:null,details:{...existing.details,height:'0'}}}),/positive length width height|invalid dimension/);
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261113020000_accounting_dimensions/migration.sql','utf8'));
 }finally{await f.close()}
});
