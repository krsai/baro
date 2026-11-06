import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {loadPartnerEditor,registerPartnerEditorRoutes}=require('../backend/dist/services/partnerEditor');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
test('canonical editor reads full profiles, separates relationship/entity IDs and preserves tenant ownership',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const local=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId},include:{systemDefault:true}}),classification={revision:0,roleIds:[local.systemDefault.partnerRoleId],industryIds:[local.systemDefault.id]};
  await db.organization.update({where:{id:s.vendor.id},data:{partyKind:'CORPORATE',code:'VEND',businessNumber:'VN-123',country:'VN',countryCode:'+84',representative:'Contact',phone:'01234',email:'contact@example.test'}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,actor,classification));
  const legacy=await db.organization.create({data:{name:'Legacy company',type:'BRAND',code:'LEGC',partyKind:'CORPORATE',businessNumber:'VN-456',country:'VN'}});
  const relation=await db.orgRelationship.create({data:{manufacturerOrgId:org,brandOrgId:legacy.id,managerName:'Legacy contact',managerPhone:'09876',defaultSizeSetCode:'ALPHA',memo:'Preserve relationship memo'}});
  await db.$transaction(tx=>saveClassification(tx,org,legacy.id,actor,classification));
  const before=[await db.organization.count(),await db.orgRelationship.count(),await db.partnerClassification.count(),await db.organizationBankAccount.count()];
  const profile=await loadPartnerEditor(db,org,actor,s.vendor.id);assert.equal(profile.partyKind,'CORPORATE');assert.equal(profile.countryCode,'+84');assert.equal(profile.contactName,'Contact');assert.equal(profile.contactPhone,'01234');assert.equal(profile.sourceKind,'BUSINESS');assert.equal(profile.canEditProfile,true);assert.equal(profile.classification.revision,1);
  const customer=await loadPartnerEditor(db,org,actor,undefined,relation.id);assert.equal(customer.id,legacy.id);assert.equal(customer.entityId,legacy.id);assert.equal(customer.relationshipId,relation.id);assert.notEqual(customer.id,customer.relationshipId);assert.equal(customer.contactName,'Legacy contact');assert.equal(customer.defaultSizeSetCode,'ALPHA');assert.equal(customer.canEditProfile,true);assert.equal((await loadPartnerEditor(db,org,actor,legacy.id)).relationshipId,relation.id);
  assert.deepEqual([await db.organization.count(),await db.orgRelationship.count(),await db.partnerClassification.count(),await db.organizationBankAccount.count()],before,'opening editors never creates relationships or writes accounts');
  await assert.rejects(loadPartnerEditor(db,org,actor,org),/INVALID_PARTNER_ID/);await assert.rejects(loadPartnerEditor(db,s.other.id,actor,legacy.id),/ACTIVE_EMPLOYEE_REQUIRED/);await assert.rejects(loadPartnerEditor(db,org,actor,999999),/PARTNER_NOT_FOUND/);
  const gradeSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other grades'}}),grade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:gradeSet.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:1}});
  await db.employee.create({data:{orgId:s.other.id,gradeId:grade.id,name:'Other subscriber',status:'ACTIVE',orgRole:'ADMIN'}});await db.orgRelationship.create({data:{manufacturerOrgId:org,brandOrgId:s.other.id}});
  const subscriber=await loadPartnerEditor(db,org,actor,s.other.id);assert.equal(subscriber.canEditProfile,false);for(const key of ['employees','bankAccounts','salary','costs'])assert.equal(key in subscriber,false);
  const routes=new Map();let allowed=true;registerPartnerEditorRoutes({get:(path,fn)=>routes.set(path,fn)},db,{requireOrgRole:async()=>allowed?{organization:s.company}:null,actorId:()=>actor});let result;
  await routes.get('/partner-editor/entity/:id')({params:{id:String(legacy.id)},query:{orgId:s.other.id}},{json:value=>result=value});assert.equal(result.id,legacy.id);allowed=false;result=null;await routes.get('/partner-editor/entity/:id')({params:{id:String(legacy.id)}},{json:value=>result=value});assert.equal(result,null);
  await db.employee.update({where:{id:actor},data:{status:'SUSPENDED'}});await assert.rejects(loadPartnerEditor(db,org,actor,legacy.id),/ACTIVE_EMPLOYEE_REQUIRED/);
 }finally{await f.close();}
});
