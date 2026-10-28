const triggerSql=`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='"Invoice"'::regclass AND NOT tgisinternal ORDER BY tgname`;
const receiptKey='MAINTENANCE:LEGACY_INVOICE_NUMBERS:2026-10-28:v1';
const tracked=['Organization','Invoice','InvoiceDraft','InvoiceOrder','InvoiceLine','InvoicePayment','InvoicePaymentAllocation','InvoiceCredit','InvoiceFinalLockEvent','WorkOrder','WorkOrderItem','ExpenseRequest','ExpenseRequestAudit','ExpenseRequestApprovalStep','ExpenseApprovalDecision','PartnerTransactionCost','OutsourcedWorkRecord','WorkRecord','Attendance','BankLedgerAccount','BankLedgerEntry','BankLedgerEvidenceAllocation'];
const json=value=>JSON.parse(JSON.stringify(value));
async function fingerprints(tx){
 const present=await tx.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
 const names=new Set(present.map(row=>row.tablename)),result=[];
 for(const table of tracked.filter(name=>names.has(name))){
  const content=table==='Invoice'?`(to_jsonb(t)-'invoiceNumber'-'snapshot')||jsonb_build_object('snapshot',t.snapshot #- '{fields,number}')`:'to_jsonb(t)';
  const [row]=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg((${content})::text,'' ORDER BY to_jsonb(t)->>'id'),'')) AS digest FROM "${table}" t`);
  result.push({table,...row});
 }
 return result;
}
exports.inspect=async db=>db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const invoices=await tx.invoice.findMany({orderBy:[{issuedAt:'asc'},{id:'asc'}],select:{id:true,sellerOrgId:true,invoiceNumber:true,status:true,issuedAt:true,snapshot:true,revisionOfInvoiceId:true}});
 return {action:'inspect-invoice-numbers',invoices:invoices.map(({snapshot,...row})=>({...row,date:snapshot?.fields?.date,snapshotNumber:snapshot?.fields?.number})),triggers:await tx.$queryRawUnsafe(triggerSql)};
},{isolationLevel:'RepeatableRead',timeout:30000});

exports.renumber=async function({db,targets,apply}){
 if(!Array.isArray(targets)||!targets.length||targets.length>100||new Set(targets.map(row=>row.id)).size!==targets.length||targets.some(row=>typeof row.id!=='string'||!Number.isSafeInteger(row.sellerOrgId)||row.sellerOrgId<=0||typeof row.previousNumber!=='string'))throw Error('INVALID_INVOICE_TARGETS');
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='60s'");
  for(const orgId of [...new Set(targets.map(row=>row.sellerOrgId))].sort((a,b)=>a-b))await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock($1::integer,$2::integer)::text',orgId,202610281);
  await tx.$executeRawUnsafe('LOCK TABLE "Invoice" IN SHARE ROW EXCLUSIVE MODE');
  const existing=await tx.systemSetting.findUnique({where:{key:receiptKey}});
  if(existing){
   if(JSON.stringify(existing.value.targets)!==JSON.stringify(targets))throw Error('INVOICE_RECEIPT_TARGET_MISMATCH');
   for(const item of existing.value.changes){
    const actual=await tx.invoice.findUnique({where:{id:item.id}});
    if(actual?.invoiceNumber!==item.number||actual?.snapshot?.fields?.number!==item.number)throw Error('INVOICE_RECEIPT_STATE_MISMATCH');
   }
   return {action:'invoice-numbers-already-applied',changes:existing.value.changes.map(({id,number})=>({id,number})),receiptKey};
  }
  const before=await fingerprints(tx),triggers=await tx.$queryRawUnsafe(triggerSql),changes=[],counters=[];
  const {allocateDocumentNumber}=require('../../backend/dist/services/documentNumber');
  for(const target of targets){
   const original=await tx.invoice.findUnique({where:{id:target.id}});
   if(!original||original.sellerOrgId!==target.sellerOrgId||original.invoiceNumber!==target.previousNumber||original.status!=='ISSUED'||original.revisionOfInvoiceId!==null)throw Error('INVOICE_TARGET_CHANGED');
   const snapshot=original.snapshot,date=snapshot?.fields?.date;
   if(snapshot?.fields?.number!==original.invoiceNumber||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||/^INV-\d{4}-\d+$/i.test(original.invoiceNumber))throw Error('INVOICE_NOT_LEGACY');
   const counterKey=`DOCUMENT_NUMBER:${original.sellerOrgId}:INV:${date.slice(0,4)}`;
   const counterBefore=await tx.systemSetting.findUnique({where:{key:counterKey}});
   const number=await allocateDocumentNumber(tx,original.sellerOrgId,'INV',date,'');
   await tx.invoice.update({where:{id:original.id},data:{invoiceNumber:number,snapshot:{...snapshot,fields:{...snapshot.fields,number}}}});
   const actual=await tx.invoice.findUnique({where:{id:original.id}});
   if(actual.invoiceNumber!==number||actual.snapshot.fields.number!==number)throw Error('INVOICE_NUMBER_VERIFY_FAILED');
   changes.push({id:original.id,sellerOrgId:original.sellerOrgId,previousNumber:original.invoiceNumber,number,original:json(original)});
   counters.push({key:counterKey,before:json(counterBefore),after:json(await tx.systemSetting.findUnique({where:{key:counterKey}}))});
  }
  const after=await fingerprints(tx);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('INVOICE_BUSINESS_DATA_CHANGED');
  if(JSON.stringify(triggers)!==JSON.stringify(await tx.$queryRawUnsafe(triggerSql)))throw Error('INVOICE_TRIGGER_STATE_CHANGED');
  await tx.systemSetting.create({data:{key:receiptKey,value:json({at:new Date().toISOString(),reason:'User explicitly requested existing issued invoice numbers be updated to the automatic management-number format. Only invoiceNumber and snapshot.fields.number change; preserve the full original issued document here.',targets,changes,counters,before,after,triggers}),updatedBy:'authorized-invoice-number-maintenance:2026-10-28'}});
  const result={action:apply?'invoice-numbers-applied':'invoice-numbers-rollback-verified',changes:changes.map(({id,number})=>({id,number})),preservedTables:before.length,triggerStatesPreserved:true,receiptKey};
  if(!apply){const error=Error('ROLLBACK_VERIFIED');error.result=result;throw error;}
  return result;
 },{isolationLevel:'Serializable',timeout:90000}).catch(error=>{if(error.result)return error.result;throw error;});
};
