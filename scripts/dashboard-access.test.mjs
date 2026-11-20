import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {canShowAccountingAlerts,canShowApprovals,canShowInventoryAlerts} from '../frontend/src/utils/dashboardAccess.mjs';
const require=createRequire(import.meta.url);
const {dashboardApprovalMenus}=require('../backend/dist/services/dashboardAccess');
const {registerApprovalReviewRoutes}=require('../backend/dist/services/approvalReview');
const {listApprovalReviews,approvalReviewDetail}=require('../backend/dist/services/approvalReview');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const auth=(role,features)=>({isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:role,...(features?{accessPolicy:{__schemaVersion:19,MANUFACTURER:{[role]:features}}}:{})}});

test('dashboard separates accounting review responsibility from operator participation',()=>{
 for(const role of ['ADMIN','ACCOUNTANT'])assert.equal(canShowAccountingAlerts(auth(role)),true);
 for(const role of ['OPERATOR','WORKER'])assert.equal(canShowAccountingAlerts(auth(role)),false);
 assert.equal(canShowApprovals(auth('OPERATOR')),true);
 assert.equal(canShowApprovals(auth('WORKER')),false);
 assert.equal(canShowApprovals(auth('OPERATOR',['DASHBOARD'])),false);
 for(const feature of ['BANK_LEDGER','INVOICE','OUTSOURCING_RECORD'])assert.equal(canShowApprovals(auth('ACCOUNTANT',['DASHBOARD',feature])),true);
 assert.equal(canShowAccountingAlerts({...auth('ADMIN'),isAuthenticated:false}),false);
});

test('negative inventory alerts require stock permission and an actual business role',()=>{
 for(const role of ['ADMIN','ACCOUNTANT','OPERATOR']){
  assert.equal(canShowInventoryAlerts(auth(role,['DASHBOARD','INVENTORY_STOCK'])),true);
  assert.equal(canShowInventoryAlerts(auth(role,['DASHBOARD'])),false);
 }
 assert.equal(canShowInventoryAlerts(auth('WORKER',['DASHBOARD','INVENTORY_STOCK'])),false);
 assert.equal(canShowInventoryAlerts({...auth('ADMIN'),activeOrgId:'SYSTEM'}),false);
});

test('approval menus use persisted company features and actual employee role',async()=>{
 const db={systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null}};
 const seen=[];
 assert.deepEqual(await dashboardApprovalMenus(db,1,'MANUFACTURER',{orgRole:'OPERATOR'},{canAccess:async scope=>{seen.push(scope);return scope.feature==='INVOICE';}}),['INVOICE']);
 assert.ok(seen.every(scope=>scope.orgRole==='OPERATOR'));
});

test('review detail denies revoked module access before loading financial snapshots',async()=>{
 const handlers=new Map();let read=0;
 const db={employee:{findFirst:async()=>({id:7,orgRole:'OPERATOR'})},systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null},changeApprovalRequest:{findFirst:async()=>{read++;return {menu:'EXPENSE'};}}};
 registerApprovalReviewRoutes({get:(path,fn)=>handlers.set(path,fn)},db,{requireOrgRole:async()=>({organization:{id:1,type:'MANUFACTURER'},employee:{orgRole:'ADMIN'}}),actorId:()=>7,canAccess:async scope=>scope.feature==='INVOICE'});
 await assert.rejects(handlers.get('/approval-reviews/:kind/:id')({params:{kind:'CHANGE_APPROVAL',id:'request'}},{json:()=>assert.fail('no financial response')}),/ACCESS_DENIED/);
 assert.equal(read,1);
});

test('operator tracks own applications without receiving unrelated company approvals',async()=>{
 const f=await changeApprovalFixture(),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id;
  const operator=await db.employee.create({data:{orgId:org,name:'Operator',gradeId:s.people.junior.gradeId,orgRole:'OPERATOR',status:'ACTIVE'}});
  const input=()=>({partnerOrgId:s.vendor.id,requestDate:'2026-11-10',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'REF',evidenceFile:'stored.pdf'}}]});
  const own=await db.$transaction(tx=>registerExpenseRequest(tx,org,operator.id,input()));
  const unrelated=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,input()));
  const rows=await listApprovalReviews(db,org,operator.id,{status:'ALL'},['EXPENSE']);
  assert.deepEqual(rows.rows.map(row=>row.id),[own.id]);
  assert.equal((await approvalReviewDetail(db,org,operator.id,'EXPENSE_REQUEST',String(own.id))).canDecide,false);
  await assert.rejects(approvalReviewDetail(db,org,operator.id,'EXPENSE_REQUEST',String(unrelated.id)),/NOT_PARTICIPANT/);
  assert.equal((await listApprovalReviews(db,org,operator.id,{status:'ALL'},['INVOICE'])).total,0);
 }finally{await f.close();}
});
