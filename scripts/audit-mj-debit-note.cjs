// Explicitly scoped, read-only audit. Railway variables arrive only through stdin.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;if(!url)throw Error('BUSINESS_DATABASE_UNAVAILABLE');assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const org=await tx.organization.findFirst({where:{code:'BARO',ownerOrgId:null},select:{id:true,name:true,code:true}});if(!org)throw Error('BARO_NOT_FOUND');
  const partner=await tx.organization.findFirst({where:{ownerOrgId:org.id,code:'MJLG'},select:{id:true,name:true,code:true,type:true}});if(!partner)throw Error('MJ_NOT_FOUND');
  const documents=await tx.expenseRequest.findMany({where:{orgId:org.id,partnerOrgId:partner.id,managementNumber:'EXP-2026-000001'},include:{items:{orderBy:{expenseRequestLine:'asc'}},approvalSteps:true}});
  const entry=await tx.bankLedgerEntry.findFirst({where:{id:'c690df87-bd79-4ee8-9784-f46e032c93de',orgId:org.id},include:{allocations:true}});
  const classification=await tx.partnerClassification.findUnique({where:{orgId_entityId:{orgId:org.id,entityId:partner.id}},include:{industries:{include:{industry:true}}}});
  const codes=await tx.transactionCode.findMany({where:{ownerOrgId:org.id},include:{base:true,taxTreatment:true}});
  const latestAudit=documents.length?await tx.expenseRequestAudit.findFirst({where:{orgId:org.id,requestId:documents[0].id,version:documents[0].version},orderBy:{id:'desc'}}):null;
  const units=await tx.expenseUnit.findMany();
  const policies=await tx.expenseCodeLinkPolicy.findMany({where:{orgId:org.id,baseId:{in:codes.filter(c=>['DOF','DOC','CFS','THC','CIC','LSS'].includes(c.base?.code)).map(c=>c.baseId)}}});
  const admins=await tx.employee.findMany({where:{orgId:org.id,orgRole:'ADMIN',status:'ACTIVE'},select:{id:true,name:true,gradeId:true}});
  const triggers=await tx.$queryRawUnsafe(`SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('"ExpenseRequest"'::regclass,'"PartnerTransactionCost"'::regclass,'"BankLedgerEvidenceAllocation"'::regclass) ORDER BY tgname`);
  const replacement=await tx.bankLedgerEntry.findFirst({where:{orgId:org.id,revisesEntryId:entry.id},include:{allocations:true}});
  const guardStates=await tx.$queryRawUnsafe(`SELECT tgname,tgenabled FROM pg_trigger WHERE tgname IN ('Expense_change_approval_guard','Ledger_change_approval_guard','Ledger_registration_approval_guard')`);
  if(process.argv.includes('--summary')){const doc=documents[0];return {org:org.code,partner:partner.name,industries:classification.industries.map(row=>row.industry.nameEn),request:doc.managementNumber,version:doc.version,drafterId:doc.createdByEmployeeId,updatedById:doc.updatedByEmployeeId,remark:doc.remark,items:doc.items.map(item=>({code:codes.find(code=>code.id===item.transactionCodeId)?.code,quantity:item.quantity,subtotal:item.subtotal,vat:item.vatAmount,total:item.amount})),totals:doc.items.reduce((sum,item)=>({subtotal:sum.subtotal+Number(item.subtotal),vat:sum.vat+Number(item.vatAmount),total:sum.total+Number(item.amount)}),{subtotal:0,vat:0,total:0}),originalPaymentVoided:!!entry.voidedAt,originalAllocationAmount:entry.allocations[0].amount,replacement:replacement&&{id:replacement.id,amount:replacement.amount,date:replacement.transactionDate,party:replacement.counterpartyOrgId,allocationCount:replacement.allocations.length,allocated:replacement.allocations.reduce((sum,a)=>sum+Number(a.amount),0)},guards:guardStates,retiredLogCodes:codes.filter(c=>c.base?.code==='LOG').map(c=>({code:c.code,isActive:c.isActive}))};}
  return {org,partner,classification,documents,entry,units,policies,approvalPolicy:latestAudit?.afterSnapshot?.approvalPolicy,codes:codes.filter(c=>['DOF','DOC','CFS','THC','CIC','LSS','LOG'].includes(c.base?.code)&&c.taxTreatment?.code==='VAT').map(c=>({id:c.id,code:c.code,baseId:c.baseId,baseCode:c.base?.code,name:c.base?.nameEn,sourceTypeId:c.base?.serviceTypeId,localTypeId:c.serviceTypeId,isActive:c.isActive,tax:c.taxTreatment?.code})),admins,triggers:triggers.map(t=>t.tgname)};
 },{timeout:30000});console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Scoped MJ audit failed: '+(error.code||error.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[connection suppressed]')));process.exitCode=1;}finally{await db?.$disconnect();}});
