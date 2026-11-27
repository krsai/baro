import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {sanitizeRoleAccessPolicy,serializeRoleAccessPolicy,getDefaultRoleAccessPolicy} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import {organizeCompanyMenu} from '../frontend/src/utils/companyMenuLayout.mjs';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
const require=createRequire(import.meta.url);
const {logisticsStatusReport,registerLogisticsStatusRoutes}=require('../backend/dist/services/logisticsStatus');
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill}=require('../backend/dist/services/freightJobs');
const {companyIndustryMenuFeatures,readIndustryMenuPolicy,saveIndustryMenuPolicy}=require('../backend/dist/services/industryMenuPolicy');

test('forwarder report uses real company/customer and MBL FKs, work edits, completion and paginated totals',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const create=()=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD'});
  const a=await create(),b=await create(),cancelled=await create();
  const data={...a.data,etd:'2026-11-20',eta:'2026-11-25',cargo:'Original',plannedDate:'2026-11-18',remark:'Original Memo',workDetails:{plannedDate:'2026-11-19',cargo:'Steel Coils',remark:'Make DN',quantity:'0',weightKg:'1234.5',cbm:'0',containers:[{count:'2',size:'40',type:'HQ'}]},bankAccount:'SECRET',margin:'SECRET'};
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET version=version+1,"receiptStatus"=\'ACCEPTED\',status=\'IN_TRANSIT\',data=$1::jsonb WHERE id=$2',JSON.stringify(data),a.id);
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET version=version+1,"receiptStatus"=\'ACCEPTED\',status=\'DELIVERED\',data=$1::jsonb WHERE id=$2',JSON.stringify({...b.data,deliveryDate:'2026-11-24'}),b.id);
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET version=version+1,status=\'CANCELLED\' WHERE id=$1',cancelled.id);
  const master=await saveJobBill(db,org,actor,a.id,{id:randomUUID(),kind:'MASTER',number:'MBL-001',issuer:'Carrier',data:{etd:'2026-11-21',eta:'2026-11-26'}});
  let report=await logisticsStatusReport(db,org,actor,{});
  assert.equal(report.total,1);assert.equal(report.rows[0].id,a.id);assert.equal(report.rows[0].remark,'Make DN');assert.equal(report.rows[0].cargo,'Steel Coils');assert.equal(report.rows[0].quantity,'0');assert.equal(report.rows[0].cargoReadyDate,'2026-11-19');
  assert.deepEqual(report.rows[0].schedules,[{id:master.id,number:'MBL-001',etd:'2026-11-21',eta:'2026-11-26'}]);assert.equal(report.rows[0].deliveryDate,null);
  assert.ok(!JSON.stringify(report).includes('SECRET'));assert.equal(report.rows[0].data,undefined);
  assert.equal((await logisticsStatusReport(db,org,actor,{search:'make dn'})).total,1);
  assert.equal((await logisticsStatusReport(db,org,actor,{search:'Original Memo'})).total,0);
  assert.equal((await logisticsStatusReport(db,org,actor,{search:'%'})).total,0);
  assert.equal((await logisticsStatusReport(db,org,actor,{customerId:String(s.other.id)})).total,0);
  report=await logisticsStatusReport(db,org,actor,{includeCompleted:'true'});assert.equal(report.total,2);assert.equal(report.rows.find(r=>r.id===b.id).deliveryDate,'2026-11-24');assert.equal(report.rows.find(r=>r.id===b.id).cargoReadyDate,null);
  report=await logisticsStatusReport(db,org,actor,{offset:'50'});assert.equal(report.total,1);assert.deepEqual(report.rows,[]);assert.equal(report.customers.length,1);
  for(let i=0;i<50;i++)await create();
  report=await logisticsStatusReport(db,org,actor,{});assert.equal(report.total,51);assert.equal(report.rows.length,50);
  const pageTwo=await logisticsStatusReport(db,org,actor,{offset:'50'});assert.equal(pageTwo.total,51);assert.equal(pageTwo.rows.length,1);assert.ok(!report.rows.some(row=>row.id===pageTwo.rows[0].id));
  await assert.rejects(logisticsStatusReport(db,s.other.id,actor,{}),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(logisticsStatusReport(db,org,actor,{offset:'-1'}),/FREIGHT_INVALID_INPUT/);
  await db.employee.update({where:{id:actor},data:{status:'SUSPENDED'}});await assert.rejects(logisticsStatusReport(db,org,actor,{}),/ACTIVE_EMPLOYEE_REQUIRED/);
 }finally{await f.close();}
});

