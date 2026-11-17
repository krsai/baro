import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {prepareMaterialOwner}=require('../backend/dist/services/materialOwner');
const {registerCodeItemAttributeRoutes}=require('../backend/dist/services/codeItemAttributes');
const {loadExpenseEditorSource,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
test('material owner uses an independent FK, accepts self and actual partners, rejects unrelated companies and preserves legacy customers',async()=>{
 const f=await changeApprovalFixture();try{
  const {db}=f,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id;
  const input=extra=>({partnerOrgId:s.vendor.id,requestDate:'2026-11-18',clientKey:crypto.randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'MAIN',evidenceFile:'proof.pdf'},...extra}]});
  const register=body=>db.$transaction(tx=>registerExpenseRequest(tx,orgId,actorId,body),{timeout:30000});
  const customer=await db.organization.create({data:{name:'LEGACY CUSTOMER',type:'BRAND'}});
  await db.orgRelationship.create({data:{manufacturerOrgId:orgId,brandOrgId:customer.id}});
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{attributeInputs:{customer:'OPTIONAL'}}});
  const legacy=await register(input({itemCustomerId:customer.id})),old=await db.partnerTransactionCost.findUnique({where:{id:legacy.items[0].id}});
  assert.equal(old.itemCustomerId,customer.id);assert.equal(old.itemOwnerOrgId,null);
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{attributeInputs:{customer:'OPTIONAL',owner:'REQUIRED'}}});
  await assert.rejects(register(input({})),/REQUIRED_ITEM_OWNER/);
  await assert.rejects(register(input({itemOwnerOrgId:s.other.id})),/INVALID_ITEM_OWNER/);
  const ownInput=input({itemOwnerOrgId:orgId}),own=await register(ownInput);assert.equal((await register(ownInput)).id,own.id);
  const self=await db.partnerTransactionCost.findUnique({where:{id:own.items[0].id}});assert.equal(self.itemOwnerOrgId,orgId);assert.equal(self.itemCustomerId,null);assert.equal(self.itemOwnerSnapshot.id,orgId);
  const partner=await register(input({itemOwnerOrgId:s.vendor.id}));assert.equal(partner.items[0].itemOwnerOrgId,s.vendor.id);
  const form=expenseEditorForm(await loadExpenseEditorSource(db,orgId,'request',String(own.id)));assert.equal(form.items[0].itemOwnerOrgId,orgId);assert.equal(form.items[0].itemOwnerSnapshot.id,orgId);
  const routes=new Map();registerCodeItemAttributeRoutes({get:(p,h)=>routes.set(p,h),post:()=>{}},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>actorId,canAccessCodeItems:async()=>true});
  let options;await routes.get('/code-item-options')({query:{baseId:s.code.baseId}},{json:data=>{options=data;}});assert.ok(options.owners.some(row=>row.id===orgId));assert.ok(options.owners.some(row=>row.id===s.vendor.id));assert.ok(!options.owners.some(row=>row.id===s.other.id));
  assert.deepEqual(await prepareMaterialOwner(db,orgId,{}, {id:s.code.id,base:{attributeInputs:{owner:'REQUIRED'}}},old),{itemOwnerOrgId:null,itemOwnerSnapshot:undefined});
  await assert.rejects(db.partnerTransactionCost.update({where:{id:self.id},data:{itemOwnerSnapshot:{id:s.other.id}}}),/immutable/);
  await assert.rejects(db.partnerTransactionCost.update({where:{id:self.id},data:{itemOwnerOrgId:s.other.id}}),/invalid material owner scope/);
  assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:old.id}}),old);
  const migration=readFileSync('backend/prisma/migrations/20261118010000_material_owner/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  assert.equal((await db.partnerTransactionCost.findUnique({where:{id:self.id}})).itemOwnerSnapshot.id,orgId);
 }finally{await f.close();}
});
