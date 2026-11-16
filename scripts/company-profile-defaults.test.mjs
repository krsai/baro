import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {loadPartnerEditor}=require('../backend/dist/services/partnerEditor');
const {connectPartnerCompany,assertPartnerProfileEditable,linkedPartnerCompany}=require('../backend/dist/services/companyConnections');
const {publicIdentityRevision}=require('../backend/dist/services/companyIdentity');
const {publishCompanyProfileDefault}=require('../backend/dist/services/companyProfileDefaults');
const {freightOptions,scopedParty}=require('../backend/dist/services/freightOperations');
const {savePartnerContacts}=require('../backend/dist/services/partnerContacts');

test('original registrar, private copies and explicit self-managed defaults remain separate',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),dex=s.company.id,dexActor=s.people.admin.id;
  const actor=async(orgId,code)=>{const set=await db.employeeGradeSet.create({data:{orgId,code,name:code}});const grade=await db.employeeGrade.create({data:{orgId,setId:set.id,code,name:code,nameKo:code,nameEn:code,nameVi:code,sortOrder:1}});return db.employee.create({data:{orgId,gradeId:grade.id,name:code,status:'ACTIVE',orgRole:'ADMIN'}});};
  const baro=await db.organization.create({data:{name:'BARO',code:'BARD',type:'MANUFACTURER'}}),baroActor=await actor(baro.id,'BARO');
  const thes=await db.organization.create({data:{name:'THE SAN',code:'THES',partyKind:'CORPORATE',businessNumber:'KR-100',country:'KR',type:'BRAND',dataOwnerOrgId:baro.id,representative:'BARO original contact',phone:'+82 111',email:'original@example.test',address:'Original address',updatedByEmployeeId:baroActor.id}});
  await db.orgRelationship.create({data:{manufacturerOrgId:baro.id,brandOrgId:thes.id}});
  const local=await db.organization.create({data:{ownerOrgId:dex,name:'DEX local THES',code:'DTHS',partyKind:'CORPORATE',businessNumber:'KR-100',country:'KR',type:'LOGISTICS_PROVIDER'}});
  const connect=async(orgId,entityId,who)=>{const current=await db.organization.findUnique({where:{id:thes.id}});await db.$transaction(tx=>connectPartnerCompany(tx,orgId,entityId,who,{sourceEntityId:thes.id,revision:publicIdentityRevision(current)}));};
  await connect(dex,local.id,dexActor);
  assert.equal(await linkedPartnerCompany(db,baro.id,thes.id,undefined,{country:'KR',businessNumber:'KR-100'}),null,'the original registrar does not need to link its own canonical anchor back to itself');
  let dexProfile=await loadPartnerEditor(db,dex,dexActor,local.id);
  assert.equal(dexProfile.contactName,'BARO original contact');assert.equal(dexProfile.contactDefaultSource.kind,'REGISTRATION');
  const initialDefaultRevision=dexProfile.contactDefaultRevision;
  const selfActor=await actor(thes.id,'THES');
  assert.equal((await loadPartnerEditor(db,dex,dexActor,local.id)).contactDefaultSource.kind,'REGISTRATION','membership alone does not claim a default');
  await db.$transaction(tx=>savePartnerContacts(tx,dex,local.id,dexActor,{revision:0,mode:'LOCAL',baseMode:'DEFAULT',patch:{contactName:'DEX private contact'}},dexProfile));
  await db.$transaction(async tx=>{const before=await tx.organization.findUnique({where:{id:thes.id}});const after=await tx.organization.update({where:{id:thes.id},data:{representative:'THE SAN own contact',phone:'+82 222',email:'self@example.test',address:'Self address',updatedByEmployeeId:selfActor.id}});await publishCompanyProfileDefault(tx,thes.id,selfActor.id,before,after);});
  const originalView=await loadPartnerEditor(db,baro.id,baroActor.id,thes.id);
  assert.equal(originalView.contactName,'BARO original contact');assert.equal(originalView.contactPhone,'+82 111');assert.equal(originalView.canEditProfile,false);
  await assert.rejects(assertPartnerProfileEditable(db,baro.id,await db.organization.findUnique({where:{id:thes.id}})),/COMPANY_PROFILE_IS_PRIVATE/);
  dexProfile=await loadPartnerEditor(db,dex,dexActor,local.id);
  assert.equal(dexProfile.contactName,'DEX private contact');assert.equal(dexProfile.contactPhone,'+82 111');const freightParty=(await freightOptions(db,dex,dexActor)).find(row=>row.id===local.id);assert.equal(freightParty.contactName,dexProfile.contactName);assert.equal(freightParty.address,dexProfile.address);assert.equal(freightParty.phone,dexProfile.contactPhone);assert.equal((await scopedParty(db,dex,local.id)).contactName,dexProfile.contactName);assert.equal(freightParty.contactRevision,undefined);assert.equal(dexProfile.contactDefaults.contactName,'THE SAN own contact');
  await assert.rejects(db.$transaction(tx=>savePartnerContacts(tx,dex,local.id,dexActor,{revision:1,mode:'LOCAL',baseMode:'DEFAULT',defaultRevision:initialDefaultRevision,patch:{contactName:'Stale default copy'}},dexProfile)),/PARTNER_CONTACT_CHANGED/);
  await db.$transaction(tx=>savePartnerContacts(tx,dex,local.id,dexActor,{revision:1,mode:'DEFAULT',patch:{}},dexProfile));
  dexProfile=await loadPartnerEditor(db,dex,dexActor,local.id);assert.equal(dexProfile.contactName,'THE SAN own contact');assert.equal(dexProfile.contactLocal.contactName,'DEX private contact');
  await db.$transaction(tx=>savePartnerContacts(tx,dex,local.id,dexActor,{revision:2,mode:'LOCAL',patch:{}},dexProfile));
  assert.equal((await loadPartnerEditor(db,dex,dexActor,local.id)).contactName,'DEX private contact');
  const late=await db.organization.create({data:{ownerOrgId:dex,name:'Later THES relation',code:'LTHS',partyKind:'CORPORATE',businessNumber:'KR-100',country:'KR',type:'LOGISTICS_PROVIDER'}});await connect(dex,late.id,dexActor);
  const lateView=await loadPartnerEditor(db,dex,dexActor,late.id);assert.equal(lateView.contactName,'THE SAN own contact','new links receive the self-managed default');assert.equal(lateView.contactLocal.contactName,'THE SAN own contact','a new local copy starts from the selected self default');
  await assert.rejects(db.$transaction(async tx=>{const before=await tx.organization.findUnique({where:{id:thes.id}});const after=await tx.organization.update({where:{id:thes.id},data:{representative:'Must roll back'}});await publishCompanyProfileDefault(tx,thes.id,dexActor,before,after);}),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  assert.equal((await db.organization.findUnique({where:{id:thes.id}})).representative,'THE SAN own contact');
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261115020000_company_profile_defaults');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);
 }finally{await f.close();}
});
