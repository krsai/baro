// Credentials arrive through stdin only. All database work is read-only.
const assert = require('node:assert/strict');
const {PrismaClient, Prisma} = require('@prisma/client');
const {assertSafeApplicationDatabaseEnv} = require('../src/config/databaseTargetGuard');
const {missingSchema} = require('./railway-schema-preflight');
const {searchLedgerEvidence} = require('../dist/services/bankLedger');
const {approvalState} = require('../dist/services/bankEvidence');

async function diagnose(db, {orgId, currencyCode, amount}) {
 assert.ok(Number.isSafeInteger(orgId) && orgId > 0, 'A company ID is required');
 assert.match(currencyCode, /^[A-Z]{3}$/);
 assert.match(String(amount), /^\d+(\.\d{1,4})?$/);
 return db.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const missing = await missingSchema(tx);
  assert.equal(missing.length, 0, 'Required application schema is missing: ' + missing.join(', '));
  const organization = await tx.organization.findUnique({where:{id:orgId},select:{id:true,name:true}});
  assert.ok(organization, 'Company not found');
  const originalNewest30 = await tx.expenseRequest.findMany({where:{orgId,deletedAt:null,items:{some:{currency:currencyCode}}},orderBy:{requestDate:'desc'},take:30,select:{id:true}});
  const requests = await tx.expenseRequest.findMany({where:{orgId,items:{some:{currency:currencyCode}}},select:{id:true,managementNumber:true,version:true,deletedAt:true,requestDate:true,partnerOrgId:true,payeeEmployeeId:true,items:{where:{currency:currencyCode},select:{id:true,expenseRequestLine:true,amount:true,currency:true}}},orderBy:[{requestDate:'desc'},{id:'desc'}]});
  const visible = await searchLedgerEvidence(tx, orgId, {type:'EXPENSE',currencyCode,search:''});
  const active = requests.filter(row => !row.deletedAt);
  const results = [];
  for (const request of requests) {
   if (!request.items.reduce((sum,item) => sum.add(item.amount), new Prisma.Decimal(0)).equals(amount)) continue;
   const approval = await approvalState(tx,orgId,request.id);
   const itemIds = request.items.map(item => item.id);
   const allocations = await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:{in:itemIds},entry:{voidedAt:null}},select:{expenseItemId:true,entryId:true,amount:true}});
   const openings = await tx.accountingOpeningItem.findMany({where:{orgId,voidedAt:null,expenseItemId:{in:itemIds}},select:{id:true,expenseItemId:true,amount:true}});
   const exact = await searchLedgerEvidence(tx,orgId,{type:'EXPENSE',currencyCode,search:approval.managementNumber});
   results.push({requestId:request.id,managementNumber:approval.managementNumber,version:request.version,requestDate:request.requestDate,deleted:Boolean(request.deletedAt),partnerOrgId:request.partnerOrgId,payeeEmployeeId:request.payeeEmployeeId,approvalStatus:approval.status,approvalSteps:approval.steps.map(step=>({position:step.position,employeeId:step.employeeId,approved:step.approved,rejected:step.rejected})),positionAmongActiveSameCurrency:active.findIndex(row=>row.id===request.id)+1,includedInOriginalNewest30:originalNewest30.some(row=>row.id===request.id),visibleInCurrentSearch:visible.documents.some(row=>row.id===request.id),visibleInExactNumberSearch:exact.documents.some(row=>row.id===request.id),items:request.items,activeAllocations:allocations,activeOpenings:openings});
  }
  return {organization,currencyCode,amount,activeRequestCount:active.length,visibleRequestIds:visible.documents.map(row=>row.id),matches:results};
 },{timeout:60000,maxWait:10000});
}
module.exports = {diagnose};
if (require.main === module) {
 let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
 process.stdin.on('end',async()=>{let db;try{
  const {DATABASE_PUBLIC_URL:url,...query}=JSON.parse(input);assert.ok(url,'Database connection is required');
  assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
  assert.ok(new URL(url).hostname.endsWith('.rlwy.net'),'Railway public database is required');
  db=new PrismaClient({datasourceUrl:url});
  console.log(JSON.stringify(await diagnose(db,query),null,2));
 }catch(error){console.error('Evidence diagnosis stopped: '+(error.code||((error.message||'').startsWith('Required application schema')?error.message:'CHECK_FAILED')));process.exitCode=1;}finally{await db?.$disconnect();}});
}
