import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {searchShippingCompanies,directoryShippingParty,recentShippingParties}=require('../backend/dist/services/shippingPartyDirectory');
const {saveFreight,scopedParty}=require('../backend/dist/services/freightOperations');
const {lookupShippingParties}=require('../backend/dist/services/shippingRequests');
test('shipping search uses multilingual names/numbers and only saved tenant/customer-scoped jobs provide recommendations',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const saas=await db.organization.create({data:{type:'BRAND',name:'THE SAN',nameKo:'더산',nameVi:'Dệt May San',code:'ZZZZ',businessNumber:'123-45-67890',country:'KR',address:'PUBLIC ADDRESS',phone:'01012345678',email:'public@example.test'}});
  const set=await db.employeeGradeSet.create({data:{orgId:saas.id,code:'TEST',name:'Grades'}}),grade=await db.employeeGrade.create({data:{orgId:saas.id,setId:set.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
  await db.employee.create({data:{orgId:saas.id,gradeId:grade.id,name:'Owner',orgRole:'ADMIN',status:'ACTIVE'}});
  const privateParty=await db.organization.create({data:{type:'MATERIAL_SUPPLIER',name:'Hidden buyer',ownerOrgId:saas.id,country:'VN',businessNumber:'99999',address:'PRIVATE ADDRESS'}});
  const related=await db.organization.create({data:{type:'MATERIAL_SUPPLIER',name:'Other Dex customer',ownerOrgId:org,country:'VN'}});
  const count=await db.organization.count();
  for(const query of ['THE SAN','더산','Dệt May','1234567890','123 45-67890'])assert.ok((await searchShippingCompanies(db,org,query)).some(row=>row.id===saas.id));
  assert.deepEqual(await searchShippingCompanies(db,org,'ZZZZ'),[],'company code is not a search key');
  assert.deepEqual(await searchShippingCompanies(db,org,'Hidden buyer'),[],'a tenant relationship does not publish their private buyers');
  await assert.rejects(directoryShippingParty(db,org,privateParty.id),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(scopedParty(db,org,saas.id),/FREIGHT_PARTY_SCOPE/,'directory does not grant general trading access');
  assert.deepEqual(await lookupShippingParties(db,org,actor,{customerId:s.vendor.id}),[]);
  await assert.rejects(lookupShippingParties(db,org,-1,{customerId:s.vendor.id,query:'THE SAN'}),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(lookupShippingParties(db,org,actor,{customerId:privateParty.id,query:'THE SAN'}),/FREIGHT_PARTY_SCOPE/);
  assert.equal(await db.organization.count(),count,'search does not create local copies or trade relationships');
  const data={customerRole:'shipper',shipperId:s.vendor.id,consigneeId:saas.id,consigneeParty:{name:'Forged name',address:'DOCUMENT DELIVERY',phone:'01012345678',privateCost:'NEVER SHARE'},origin:'Origin',destination:'Destination',cargo:'Goods',plannedDate:'2026-11-23',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},routeLocations:{ORIGIN_DOOR:'Origin',DESTINATION_DOOR:'Destination'}};
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),mode:'ROAD',customerId:s.vendor.id,data});
  assert.equal(job.data.consigneeId,saas.id);assert.equal(job.data.consigneeParty.name,'THE SAN');assert.equal(job.data.consigneeParty.privateCost,undefined);
  const recent=await recentShippingParties(db,org,s.vendor.id);assert.equal(recent.length,1);assert.equal(recent[0].id,saas.id);assert.equal(recent[0].address,'DOCUMENT DELIVERY');assert.equal(recent[0].recentShippingParty,true);
  assert.deepEqual(await recentShippingParties(db,org,related.id),[]);assert.deepEqual(await recentShippingParties(db,saas.id,s.vendor.id),[]);
  assert.equal(await db.organization.count(),count);assert.equal(await db.companyPartnerLink.count({where:{orgId:org,targetOrgId:saas.id}}),0);assert.equal((await db.organization.findUnique({where:{id:saas.id}})).address,'PUBLIC ADDRESS');
  for(const row of [...recent,...await searchShippingCompanies(db,org,'THE SAN')])for(const field of ['ownerOrgId','dataOwnerOrgId','customerId','bankAccounts','salary','margin','privateCost','relationships'])assert.equal(row[field],undefined);
 }finally{await f.close();}
});
