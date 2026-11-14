import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{searchPublicCompanies,registerCompanyConnectionRoutes}=require('../backend/dist/services/companyConnections');
test('public company name/number search is scoped, bounded and never returns private account or business data',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db);
  await db.organization.update({where:{id:s.company.id},data:{type:'MANUFACTURER'}});
  await db.organization.update({where:{id:s.other.id},data:{name:'Test Forwarder',nameKo:'\uB354\uC0B0',dataOwnerOrgId:s.company.id,businessNumber:'123456789',representative:'Public representative'}});
  const set=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'TEST',name:'Grades'}});
  const grade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:set.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
  await db.employee.create({data:{orgId:s.other.id,name:'Private employee name',orgRole:'ADMIN',status:'ACTIVE',gradeId:grade.id}});
  const found=await searchPublicCompanies(db,s.company.id,{query:'Forward'});assert.equal(found.length,1);assert.equal(found[0].sourceEntityId,s.other.id);assert.equal(found[0].representative,'Public representative');assert.ok(found[0].revision);assert.equal(found[0].subscriberOrgId,s.other.id);
  assert.equal((await searchPublicCompanies(db,s.company.id,{query:'\uB354\uC0B0'}))[0].sourceEntityId,s.other.id);
  for(const key of ['employees','bankAccounts','accounts','accountNumber','documents','prices','ownerOrgId','subscription'])assert.equal(key in found[0],false,key);
  assert.equal(JSON.stringify(found).includes('Private employee name'),false);
  assert.equal((await searchPublicCompanies(db,s.company.id,{query:'123-456'}))[0].sourceEntityId,s.other.id);
  await db.companyIdentity.create({data:{anchorEntityId:s.other.id,code:s.other.code,name:'Old public name',country:'VN',businessNumber:'123456789'}});
  const linked=await searchPublicCompanies(db,s.company.id,{query:'Forward'});assert.equal(linked.length,1);assert.ok(linked[0].identityId);assert.equal(linked[0].name,found[0].name);assert.equal((await searchPublicCompanies(db,s.company.id,{query:'\uB354\uC0B0'}))[0].identityId,linked[0].identityId);
  assert.equal((await searchPublicCompanies(db,s.company.id,{query:'Service company'})).length,0);
  assert.equal((await searchPublicCompanies(db,s.company.id,{query:'%__'})).length,0);
  await assert.rejects(searchPublicCompanies(db,s.company.id,{query:'a'}),/COMPANY_LOOKUP_INPUT_REQUIRED/);
  const handlers=new Map(),app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));
  let allowed=false,actor=999999;registerCompanyConnectionRoutes(app,db,{requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return allowed?{organization:s.company}:null;},getActor:()=>actor});
  const run=()=>handlers.get('get/company-connections/search')({query:{query:'Forward'}},{json:()=>{}});
  await run();allowed=true;await assert.rejects(run(),/ACTIVE_EMPLOYEE_REQUIRED/);actor=s.people.admin.id;await run();
  await db.organization.update({where:{id:s.other.id},data:{isActive:false}});assert.equal((await searchPublicCompanies(db,s.company.id,{query:'Forward'})).length,0);
  assert.equal(await db.expenseRequest.count(),0);assert.equal(await db.bankLedgerEntry.count(),0);
 }finally{await f.close();}
});
