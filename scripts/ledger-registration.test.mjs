import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {previewChangeApproval,requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {postLedgerEntry,listLedgerActivity}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {registerExpensePayeeRoutes}=require('../backend/dist/services/expensePayee');
const {previewLedgerRegistration,validateLedgerRegistration}=require('../backend/dist/services/ledgerRegistration');

test('bank fees debit only the owned account without evidence or recipient and require the real fee classification',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const body={clientKey:randomUUID(),transactionDate:'2026-11-05',direction:'OUT',amount:'10',remark:'',evidenceType:'BANK_FEE',evidenceNumber:'',accountingCodeId:s.code.id};
  await assert.rejects(postLedgerEntry(db,org,'test',s.account.id,body),/LEDGER_BANK_FEE_CODE_UNAVAILABLE/);
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'BNF'}});
  for(const patch of [{direction:'IN'},{evidenceNumber:'receipt'},{counterparty:{kind:'PARTNER',id:s.vendor.id}}])await assert.rejects(postLedgerEntry(db,org,'test',s.account.id,{...body,...patch}),/LEDGER_INVALID_EVIDENCE/);
  const batchKey=randomUUID(),request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:batchKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey,rows:[{...body,accountId:s.account.id,entryKind:'BANK'}]}});
  assert.equal(await db.bankLedgerEntry.count(),0,'fees also wait for final approval');
  await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});
  const result=await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});
  const row=await db.bankLedgerEntry.findFirstOrThrow({where:{clientKey:body.clientKey}});
  assert.equal(row.direction,'OUT');assert.equal(row.evidenceType,'BANK_FEE');assert.equal(row.evidenceNumber,'');assert.equal(row.counterpartyOrgId,null);assert.equal(row.counterpartyAccountId,null);
  const searched=await listLedgerActivity(db,org,{start:'2026-11-05',end:'2026-11-05',search:'BNF',includeVoided:'0'});assert.equal(searched.rows.length,1);assert.equal(searched.rows[0].balance,'-10.00');
  assert.equal((await listLedgerActivity(db,org,{start:'2026-11-05',end:'2026-11-05',search:'missing-search',includeVoided:'0'})).rows.length,0);
  assert.equal((await listLedgerActivity(db,s.other.id,{start:'2026-11-05',end:'2026-11-05',search:'FEE',includeVoided:'0'})).rows.length,0);
  assert.equal((await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'})).id,result.id);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(m=>m.version==='20261111020000_bank_fee_without_evidence');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);await f.pg.exec(require('../backend/scripts/migrate-entity-profiles').migrations().find(m=>m.version==='20261113030000_bank_fee_bnf_link').sql);assert.equal(await db.bankLedgerEntry.count(),1);
  for(const [amount,remark] of [['20','hidden intermediate'],['30','selected fee']]){
   const key=randomUUID(),pending=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:key,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:key,rows:[{...body,clientKey:randomUUID(),amount,remark,accountId:s.account.id,entryKind:'BANK'}]}});
   await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});await decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'});
  }
  const selected=await listLedgerActivity(db,org,{start:'2026-11-05',end:'2026-11-05',search:'selected fee',includeVoided:'0'});assert.equal(selected.rows.length,1);assert.equal(selected.rows[0].balance,'-60.00','search must retain hidden transactions in actual running balance');assert.equal(selected.accounts.find(account=>account.id===s.account.id).currentBalance,'-60.00');
 }finally{await f.close();}
});

test('registration bands skip only qualified intermediate authority and preserve final approval snapshots',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const stages=[{role:'ACCOUNTANT',gradeMatch:'EXACT',gradeId:s.people.senior.gradeId},{role:'ACCOUNTANT',gradeMatch:'EXACT',gradeId:s.people.lead.gradeId}];
  const config=await validateLedgerRegistration(db,org,{kind:'BANK_LEDGER',revision:0,drafterScope:{role:'ALL',gradeId:null},rules:['USD','VND','KRW'].map(currency=>({id:currency,name:currency,currency,min:'0',max:null,drafterRole:'ALL',drafterGradeId:null,stages}))});
  const source={items:[{unitPrice:'10'}],entry:{account:{currencyCode:'USD'}}};
  const junior=await previewLedgerRegistration(db,org,s.people.junior,source,config);assert.equal(junior.stages.length,2);
  const senior=await previewLedgerRegistration(db,org,s.people.senior,source,config);assert.deepEqual(senior.ids,[s.people.lead.id]);assert.deepEqual(senior.policy.skipped,['step1']);assert.equal(senior.stages[0].key,'step2');
  const lead=await previewLedgerRegistration(db,org,s.people.lead,source,config);assert.equal(lead.complete,true);assert.equal(lead.policy.exempt,true);assert.equal(lead.policy.exemptionReason,'FINAL_DRAFTER');assert.equal(lead.stages.length,0);
  const bank={entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID()};
  await db.systemSetting.create({data:{key:`APPROVAL_POLICY:BANK_LEDGER:CREATE:${org}`,value:config}});
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank]};
  const pending=await requestChangeApproval(db,org,s.people.senior.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID()});
  assert.equal(pending.policy.resolvedStages.length,1);assert.equal(pending.policy.resolvedStages[0].gradeId,s.people.lead.gradeId);assert.deepEqual(pending.policy.effectiveRegistrationStages,[stages[1]]);assert.equal(await db.bankLedgerEntry.count(),0);
  await db.systemSetting.update({where:{key:`APPROVAL_POLICY:BANK_LEDGER:CREATE:${org}`},data:{value:{...config,rules:[]}}});
  await assert.rejects(decideChangeApproval(db,org,s.people.senior.id,pending.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  const done=await decideChangeApproval(db,org,s.people.lead.id,pending.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');assert.equal(await db.bankLedgerEntry.count(),1);
 }finally{await f.close();}
});

