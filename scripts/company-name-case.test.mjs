import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
test('uppercase company masters backfill with originals; preserve people, FKs and immutable identity',async()=>{
 let original,identity,employee;
 const f=await changeApprovalFixture({beforeMigration:async(f,m)=>{
  if(m.version!=='20261110040000_uppercase_company_names')return;
  original=await f.db.organization.create({data:{name:'Nước uống Bình Minh',nameKo:'회사 Acme',nameVi:'Bình Minh',code:'CASE',type:'SERVICE',country:'VN',businessNumber:'12345',representative:'Ms. Nguyệt',email:'Mixed@example.test',address:'Mixed Address'}});
  const set=await f.db.employeeGradeSet.create({data:{orgId:original.id,code:'CASE',name:'Mixed Grades'}});
  const grade=await f.db.employeeGrade.create({data:{orgId:original.id,setId:set.id,code:'CASE',name:'Mixed Grade',nameKo:'Mixed',nameEn:'Mixed',nameVi:'Mixed',sortOrder:1}});
  employee=await f.db.employee.create({data:{orgId:original.id,gradeId:grade.id,name:'Bùi Ngọc Long',email:'Case@example.test',status:'ACTIVE'}});
  identity=await f.db.companyIdentity.create({data:{anchorEntityId:original.id,code:'CASE',name:original.name,nameKo:original.nameKo,nameVi:original.nameVi,country:'VN',businessNumber:'12345'}});
 }});
 try{
  const updated=await f.db.organization.findUnique({where:{id:original.id}});
  assert.equal(updated.name,'NƯỚC UỐNG BÌNH MINH');assert.equal(updated.nameKo,'회사 ACME');assert.equal(updated.nameVi,'BÌNH MINH');
  for(const key of Object.keys(original).filter(k=>!['name','nameKo','nameVi'].includes(k)))assert.deepEqual(updated[key],original[key],key);
  assert.deepEqual(await f.db.employee.findUnique({where:{id:employee.id}}),employee);
  const canonical=await f.db.companyIdentity.findUnique({where:{id:identity.id}});assert.equal(canonical.name,updated.name);
  const audit=await f.db.companyNameCaseAudit.findUnique({where:{organizationId:original.id}});assert.equal(audit.beforeOrganization.name,original.name);assert.equal(audit.beforeIdentity.name,identity.name);assert.equal(audit.identityId,identity.id);
  await assert.rejects(f.db.companyIdentity.update({where:{id:identity.id},data:{name:'Arbitrary'}}));
  await assert.rejects(f.db.companyNameCaseAudit.update({where:{organizationId:original.id},data:{beforeIdentity:{}}}));
  const partner=await f.db.organization.create({data:{name:'個人 Ms. Cuu',nameVi:null,type:'SERVICE',partyKind:'INDIVIDUAL',ownerOrgId:original.id}});assert.equal(partner.name,'個人 MS. CUU');
  const saved=await f.db.organization.update({where:{id:partner.id},data:{name:'New Partner',nameVi:'Nguyễn'}});assert.equal(saved.name,'NEW PARTNER');assert.equal(saved.nameVi,'NGUYỄN');
  assert.equal(saved.ownerOrgId,original.id);assert.notEqual(saved.id,original.id);
  const checks=require('../backend/scripts/railway-schema-preflight').constraints;
  for(const name of ['Organization_name_uppercase','CompanyIdentity_name_uppercase','CompanyNameCaseAudit_immutable'])assert.ok(checks.includes(name));
 }finally{await f.close();}
});
