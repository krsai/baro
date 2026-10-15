import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const write=require('../backend/dist/utils/assignmentCardWrite.js');
const source=readFileSync('backend/dist/index.js','utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));

test('persisted card comparison ignores JSON property order and catches FK, quantity and ordering changes',()=>{
  const row={sortOrder:0,styleId:1,workOrderId:7,buyerOrgId:2,payload:{quantity:100,ct:{seconds:20}}};
  assert.equal(write.assignmentCardNeedsWrite(row,{...row,payload:{ct:{seconds:20},quantity:100}}),false);
  assert.equal(write.assignmentCardNeedsWrite(row,{...row,payload:{quantity:105,ct:{seconds:20}}}),true);
  assert.equal(write.assignmentCardNeedsWrite(row,{...row,styleId:3}),true);
  assert.equal(write.assignmentCardNeedsWrite(row,{...row,sortOrder:1}),true);
  assert.equal(write.assignmentCardNeedsWrite(null,row),true);
});

test('actual card persistence skips 100 unchanged rows and writes only the edited card',async()=>{
  const entries=Array.from({length:100},(_,i)=>({payload:{id:`C${i}`,quantity:100},styleId:1,workOrderId:i+1,buyerOrgId:2}));
  const stored=entries.map((e,i)=>({cardId:e.payload.id,sortOrder:i,...e}));let writes=[];
  const db={assignmentCard:{deleteMany:async()=>{},findMany:async()=>stored,upsert:async arg=>writes.push(arg)}};
  const ctx=vm.createContext({assignmentCardWrite_1:write,normalizeAssignmentCardsForStore:x=>x,loadAssignmentCardsForOrg:async()=>stored});
  vm.runInContext(section('const syncAssignmentCardsForOrg =','const hydrateAssignmentFkRefsFromCards =')+'\nthis.run=syncAssignmentCardsForOrg;',ctx);
  await ctx.run({orgId:1,cards:entries,db,preserveAssignedCards:true});assert.equal(writes.length,0);
  entries[3]={...entries[3],payload:{...entries[3].payload,quantity:105}};
  await ctx.run({orgId:1,cards:entries,db,preserveAssignedCards:true});assert.equal(writes.length,1);assert.equal(writes[0].where.orgId_cardId.cardId,'C3');
});

test('actual order rebuild limits order and style reads while keeping all assignment references for preservation',async()=>{
  let styleWhere,orderWhere,planWhere;
  const db={organization:{findUnique:async()=>({id:1,type:'MANUFACTURER'})},style:{findMany:async arg=>{styleWhere=arg.where;return[];}},workOrder:{findMany:async arg=>{orderWhere=arg.where;return[{id:7}];}},assignmentPlan:{findMany:async arg=>{planWhere=arg.where;return[];}}};
  const ctx=vm.createContext({console,isManufacturerOrg:()=>true,styleOwnership_1:{styleAccessWhere:()=>({orgId:1})},getOrderAccessWhere:()=>[{orgId:1}],WORK_ORDER_ITEM_WITH_COLOR_INCLUDE:{},loadAssignmentCardsForOrg:async()=>[],applyRelationshipTimeBucketContexts:({styles})=>styles,loadRelationshipTimeBucketContextByStyleId:async()=>new Map(),ensureStyleProcessStorageForStyles:async()=>new Map(),ensureStyleStandardsForQuantities:async()=>new Map(),collectStyleQuantityRequirementsFromOrders:()=>new Map(),buildAssignmentCardsFromOrders:()=>[],reconcileAssignmentCards_1:require('../backend/dist/utils/reconcileAssignmentCards.js'),syncAssignmentCardsForOrg:async()=>[],ensureArray:x=>x||[]});
  vm.runInContext(section('const rebuildAssignmentCardsForOrgTx =','const rebuildAssignmentCardsForOrg =')+'\nthis.run=rebuildAssignmentCardsForOrgTx;',ctx);
  await ctx.run(1,db,true,[7]);
  assert.deepEqual(JSON.parse(JSON.stringify(orderWhere.id)),{in:[7]});
  assert.deepEqual(JSON.parse(JSON.stringify(styleWhere.AND[1])),{workOrderItems:{some:{workOrderId:{in:[7]}}}});
  assert.deepEqual(JSON.parse(JSON.stringify(planWhere)),{orgId:1});
});

test('standard validation reuses prepared processes but still rejects missing ST buckets',async()=>{
  let mirrorLoads=0;
  const mirror=new Map([[1,[{id:8}]]]);
  const ctx=vm.createContext({common_1:require('../backend/dist/utils/common.js'),http_1:{createHttpError:(status,message)=>Object.assign(Error(message),{status})},db_1:{prisma:{}},prisma:{},ensureStyleProcessStorageForStyles:async()=>{mirrorLoads++;return mirror;},loadStyleProcessRowsByStyleId:async()=>new Map([[1,[{id:8,standards:[{quantityBucketEntry:{bucketQuantity:100}}]}]]]),ensureArray:x=>x||[],toPositiveIntOrNull:x=>Number(x)||null,createHttpError:(status,message)=>Object.assign(Error(message),{status})});
  vm.runInContext(section('const ensureStyleStandardsForQuantities =','const toStyleResponse =')+'\nthis.run=ensureStyleStandardsForQuantities;',ctx);
  assert.equal(await ctx.run({styles:[],quantityByStyleId:new Map([[1,new Set([100])]]),preparedProcessMirror:mirror}),mirror);
  assert.equal(mirrorLoads,0);
  await assert.rejects(ctx.run({styles:[],quantityByStyleId:new Map([[1,new Set([200])]]),preparedProcessMirror:mirror}),/ST bucket rows are missing/);
  await ctx.run({styles:[],quantityByStyleId:new Map([[1,new Set([100])]])});
  assert.equal(mirrorLoads,1);
});
