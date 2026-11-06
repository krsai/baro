// User-authorized, single-document maintenance. Default is read-only.
// --verify executes every write and constraint check, then rolls the transaction back.
// --apply requires an exact read-only plan revision. Credentials arrive only via stdin.
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {loadExpenseEditorSource,expenseEditorRevision,saveExpenseEditor}=require('../dist/services/expenseRequestEditor');
const {postLedgerEntryInTransaction}=require('../dist/services/bankLedger');
const {approvalState}=require('../dist/services/bankEvidence');
const key='MJ_DEBIT_NOTE_CORRECTION:BARO:EXP-2026-000001:HANSIS26110018';
const entryId='c690df87-bd79-4ee8-9784-f46e032c93de';
const file='C:/Users/krsai/Downloads/031126-001-Debit note.pdf';
const definitions=[['DOF','BL','1','1039600',1039600,83168],['DOC','BL','1','649750',649750,51980],['CFS','RTON','2.2','389850',857670,68614],['THC','RTON','2.2','129950',285890,22871],['CIC','RTON','2.2','129950',285890,22871],['LSS','RTON','2.2','77970',171534,13723]];
const json=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(JSON.stringify(json(value))).digest('hex');
const reason='Owner-authorized itemization of MJ debit note HANSIS26110018; unchanged payment total; logistics charges paid to obtain DO, not DO fee alone.';
async function run(db,{apply=false,verify=false,revision}={}){
 const pdfHash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 assert.equal(pdfHash,'99cfaa6531d59b0d4a2d5440319d9674efa87c441cfe2c7be535690ea1bd5342','PDF changed');
 return db.$transaction(async tx=>{
  if(!apply&&!verify)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  else{
   await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261106,19)');
   // DDL is transaction-local; these locks prevent concurrent writes while the
   // three approval-entry gates are suspended for the explicitly authorized repair.
   await tx.$executeRawUnsafe('LOCK TABLE "ExpenseRequest","PartnerTransactionCost","BankLedgerEntry","BankLedgerEvidenceAllocation" IN SHARE ROW EXCLUSIVE MODE');
  }
  const previous=await tx.systemSetting.findUnique({where:{key}});if(previous)return {alreadyApplied:true,receiptKey:key,replacementEntryId:previous.value.replacementEntryId};
  const org=await tx.organization.findFirst({where:{id:1,code:'BARO',ownerOrgId:null}});assert.ok(org);
  const actor=await tx.employee.findFirst({where:{id:1,orgId:1,orgRole:'ADMIN',status:'ACTIVE'}});assert.ok(actor?.email);
  const source=await loadExpenseEditorSource(tx,1,'request','19'),doc=source.document;
  assert.equal(doc.managementNumber,'EXP-2026-000001');assert.equal(doc.partnerOrgId,1847);assert.equal(doc.createdByEmployeeId,50);assert.equal(doc.version,1);assert.equal(doc.remark,'DO FEE');assert.equal(source.costs.length,1);
  assert.equal(source.costs[0].id,'a6db1624-4576-418c-9ef5-7743cc581194');assert.equal(source.costs[0].amount.toString(),'3553561');assert.equal(source.costs[0].transactionCodeId,208);
  const entry=await tx.bankLedgerEntry.findUnique({where:{id:entryId},include:{allocations:true}});assert.equal(entry?.orgId,1);assert.equal(entry.counterpartyOrgId,1847);assert.equal(entry.voidedAt,null);assert.equal(entry.amount.toString(),'3553561');assert.equal(entry.direction,'OUT');assert.equal(entry.transactionDate,'2026-11-03');assert.equal(entry.allocations.length,1);assert.equal(entry.allocations[0].expenseItemId,source.costs[0].id);
  assert.equal(await tx.bankLedgerEvidenceAllocation.count({where:{orgId:1,expenseItemId:source.costs[0].id,entry:{voidedAt:null}}}),1);
  assert.equal(await tx.changeApprovalRequest.count({where:{orgId:1,status:'PENDING',OR:[{expenseRequestId:19},{ledgerEntryId:entryId}]}}),0);
  const audit=await tx.expenseRequestAudit.findFirst({where:{orgId:1,requestId:19,version:1},orderBy:{id:'desc'}}),policy=audit?.afterSnapshot?.approvalPolicy;
  assert.equal(policy?.exempt,true);assert.equal(policy.drafterId,50);assert.equal((await approvalState(tx,1,19)).approved,true);
  const codes=await tx.transactionCode.findMany({where:{ownerOrgId:1,isActive:true,base:{code:{in:definitions.map(row=>row[0])}},taxTreatment:{code:'VAT'}},include:{base:true}});
  const rows=definitions.map(([base,unit,quantity,unitPrice,subtotal,vat])=>{const found=codes.filter(c=>c.base.code===base);assert.equal(found.length,1,'Unique active VAT code required: '+base);return {codeId:found[0].id,code:found[0].code,unit,quantity,unitPrice,subtotal,vat,total:subtotal+vat};});
  assert.equal(rows.reduce((sum,row)=>sum+row.total,0),3553561);
  const balanceBefore=await tx.bankLedgerEntry.groupBy({by:['direction'],where:{orgId:1,accountId:entry.accountId,voidedAt:null},_sum:{amount:true},orderBy:{direction:'asc'}});
  const before={source:json(source),entry:json(entry),audit:json(audit)};
  const plan={pdfHash,requestId:19,managementNumber:doc.managementNumber,entryId,total:3553561,rows,sourceRevision:expenseEditorRevision(source),originalAuditHash:digest(audit),originalEntryHash:digest(entry)};
  const current=digest(plan);
  if(!apply&&!verify)return {readOnly:true,revision:current,...plan};
  assert.equal(revision,current,'Read-only plan changed; re-audit before applying');
  const suspended=[['ExpenseRequest','Expense_change_approval_guard'],['BankLedgerEntry','Ledger_change_approval_guard'],['BankLedgerEntry','Ledger_registration_approval_guard']];
  for(const [table,trigger]of suspended)await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
  await tx.bankLedgerEntry.update({where:{id:entryId},data:{voidedAt:new Date(),voidedBy:actor.email,voidReason:reason}});
  const units={};
  for(const [code,names]of Object.entries({BL:{nameKo:'선하증권',nameEn:'B/L',nameVi:'Vận đơn'},RTON:{nameKo:'운임톤',nameEn:'R/TON',nameVi:'Tấn tính cước'}}))units[code]=await tx.expenseUnit.upsert({where:{code},create:{code,...names,sortOrder:code==='BL'?80:90},update:{}});
  const body={clientKey:'mj-correction-hansis26110018',revision:expenseEditorRevision(await loadExpenseEditorSource(tx,1,'request','19')),version:1,partnerOrgId:1847,requestDate:doc.requestDate,remark:'Thanh toán các chi phí logistics cho MJ để nhận D/O theo Debit Note HANSIS26110018 (DO, DOC, CFS, THC, CIC, LSS).',items:rows.map((row,index)=>({...index===0?{itemId:source.costs[0].id}:{},transactionCodeId:row.codeId,currency:'VND',quantity:row.quantity,unitPrice:row.unitPrice,vatRate:'8',unitId:units[row.unit].id,details:{...source.costs[0].details,reference:'HANSIS26110018',evidenceFile:'031126-001-Debit note.pdf'}}))};
  console.error('[MJ] Validating six expense lines.');
  await saveExpenseEditor(tx,1,actor.id,'request','19',body,undefined,{ids:[],policy:{...policy,ownerAuthorizedCorrection:{receiptKey:key,pdfHash,reason}}});
  const after=await loadExpenseEditorSource(tx,1,'request','19');assert.equal(after.document.version,2);assert.equal(after.document.createdByEmployeeId,50);assert.equal(after.costs.length,6);
  for(const [index,row]of rows.entries()){const cost=after.costs[index];assert.equal(cost.transactionCodeId,row.codeId);assert.equal(Number(cost.subtotal),row.subtotal);assert.equal(Number(cost.vatAmount),row.vat);assert.equal(Number(cost.amount),row.total);}
  assert.equal((await approvalState(tx,1,19)).approved,true);
  console.error('[MJ] Validating replacement payment and six allocations.');
  const replacement=await postLedgerEntryInTransaction(tx,1,actor.email,entry.accountId,{clientKey:'53c85e69-e7d1-46ce-a9e9-3af383047b15',transactionDate:entry.transactionDate,direction:'OUT',amount:'3553561',purpose:body.remark,remark:body.remark,accountingCodeId:null,counterparty:{kind:'PARTNER',id:1847},evidenceType:'EXPENSE',expenseItems:after.costs.map(cost=>({itemId:cost.id,amount:cost.amount.toString()}))},{fee:'0',writeOff:'0',revisesEntryId:entryId});
  const archived=await tx.bankLedgerEntry.findUnique({where:{id:entryId},include:{allocations:true}});
  for(const field of Object.keys(entry).filter(field=>!['voidedAt','voidedBy','voidReason'].includes(field)))assert.equal(digest(archived[field]),digest(entry[field]),'Original payment field changed: '+field);
  assert.equal(digest(await tx.expenseRequestAudit.findUnique({where:{id:audit.id}})),digest(audit));
  console.error('[MJ] Checking unchanged balances, history and deferred constraints.');
  const balanceAfter=await tx.bankLedgerEntry.groupBy({by:['direction'],where:{orgId:1,accountId:entry.accountId,voidedAt:null},_sum:{amount:true},orderBy:{direction:'asc'}});assert.equal(digest(balanceAfter),digest(balanceBefore),'Account cash flow changed');
  const logCodes=await tx.transactionCode.findMany({where:{ownerOrgId:1,base:{code:'LOG'}},select:{id:true,isActive:true,isOverridden:true}});
  await tx.transactionCode.updateMany({where:{ownerOrgId:1,id:{in:logCodes.map(c=>c.id)}},data:{isActive:false,isOverridden:true}});
  const receipt={kind:'OWNER_AUTHORIZED_MAINTENANCE',reason,pdfHash,revision:current,before,after:json(after),replacementEntryId:replacement.id,retiredLocalLogCodes:logCodes,actorId:actor.id,recordedAt:new Date().toISOString()};
  await tx.systemSetting.create({data:{key,value:receipt,updatedByEmployeeId:actor.id}});
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  for(const [table,trigger]of suspended)await tx.$executeRawUnsafe(`ALTER TABLE \"${table}\" ENABLE TRIGGER \"${trigger}\"`);
  const result={requestId:19,version:2,itemCount:6,total:3553561,originalEntryId:entryId,replacementEntryId:replacement.id,receiptKey:key};
  if(verify)throw Object.assign(Error('VERIFY_ROLLBACK'),{result});
  return {applied:true,...result};
 },{isolationLevel:'Serializable',timeout:180000,maxWait:10000});
}
module.exports={run,definitions};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;if(!url)throw Error('BUSINESS_DATABASE_UNAVAILABLE');assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const args=process.argv.slice(2),revision=args.find(arg=>arg.startsWith('--revision='))?.split('=')[1];console.log(JSON.stringify(await run(db,{apply:args.includes('--apply'),verify:args.includes('--verify'),revision}),null,2));
 }catch(error){if(error.message==='VERIFY_ROLLBACK')console.log(JSON.stringify({verifiedWithRollback:true,...error.result},null,2));else{console.error('MJ correction stopped: '+(error.meta?.message||error.code||error.message));process.exitCode=1;}}finally{await db?.$disconnect();}});}
