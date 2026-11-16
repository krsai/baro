// Narrow owner-authorized repair. Credentials are accepted through stdin only.
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {missingSchema}=require('./railway-schema-preflight');
const {createHash}=require('node:crypto');
const {loadExpenseEditorSource,expenseEditorRevision,expenseEditorForm,saveExpenseEditor}=require('../dist/services/expenseRequestEditor');
const {postLedgerEntryInTransaction}=require('../dist/services/bankLedger');
const {approvalState}=require('../dist/services/bankEvidence');
const key='BARO_LANDLORD_LHFE_CORRECTION:31:308960b8-1e0a-4901-972a-fa7c746e8fe1';
const entryId='308960b8-1e0a-4901-972a-fa7c746e8fe1';
const json=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(JSON.stringify(json(value))).digest('hex');
const reason='Owner requested correction of all four TRKE items to LHFE; same payee FK, unchanged 2,500,000 VND payment.';
async function run(db,{apply=false,verify=false,revision}={}){
 return db.$transaction(async tx=>{
  if(!apply&&!verify)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  else{
   await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261116,31)');
   await tx.$executeRawUnsafe('LOCK TABLE "ExpenseRequest","PartnerTransactionCost","BankLedgerEntry","BankLedgerEvidenceAllocation" IN SHARE ROW EXCLUSIVE MODE');
  }
  const receipt=await tx.systemSetting.findUnique({where:{key}});if(receipt){
   const saved=await loadExpenseEditorSource(tx,1,'request','31');assert.equal(saved.document.version,2);assert.equal(saved.costs.length,4);
   for(const cost of saved.costs){assert.equal(cost.transactionCodeId,169601);assert.equal(cost.partnerOrgId,1858);}
   const payment=await tx.bankLedgerEntry.findUnique({where:{id:receipt.value.replacementEntryId},include:{allocations:true}});
   assert.equal(payment.voidedAt,null);assert.equal(payment.accountingCodeId,169601);assert.equal(payment.counterpartyName,'NGUYEN TRAN DAT');assert.equal(String(payment.amount),'2500000');assert.equal(payment.allocations.length,4);
   assert.equal(payment.revisesEntryId,entryId);assert.ok((await tx.bankLedgerEntry.findUnique({where:{id:entryId}})).voidedAt);
   const disabled=await tx.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgrelid IN ('"ExpenseRequest"'::regclass,'"BankLedgerEntry"'::regclass) AND NOT tgisinternal AND tgenabled='D'`);assert.equal(disabled.length,0);
   return {alreadyApplied:true,verified:true,code:'LHFE',itemCount:4,total:'2500000',payee:payment.counterpartyName,replacementEntryId:payment.id};
  }
  assert.ok(await tx.organization.findFirst({where:{id:1,code:'BARO',ownerOrgId:null}}));
  const actor=await tx.employee.findFirst({where:{id:1,orgId:1,status:'ACTIVE',orgRole:'ADMIN'}});assert.ok(actor?.email);
  const source=await loadExpenseEditorSource(tx,1,'request','31'),doc=source.document;
  assert.equal(doc.managementNumber,'EXP-2026-000013');assert.equal(doc.version,1);assert.equal(doc.partnerOrgId,1858);assert.equal(doc.createdByEmployeeId,50);
  assert.equal(source.costs.length,4);
  assert.deepEqual(source.costs.map(c=>String(c.amount)),['800000','900000','600000','200000']);
  for(const cost of source.costs){assert.equal(cost.transactionCodeId,216);assert.equal(cost.currency,'VND');assert.equal(cost.partnerOrgId,1858);assert.equal(cost.outsourcedWorkRecordId,null);}
  const entry=await tx.bankLedgerEntry.findUnique({where:{id:entryId},include:{allocations:true,settlementLines:true,bankFeeLinks:true}});
  assert.equal(entry.orgId,1);assert.equal(entry.voidedAt,null);assert.equal(entry.counterpartyOrgId,1858);assert.equal(entry.amount.toString(),'2500000');assert.equal(entry.direction,'OUT');assert.equal(entry.transactionDate,'2026-11-10');assert.equal(entry.accountingCodeId,216);
  assert.equal(entry.bankFee.toString(),'0');assert.equal(entry.writeOffAmount.toString(),'0');assert.equal(entry.settlementLines.length,0);assert.equal(entry.bankFeeLinks.length,0);assert.equal(entry.allocations.length,4);
  for(const a of entry.allocations){const cost=source.costs.find(c=>c.id===a.expenseItemId);assert.ok(cost);assert.equal(a.requestVersion,1);assert.equal(String(a.amount),String(cost.amount));}
  assert.equal(await tx.bankLedgerEvidenceAllocation.count({where:{orgId:1,expenseItemId:{in:source.costs.map(c=>c.id)},entry:{voidedAt:null}}}),4);
  assert.equal(await tx.changeApprovalRequest.count({where:{orgId:1,status:'PENDING',OR:[{expenseRequestId:31},{ledgerEntryId:entryId}]}}),0);
  const audit=await tx.expenseRequestAudit.findFirst({where:{orgId:1,requestId:31,version:1},orderBy:{id:'desc'}}),policy=audit?.afterSnapshot?.approvalPolicy;
  assert.equal(policy?.exempt,true);assert.equal(policy.drafterId,50);assert.equal((await approvalState(tx,1,31)).approved,true);
  const codes=await tx.transactionCode.findMany({where:{ownerOrgId:1,code:'LHFE',isActive:true},include:{base:true,taxTreatment:true}});assert.equal(codes.length,1);const code=codes[0];assert.equal(code.taxTreatment.suffix,'E');assert.equal(code.vatEnabled,false);
  const partner=await tx.organization.findUnique({where:{id:1858},select:{id:true,name:true}});assert.equal(partner.name,'NGUYEN TRAN DAT');
  const before={source:json(source),entry:json(entry),audit:json(audit)};
  const plan={requestId:31,entryId,sourceRevision:expenseEditorRevision(source),beforeHash:digest(before),targetCodeId:code.id,targetCode:code.code,partner};const current=digest(plan);
  if(!apply&&!verify)return {readOnly:true,revision:current,...plan};
  assert.equal(revision,current,'Plan changed: inspect again');
  const balance=()=>tx.bankLedgerEntry.groupBy({by:['direction'],where:{orgId:1,accountId:entry.accountId,voidedAt:null},_sum:{amount:true},orderBy:{direction:'asc'}});
  const balanceBefore=await balance();
  // Only these entry approval gates are suspended under table locks, inside the
  // owner-authorized repair transaction. Evidence, amount and audit guards stay on.
  const suspended=[['ExpenseRequest','Expense_change_approval_guard'],['BankLedgerEntry','Ledger_change_approval_guard'],['BankLedgerEntry','Ledger_registration_approval_guard']];
  for(const [table,trigger]of suspended)await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
  await tx.bankLedgerEntry.update({where:{id:entryId},data:{voidedAt:new Date(),voidedBy:actor.email,voidReason:reason}});
  const form=expenseEditorForm(await loadExpenseEditorSource(tx,1,'request','31'));
  const body={...form,clientKey:'baro-landlord-lhfe-31',items:form.items.map(item=>({...item,transactionCodeId:code.id}))};
  await saveExpenseEditor(tx,1,actor.id,'request','31',body,undefined,{ids:[],policy:{...policy,ownerAuthorizedCorrection:{receiptKey:key,reason}}});
  const after=await loadExpenseEditorSource(tx,1,'request','31');assert.equal(after.document.version,2);assert.equal(after.document.createdByEmployeeId,50);
  assert.equal(after.costs.length,4);
  for(const [index,cost]of after.costs.entries()){
   const old=source.costs[index];assert.equal(cost.id,old.id);assert.equal(cost.transactionCodeId,code.id);
   for(const field of ['amount','subtotal','vatRate','vatAmount','unitPrice','quantity','currency','partnerOrgId','unitId','createdByEmployeeId'])assert.equal(String(cost[field]),String(old[field]),'Changed '+field);
   assert.equal(digest(cost.details),digest(old.details));
  }
  assert.equal((await approvalState(tx,1,31)).approved,true);
  const replacement=await postLedgerEntryInTransaction(tx,1,actor.email,entry.accountId,{clientKey:'0ee96b6f-d986-4cec-b6c9-d523cffc27e6',transactionDate:entry.transactionDate,direction:'OUT',amount:'2500000',purpose:code.nameEn,accountingCodeId:code.id,counterparty:{kind:'PARTNER',id:1858},evidenceType:'EXPENSE',expenseItems:after.costs.map(cost=>({itemId:cost.id,amount:String(cost.amount)}))},{fee:'0',writeOff:'0',revisesEntryId:entryId});
  assert.equal(replacement.counterpartyName,partner.name);assert.equal(replacement.accountingCodeId,code.id);
  const archived=await tx.bankLedgerEntry.findUnique({where:{id:entryId},include:{allocations:true,settlementLines:true,bankFeeLinks:true}});
  for(const field of Object.keys(entry).filter(f=>!['voidedAt','voidedBy','voidReason'].includes(f)))assert.equal(digest(archived[field]),digest(entry[field]),'Original payment changed: '+field);
  assert.equal(digest(await tx.expenseRequestAudit.findUnique({where:{id:audit.id}})),digest(audit));
  assert.equal(digest(await balance()),digest(balanceBefore),'Cash flow changed');
  await tx.systemSetting.create({data:{key,updatedByEmployeeId:actor.id,value:{kind:'OWNER_AUTHORIZED_MAINTENANCE',reason,revision:current,before,after:json(after),replacementEntryId:replacement.id,recordedAt:new Date().toISOString()}}});
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  for(const [table,trigger]of suspended)await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
  const result={requestId:31,managementNumber:doc.managementNumber,version:2,itemCount:4,total:'2500000',code:'LHFE',payee:replacement.counterpartyName,originalEntryId:entryId,replacementEntryId:replacement.id,receiptKey:key};
  if(verify)throw Object.assign(Error('VERIFY_ROLLBACK'),{result});
  return {applied:true,...result};
 },{isolationLevel:'Serializable',timeout:180000,maxWait:10000});
}
async function inspect(db){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const org=await tx.organization.findFirst({where:{id:1,code:'BARO'},select:{id:true,code:true}});assert.ok(org);
  const entries=await tx.bankLedgerEntry.findMany({where:{orgId:1,transactionDate:'2026-11-10',direction:'OUT',amount:'2500000',voidedAt:null},include:{allocations:true}});
  const costs=await tx.partnerTransactionCost.findMany({where:{orgId:1,id:{in:entries.flatMap(row=>row.allocations.map(a=>a.expenseItemId).filter(Boolean))}},include:{transactionCode:true,expenseRequest:true}});
  const codes=await tx.transactionCode.findMany({where:{ownerOrgId:1,code:{in:['TRKE','LHFE']}},include:{base:true,taxTreatment:true}});
  const audit=await tx.expenseRequestAudit.findFirst({where:{orgId:1,requestId:31,version:1},orderBy:{id:'desc'}});
  const partner=await tx.organization.findUnique({where:{id:1858},select:{id:true,name:true}});
  const actor=await tx.employee.findFirst({where:{id:1,orgId:1,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true,name:true}});
  return {entries,costs,codes,policy:audit?.afterSnapshot?.approvalPolicy,partner,actor};
 },{timeout:60000});
}
module.exports={inspect,run};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;assert.ok(url);assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const missing=await missingSchema(db);assert.equal(missing.length,0,'Required schema is missing');
 const args=process.argv.slice(2),revision=args.find(a=>a.startsWith('--revision='))?.slice(11);
 console.log(JSON.stringify(await run(db,{apply:args.includes('--apply'),verify:args.includes('--verify'),revision}),null,2));
 }catch(e){if(e.message==='VERIFY_ROLLBACK')console.log(JSON.stringify({verifiedWithRollback:true,...e.result},null,2));else{console.error('Landlord correction stopped: '+(e.meta?.message||e.code||e.message));process.exitCode=1;}}finally{await db?.$disconnect();}});}