test('status board inherits old freight visibility once and retains independent explicit denial',()=>{
 const old={...getDefaultRoleAccessPolicy(),__schemaVersion:19};old.SERVICE.OPERATOR=['FREIGHT'];old.SERVICE.ACCOUNTANT=[];
 const next=sanitizeRoleAccessPolicy(old);assert.ok(next.SERVICE.OPERATOR.includes('PRODUCTION_STATUS'));assert.ok(!next.SERVICE.ACCOUNTANT.includes('PRODUCTION_STATUS'));
 next.SERVICE.OPERATOR=next.SERVICE.OPERATOR.filter(f=>f!=='PRODUCTION_STATUS');assert.ok(!sanitizeRoleAccessPolicy(serializeRoleAccessPolicy(next)).SERVICE.OPERATOR.includes('PRODUCTION_STATUS'));
 const auth={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'OPERATOR',accessPolicy:serializeRoleAccessPolicy(next),industryMenuFeatures:['PRODUCTION_STATUS','FREIGHT']}};
 assert.equal(canAccessPath('/customer-production-report',auth),false);
 auth.accessProfile.accessPolicy.SERVICE.OPERATOR.push('PRODUCTION_STATUS');assert.equal(canAccessPath('/customer-production-report',auth),true);
 auth.accessProfile.orgRole='WORKER';auth.accessProfile.accessPolicy.SERVICE.WORKER=['PRODUCTION_STATUS'];assert.equal(canAccessPath('/customer-production-report',auth),false);
 const tree=[{isParent:true,menuGroupKey:'ORDER',children:[{path:'/customer-production-report'},{path:'/business-partner'}]},{isParent:true,menuGroupKey:'LOGISTICS',children:[{path:'/shipping'}]}];
 const service=organizeCompanyMenu(tree,key=>key,'SERVICE');assert.ok(service.find(g=>g.menuGroupKey==='LOGISTICS').children.some(c=>c.path==='/customer-production-report'));
 assert.ok(!service.find(g=>g.menuGroupKey==='ORDER').children.some(c=>c.path==='/customer-production-report'));
});

test('report route rejects non-service and explicit role/industry denial before querying business data',async()=>{
 let handler;const app={get:(_path,fn)=>handler=fn};let calls=0;
 const db={systemSetting:{findUnique:async()=>({value:{freightStatusSplit:true,fullScopeTypes:['SERVICE'],subscribers:{SERVICE:[]}}})}};
 const ctx={organization:{id:1,type:'SERVICE'},employee:{orgRole:'ADMIN'}};
 let policy={SERVICE:{ADMIN:[]}};registerLogisticsStatusRoutes(app,db,{requireOrgRole:async(_r,_s,options)=>{assert.equal(options.allowSystemAdmin,false);return ctx;},loadPolicy:async()=>({policy}),actorId:()=>{calls++;return 1;}});
 await assert.rejects(handler({query:{}},{}),/FEATURE_ACCESS_DENIED/);policy.SERVICE.ADMIN=['PRODUCTION_STATUS'];await assert.rejects(handler({query:{}},{}),/FEATURE_ACCESS_DENIED/);
 ctx.organization.type='MANUFACTURER';await assert.rejects(handler({query:{}},{}),/FEATURE_ACCESS_DENIED/);assert.equal(calls,0);
});

test('industry migration inherits SERVICE freight once and preserves a saved board denial',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db);
  await db.systemSetting.create({data:{key:'INDUSTRY_MENU_POLICY:1',value:{revision:0,menuSplitVersion:19,fullScopeTypes:['SERVICE'],subscribers:{SERVICE:['FREIGHT']},industries:{}}}});
  assert.ok((await companyIndustryMenuFeatures(db,s.company.id,'SERVICE')).includes('PRODUCTION_STATUS'));
  const policy=await readIndustryMenuPolicy(db);await saveIndustryMenuPolicy(db,{...policy,subscribers:{SERVICE:['FREIGHT']},fullScopeTypes:['SERVICE']},'system@example.test');
  assert.ok(!(await companyIndustryMenuFeatures(db,s.company.id,'SERVICE')).includes('PRODUCTION_STATUS'));
 }finally{await f.close();}
});
