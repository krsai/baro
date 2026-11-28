import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {billPortLabel} from '../frontend/src/utils/billPortLabel.mjs';
import {initialBillData} from '../frontend/src/utils/shippingBillData.mjs';
import {normalizeHumanPayload,textFieldCase} from '../frontend/src/utils/humanTextCase.mjs';
const require=createRequire(import.meta.url);
const {companyBranding,saveCompanyBranding}=require('../backend/dist/services/companyBranding');
const {saveCompanyProfileAndClassification}=require('../backend/dist/services/companyIndustries');
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobOptions,jobDetail}=require('../backend/dist/services/freightJobs');
const {createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {dexlBillLogo:logo}=require('../backend/dist/assets/dexlBillLogo');
const backendCase=require('../backend/dist/utils/humanTextCase');
const {billData}=require('../backend/dist/services/freightBillData');
const {syncBillsFromJob}=require('../backend/dist/services/shippingSharedData');

test('legacy BL port labels still follow an actual changed port code without merging a manual override',async()=>{
 const ports=[{code:'VNHPH',name:'Haiphong',country:'VN'},{code:'KRINC',name:'Incheon',country:'KR'}],writes=[];
 const tx={$queryRawUnsafe:async(sql,...args)=>{
  if(sql.startsWith('SELECT code,name'))return ports.filter(p=>args[0].includes(p.code));
  if(sql.startsWith('SELECT b.*'))return [{id:'shared',kind:'HOUSE',linkedJobs:1,version:1,data:{origin:'Haiphong (Vnhph)'}},{id:'manual',kind:'HOUSE',linkedJobs:1,version:1,data:{origin:'Document Override'}}];
  if(sql.startsWith('UPDATE "FreightBill"')){writes.push({data:JSON.parse(args[0]),id:args[2]});return [{id:args[2],data:JSON.parse(args[0]),version:2}];}
  throw Error(sql);
 },$executeRawUnsafe:async()=>1};
 const before={id:'job',orgId:1,mode:'SEA',data:{originPortCode:'VNHPH',routeLocations:{ORIGIN_TERMINAL:'Haiphong (VNHPH)'}}},after={...before,data:{originPortCode:'KRINC',routeLocations:{ORIGIN_TERMINAL:'Incheon (KRINC)'}}};
 await syncBillsFromJob(tx,1,before,after);assert.deepEqual(writes,[{id:'shared',data:{origin:'INCHEON, KOREA'}}]);assert.equal(before.data.originPortCode,'VNHPH');assert.equal(after.data.originPortCode,'KRINC');
});

test('POL/POD use uppercase English port and country while actual codes and snapshots stay intact',()=>{
 assert.equal(billPortLabel('Incheon (Krinc)'),'INCHEON, KOREA');assert.equal(billPortLabel('Haiphong (VNHPH)'),'HAIPHONG, VIETNAM');
 assert.equal(billPortLabel('Custom Document Port'),'CUSTOM DOCUMENT PORT');
 for(const normalize of [normalizeHumanPayload,backendCase.normalizeHumanPayload]){
  const raw={data:{origin:'Incheon (KRINC)',destination:'Haiphong (VNHPH)',originPortCode:'KRINC',destinationPortCode:'VNHPH',routeLocations:{ORIGIN_TERMINAL:'Incheon (KRINC)'}},snapshot:{origin:'Original (Krinc)'}};
  const sr=normalize(raw,{path:'/shipping-requests'});assert.equal(sr.data.originPortCode,'KRINC');assert.equal(sr.data.destinationPortCode,'VNHPH');assert.equal(sr.data.routeLocations.ORIGIN_TERMINAL,'Incheon (KRINC)');assert.equal(sr.snapshot.origin,'Original (Krinc)');
  const bl=normalize(raw,{path:'/freight/transport-jobs/job/bills'});assert.equal(bl.data.origin,'INCHEON (KRINC)');assert.equal(bl.data.originPortCode,'KRINC');
 }
 assert.equal(textFieldCase({name:'originPortCode'}),'preserve');
 assert.deepEqual(billData({origin:'Incheon (Krinc)',destination:'Haiphong (VNHPH)'}),{destination:'HAIPHONG, VIETNAM',origin:'INCHEON, KOREA'});
 const job={mode:'SEA',service:'GENERAL',data:{originPortCode:'KRINC',destinationPortCode:'VNHPH',routeLocations:{ORIGIN_TERMINAL:'Incheon (KRINC)',DESTINATION_TERMINAL:'Haiphong (VNHPH)'}}};
 const fresh=initialBillData(job,{kind:'HOUSE',data:{}});assert.equal(fresh.origin,'INCHEON, KOREA');assert.equal(fresh.destination,'HAIPHONG, VIETNAM');
 const saved={kind:'HOUSE',version:1,data:{origin:'Legacy (Krinc)',logoDataUrl:'original'}};assert.equal(initialBillData(job,saved).origin,'Legacy (Krinc)');assert.equal(initialBillData(job,saved,null,{logoDataUrl:'new'}).logoDataUrl,'original');
});
test('company profile logo is tenant-owned, atomic with classification, retryable and copied into new BL snapshots only',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  await db.organization.update({where:{id:org},data:{code:'DEXL'}});
  assert.equal((await companyBranding(db,org)).logoDataUrl,'','DEXL code has no built-in logo');
  const service=await db.outsourcingServiceType.findUnique({where:{id:s.code.serviceTypeId}}),industry=await db.settingServiceDefault.findUnique({where:{id:service.systemDefaultId}}),classification={revision:0,roleIds:[industry.partnerRoleId],industryIds:[industry.id]};
  const saved=await saveCompanyProfileAndClassification(db,org,actor,{},classification,{version:0,logoDataUrl:logo});assert.equal(saved.companyLogo.version,1);
  assert.equal((await jobOptions(db,org,actor)).billBranding.logoDataUrl,logo);assert.equal((await companyBranding(db,s.other.id)).logoDataUrl,'');
  assert.equal((await db.$transaction(tx=>saveCompanyBranding(tx,org,actor,{version:0,logoDataUrl:logo}))).version,1);
  await assert.rejects(db.$transaction(tx=>saveCompanyBranding(tx,s.other.id,actor,{version:0,logoDataUrl:logo})),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  await assert.rejects(db.$transaction(tx=>saveCompanyBranding(tx,org,s.people.junior.id,{version:1,logoDataUrl:''})),/COMPANY_INDUSTRY_ADMIN_REQUIRED/);
  const before=await db.organization.findUnique({where:{id:org}});
  await assert.rejects(saveCompanyProfileAndClassification(db,org,actor,{name:'Must Roll Back'},{...classification,revision:1},{version:1,logoDataUrl:'bad'}),/FREIGHT_LOGO_INVALID/);
  assert.equal((await db.organization.findUnique({where:{id:org}})).name,before.name);assert.equal((await companyBranding(db,org)).version,1);assert.equal((await db.partnerClassification.findFirst({where:{orgId:org,entityId:org}})).revision,1);
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HAIPHONG',destination:'INCHEON',shipper:'SHIPPER',consignee:'CONSIGNEE'}});
  const request={id:randomUUID(),kind:'HOUSE',number:'',data:{shipper:'SHIPPER',consignee:'CONSIGNEE',origin:'Haiphong (VNHPH)',destination:'Incheon (KRINC)'}};
  const bill=await saveJobBill(db,org,actor,job.id,request);assert.equal(bill.data.logoDataUrl,logo);assert.equal(bill.data.origin,'HAIPHONG, VIETNAM');assert.equal(bill.data.destination,'INCHEON, KOREA');
  const detail=await jobDetail(db,org,actor,job.id),output=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:detail.version,kind:'HOUSE_DRAFT',billId:bill.id,billVersion:bill.version,fields:{}});
  await db.$transaction(tx=>saveCompanyBranding(tx,org,actor,{version:1,logoDataUrl:''}));
  assert.equal((await saveJobBill(db,org,actor,job.id,request)).data.logoDataUrl,logo,'retry preserves first copy after company change');
  assert.equal((await jobDetail(db,org,actor,job.id)).bills.find(b=>b.id===bill.id).data.logoDataUrl,logo);assert.equal(output.snapshot.source.data.logoDataUrl,logo);
  const next=await saveJobBill(db,org,actor,job.id,{...request,id:randomUUID()});assert.equal(next.data.logoDataUrl,'');
  await assert.rejects(saveJobBill(db,org,actor,job.id,{...request,id:randomUUID(),data:{...request.data,logoDataUrl:logo}}),/FREIGHT_COMPANY_LOGO_REQUIRED/);
 }finally{await f.close();}
});
