import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerInventoryMovementRoutes}=require('../backend/dist/services/inventoryMovements');
const {registerInventoryVariantRoutes,writeInventoryVariant}=require('../backend/dist/services/inventoryVariants');
const {saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');
test('negative inventory uses approved balances per company and actual variant; approval/deletion recalculate without blocking negative issues',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.junior.id,reviewer=s.people.admin.id;
  const unit=await db.expenseUnit.create({data:{code:'BAL',nameEn:'Each',nameKo:'Each',nameVi:'Each'}}),baseId=s.code.baseId;
  const base=await db.transactionCodeBase.findUnique({where:{id:baseId}});
  await db.accountingCodeIndustry.create({data:{baseId,systemIndustryId:base.serviceTypeId}});
  await db.settingServiceDefault.update({where:{id:base.serviceTypeId},data:{materialManagement:true}});
  await db.transactionCodeBase.update({where:{id:baseId},data:{materialUnitId:unit.id,materialSettings:{enabled:true,stockFields:['unit'],unitInput:'REQUIRED',colorInput:'HIDDEN',masterInputs:{owner:'REQUIRED',type:'HIDDEN',color:'HIDDEN'}}}});
  for(const operation of ['CREATE','DELETE'])await db.systemSetting.create({data:{key:'APPROVAL_POLICY:INVENTORY:'+operation+':'+orgId,value:{revision:0,drafterRoles:['ACCOUNTANT'],approverIds:[]}}});
  await saveApprovalActionBatch(db,orgId,reviewer,['CREATE','DELETE'].map(operation=>({menu:'INVENTORY',operation,settings:{revision:0,drafterRoles:['ACCOUNTANT'],approverIds:[reviewer]}})));
  const routes=new Map(),seen=[],app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>routes.set(method+path,fn)]));
  const access=async(req,res,feature)=>{seen.push(feature);if(req.denied===feature)throw Error('ACCESS_DENIED');return {orgId:req.testOrg??orgId,actorId:req.testActor??actorId};};
  registerInventoryVariantRoutes(app,db,access);registerInventoryMovementRoutes(app,db,access);
  const call=async(method,path,input={})=>{// Seed a pre-existing definition; registration endpoint approval is covered separately.
   if(method==='post'&&path==='/material-items/variants')return db.$transaction(tx=>writeInventoryVariant(tx,{orgId:input.testOrg??orgId,actorId:input.testActor??actorId},input.body,'post',input.body.clientKey));
   let data;await routes.get(method+path)({query:{},params:{},...input},{status(){return this;},setHeader(){},json(value){data=value;}});return data;};
  const opts=await call('get','/material-items/variant-options',{query:{baseId}});
  const variant=await call('post','/material-items/variants',{body:{clientKey:randomUUID(),baseId,masterId:opts.master.id,ownerId:s.vendor.id}});
  const items=await call('get','/inventory-entry/items'),masterId=items.find(row=>row.id===variant.id).masterId;
  const create=(quantity,id=variant.id)=>call('post','/inventory-entry',{body:{clientKey:randomUUID(),masterId,variantId:id,variantRevision:1,userEmployeeId:actorId,date:'2026-11-20',quantity,remark:'Balance test',approvalRevision:1}});
  const decide=(id,decision='APPROVED')=>call('post','/inventory-entry/approvals/:id/decision',{testActor:reviewer,params:{id},body:{revision:1,decision}});
  const alerts=(input={})=>call('get','/inventory-entry/negative-stock',input);
  assert.equal((await alerts()).total,0);
  const rejected=await create('-999');assert.equal((await alerts()).total,0,'pending issue is excluded');await decide(rejected.id,'REJECTED');assert.equal((await alerts()).total,0,'rejected issue is excluded');
  const issue=await create('-5.0001');assert.equal((await alerts()).total,0);await decide(issue.id);
  let report=await alerts({query:{orgId:s.other.id}});assert.equal(report.total,1);assert.equal(report.rows[0].variantId,variant.id);assert.equal(report.rows[0].balance,'-5.0001');assert.equal(report.rows[0].issued,'5.0001');assert.equal(report.rows[0].received,'0');assert.equal(report.rows[0].amount,undefined);
  assert.deepEqual(seen.slice(-2),['INVENTORY_STOCK','DASHBOARD']);
  assert.equal((await alerts({testOrg:s.other.id})).total,0,'request company cannot expose another company stock');
  await assert.rejects(alerts({denied:'INVENTORY_STOCK'}),/ACCESS_DENIED/);await assert.rejects(alerts({denied:'DASHBOARD'}),/ACCESS_DENIED/);await assert.rejects(alerts({query:{page:-1}}),/INVALID_INVENTORY_MOVEMENT/);
  const secondOwner=await db.organization.create({data:{name:'Second owner',type:'LOGISTICS_PROVIDER',ownerOrgId:orgId}});
  const second=await call('post','/material-items/variants',{body:{clientKey:randomUUID(),baseId,masterId,ownerId:secondOwner.id}});
  const surplus=await create('100',second.id);await decide(surplus.id);assert.equal((await alerts()).rows[0].balance,'-5.0001','other owner surplus must not offset the shortage');
  const receipt=await create('5.0001');assert.equal((await alerts()).total,1,'unapproved receipt cannot resolve a shortage');await decide(receipt.id);assert.equal((await alerts()).total,0,'zero balance resolves the anomaly');
  const ownHistory=await call('get','/inventory-entry/history',{query:{variantId:variant.id}});assert.ok(ownHistory.every(row=>row.attributes.owner.id===s.vendor.id));assert.equal(ownHistory.length,3);
  const deletion=await call('post','/inventory-entry/:id/delete-request',{params:{id:receipt.id},body:{clientKey:randomUUID(),revision:2,approvalRevision:1}});assert.equal((await alerts()).total,0,'pending deletion does not alter stock');await decide(deletion.id);assert.equal((await alerts()).rows[0].balance,'-5.0001','approved receipt deletion restores the anomaly');
  const removeIssue=await call('post','/inventory-entry/:id/delete-request',{params:{id:issue.id},body:{clientKey:randomUUID(),revision:2,approvalRevision:1}});await decide(removeIssue.id);assert.equal((await alerts()).total,0);
  assert.equal((await db.$queryRaw`SELECT id FROM "InventoryVariant" WHERE id=${variant.id}`).length,1,'read checks and resolution preserve managed definitions');
 }finally{await f.close();}
});