test('final drafter authority is automatic while a nonqualifying drafter still reports shortages',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),drafter=s.people.senior;
  const config={registrationStages:[{role:'ACCOUNTANT',gradeMatch:'ANY',gradeId:null},{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:drafter.gradeId}]};
  const source={items:[{unitPrice:'3553561'}],entry:{account:{currencyCode:'VND'}}};
  const self=await previewLedgerRegistration(db,s.company.id,drafter,source,config);assert.equal(self.policy.exemptionReason,'FINAL_DRAFTER');assert.equal(self.complete,true);
  const incomplete=await previewLedgerRegistration(db,s.company.id,s.people.junior,source,config);assert.equal(incomplete.complete,false);assert.equal(incomplete.stages[0].candidates.length,2);
  const chosen=await previewLedgerRegistration(db,s.company.id,s.people.junior,source,config,{step2EmployeeId:s.people.lead.id});assert.deepEqual(chosen.ids,[s.people.lead.id]);
  await db.employee.updateMany({where:{id:{in:[s.people.senior.id,s.people.lead.id]}},data:{status:'SUSPENDED'}});
  const none=await previewLedgerRegistration(db,s.company.id,s.people.junior,source,config);assert.equal(none.complete,false);assert.equal(none.stages[0].unavailableReason,'NO_ELIGIBLE');
  const missing=await previewLedgerRegistration(db,s.company.id,s.people.junior,source,{registrationStages:[{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:null}]});assert.equal(missing.complete,false);assert.equal(missing.stages[0].unavailableReason,'GRADE_NOT_CONFIGURED');
 }finally{await f.close();}
});

test('single-account ledger registration uses two independent accounting approvals and preserves source scope',async()=>{
 const f=await changeApprovalFixture({registration:true}),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id;
  const bank=(extra={})=>({entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID(),...extra});
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank({remark:'',purpose:''}),bank({amount:'20'})]};
  const input={menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}};
  const preview=(await previewChangeApproval(db,org,s.people.admin.id,input)).preview;
  assert.equal((await previewChangeApproval(db,org,s.people.admin.id,{...input,payload:{...payload,rows:[bank({amount:'',counterparty:null})]}})).preview.stages.length,2,'the amount-independent line can be selected before completing details');
  assert.equal(preview.stages.length,2);assert.ok(preview.stages[0].candidates.some(p=>p.id===s.people.junior.id));assert.ok(preview.stages[1].candidates.some(p=>p.id===s.people.senior.id));assert.ok(preview.stages[1].candidates.some(p=>p.id===s.people.lead.id));assert.ok(!preview.stages[1].candidates.some(p=>p.id===s.people.junior.id));
  await assert.rejects(previewChangeApproval(db,org,s.people.admin.id,{...input,payload:{...payload,rows:[bank(),bank({accountId:'foreign'})]}}),/LEDGER_ACCOUNT_NOT_FOUND/);
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,bank()),/CHANGE_APPROVAL_REQUIRED/);
  const request=await requestChangeApproval(db,org,s.people.admin.id,input);assert.equal(await db.bankLedgerEntry.count(),0);
  assert.equal((await requestChangeApproval(db,org,s.people.admin.id,input)).id,request.id);
  await assert.rejects(decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  await assert.rejects(decideChangeApproval(db,org,s.people.admin.id,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),0);
  const done=await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');assert.equal(done.result.entryIds.length,2);assert.equal(await db.bankLedgerEntry.count(),2);
  assert.ok((await db.bankLedgerEntry.findUnique({where:{id:done.result.entryIds[0]}})).purpose,'blank optional remarks use the accounting description for the required ledger purpose');
  await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),2);
  const rejectPayload={...payload,clientKey:randomUUID(),rows:[bank()]};const rejected=await requestChangeApproval(db,org,s.people.admin.id,{...input,clientKey:randomUUID(),sourceId:rejectPayload.clientKey,payload:rejectPayload});await decideChangeApproval(db,org,s.people.junior.id,rejected.id,{decision:'REJECTED',reason:'Wrong receipt'});assert.equal(await db.bankLedgerEntry.count(),2);
  const correction={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank({amount:'15'})]};
  const edit=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'UPDATE',reason:'Correct recorded details',sourceKind:'ledger',sourceId:done.result.entryIds[0],payload:correction,clientKey:randomUUID()});
  const corrected=await decideChangeApproval(db,org,s.people.senior.id,edit.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),2);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:corrected.result.entryIds[0]}})).amount.toString(),'15');
  // A real local company is eligible independently of the obsolete vendor type.
  const baro=await db.organization.create({data:{name:'BARO',type:'BRAND',ownerOrgId:org}});
  await db.organizationBankAccount.create({data:{orgId:org,entityId:baro.id,currencyId:s.currency.id,bankName:'BARO bank',accountNumber:'002',accountHolder:'BARO',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id}});
  const routes=new Map();registerExpensePayeeRoutes({get:(p,h)=>routes.set(p,h),post:()=>{},put:()=>{}},db,{requireOrgRole:async()=>({organization:s.company})});let payees;
  await routes.get('/expense-payees')({query:{}},{json:value=>payees=value});assert.ok(payees.some(p=>p.id===baro.id));
  const document=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,{partnerOrgId:baro.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{evidenceFile:'fixture-evidence.pdf',reference:'BARO-1'}}]}));assert.equal(document.partnerOrgId,baro.id);
 }finally{await f.close();}
});
