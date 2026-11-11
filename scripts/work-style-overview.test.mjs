import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildWorkStyleLookupOptions,workStyleProgressText} from '../frontend/src/utils/workStyleLookup.mjs';
import {changeApprovalFixture} from './helpers/change-approval-fixture.mjs';
const {workLogStyleOverview}=createRequire(import.meta.url)('../backend/dist/services/workLogStyleOverview');
test('real Prisma projections include company-scoped unassigned order items without creating any plans',async()=>{
 let company,buyer,style;
 const f=await changeApprovalFixture({beforeMigration:async({db},migration)=>{
  if(migration.version!=='20261108010000_style_product_ownership')return;
  company=await db.organization.create({data:{name:'Work lookup factory',type:'MANUFACTURER'}});buyer=await db.organization.create({data:{name:'Brand',type:'BRAND'}});
  const fields={name:'AM01622',code:'AM01622',registrationDate:null,designer:null,season:null,imageUrls:[]};
  const product=await db.styleProduct.create({data:{ownerOrgId:buyer.id,fields}});
  await db.styleProductRevision.create({data:{productId:product.id,revision:1,ownerOrgId:buyer.id,actorOrgId:buyer.id,fields}});
  style=await db.style.create({data:{orgId:company.id,customerOrgId:buyer.id,productOwnerOrgId:buyer.id,productStyleId:product.id,appliedProductRevision:1,name:'AM01622',code:'AM01622'}});
  await db.workOrder.create({data:{orgId:company.id,sellerOrgId:company.id,buyerOrgId:buyer.id,orderId:'unassigned-order',orderNumber:'L18-1',totalQuantity:170,workOrderItems:{create:{styleId:style.id,gender:'U',totalQuantity:170,sizeQuantities:{S:170}}}}});
 }});try{
  const db=f.db;
  const rows=await workLogStyleOverview(db,company.id,async()=>{throw Error('unassigned rows must not fabricate production');});
  assert.equal(rows.length,1);assert.equal(rows[0].styleId,style.id);assert.equal(rows[0].isAssigned,false);assert.equal(rows[0].orderedQuantity,170);assert.equal(rows[0].producedQuantity,0);
  assert.deepEqual(await workLogStyleOverview(db,buyer.id,async()=>[]),[]);
  assert.equal((await db.assignmentPlan.findMany({where:{orgId:company.id}})).length,0);
 }finally{await f.close();}
});
test('work lookup includes unassigned order styles and uses real order/style/assignment FKs for cumulative quantities',async()=>{
 const style={code:'SAME',name:'Same name'},orders=[
  {id:1,orderId:'order-1',orderNumber:'L16-1',workOrderItems:[{styleId:7,totalQuantity:40,style},{styleId:7,totalQuantity:60,style}],priorCompletions:[]},
  {id:2,orderId:'order-2',orderNumber:'L18-1',workOrderItems:[{styleId:7,totalQuantity:200,style}],priorCompletions:[]},
  {id:3,orderId:'order-3',orderNumber:'L19-1',workOrderItems:[{styleId:8,totalQuantity:80,style}],priorCompletions:[]},
  {id:4,orderId:'order-4',orderNumber:'PRIOR',workOrderItems:[{styleId:7,totalQuantity:30,style}],priorCompletions:[{styleId:7,quantity:30,canceledAt:null}]},
 ];
 const plans=[{externalId:'p1',workOrderId:1,styleId:7,factory:{name:'HANOI'}},{externalId:'p2',workOrderId:null,assignmentCard:{workOrderId:1},styleId:7,factory:{name:'SAIGON'}},{externalId:'p3',workOrderId:3,styleId:8,factory:{name:'HANOI'}}];
 const before=JSON.stringify({orders,plans});let loaded;
 const db={workOrder:{findMany:async args=>{assert.deepEqual(args.where,{orgId:9});return orders;}},assignmentPlan:{findMany:async args=>{assert.equal(args.where.orgId,9);assert.deepEqual(args.where.OR[0].workOrderId.in,[1,2,3,4]);return plans;}}};
 const rows=await workLogStyleOverview(db,9,async ids=>{loaded=ids;return [{id:'p1',plannedQuantity:40,producedQuantity:25},{id:'p2',plannedQuantity:60,producedQuantity:30},{id:'p3',plannedQuantity:80,producedQuantity:50,isProductionProgressUnknown:true}];});
 assert.deepEqual(loaded,['p1','p2','p3']);assert.equal(rows.length,4);
 assert.equal(rows[0].orderedQuantity,100);assert.equal(rows[0].producedQuantity,55);assert.deepEqual(rows[0].factoryNames,['HANOI','SAIGON']);
 assert.equal(rows[1].isAssigned,false);assert.equal(rows[1].orderedQuantity,200);assert.equal(rows[1].producedQuantity,0);
 assert.equal(rows[2].producedQuantity,null,'unknown production is never turned into zero or an unverified completed count');
 assert.equal(rows[3].producedQuantity,30,'approved historical completion survives without a current plan');
 assert.equal(JSON.stringify({orders,plans}),before,'lookup never edits source records or snapshots');
 const actual={id:'p1',dbId:11,label:'Same name',processes:[{styleProcessId:4}]};
 const options=buildWorkStyleLookupOptions([actual],rows);
 assert.equal(options.length,4);assert.equal(options[0].lookupOverview.workOrderId,1);assert.equal(options[0].lookupReadOnly,undefined);
 assert.equal(options[1].lookupReadOnly,true);assert.equal(options[1].isAssigned,false);assert.equal(options[1].lookupOverview.workOrderId,2);
 assert.equal(options[2].isAssigned,true);assert.equal(options[2].lookupReadOnly,true,'another factory or missing CT cannot become a selectable plan');
 assert.equal(workStyleProgressText(options[0],String,'unknown'),'55 / 100');assert.equal(workStyleProgressText(options[2],String,'unknown'),'unknown / 80');
 assert.equal(actual.lookupOverview,undefined);assert.deepEqual(actual.processes,[{styleProcessId:4}]);
});
