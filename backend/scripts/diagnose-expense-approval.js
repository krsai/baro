// Default read-only. --prepare-schema uses the common migration runner;
// --verify executes approval and deferred checks, then always rolls back.
// Credentials arrive through stdin, never argv/logs.
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../src/config/databaseTargetGuard');
const {missingSchema}=require('./railway-schema-preflight');
const {loadExpenseEditorSource,expenseEditorRevision}=require('../dist/services/expenseRequestEditor');
const {assertPaidExpenseCorrection,paidExpenseEntries}=require('../dist/services/paidExpenseCorrection');
const {decideChangeApproval}=require('../dist/services/changeApprovals');
const {migrations,runEntityProfileMigrations}=require('./migrate-entity-profiles');
async function verifyWithRollback(db,requestId,orgId=1,actorId=1){
 let result;
 try{await db.$transaction(async tx=>{
  const row=await tx.changeApprovalRequest.findFirst({where:{id:requestId,orgId,status:'PENDING',menu:'EXPENSE',operation:'UPDATE'}});assert.ok(row,'Pending expense change not found');
  const before=await loadExpenseEditorSource(tx,orgId,row.sourceKind,row.sourceId);
  const balances=()=>tx.bankLedgerEntry.groupBy({by:['accountId','direction'],where:{orgId,voidedAt:null},_sum:{amount:true},orderBy:[{accountId:'asc'},{direction:'asc'}]});
  const moneyBefore=JSON.stringify(await balances());
  const changed=await decideChangeApproval({$transaction:async fn=>fn(tx)},orgId,actorId,requestId,{decision:'APPROVED'});
  const after=await loadExpenseEditorSource(tx,orgId,row.sourceKind,row.sourceId);
  assert.equal(after.document.version,before.document.version+1);assert.equal(JSON.stringify(await balances()),moneyBefore,'Company cash flow changed');
  for(const cost of after.costs){const old=before.costs.find(c=>c.id===cost.id);assert.ok(old);for(const key of ['amount','quantity','unitPrice','vatRate','vatAmount','currency','partnerOrgId'])assert.equal(String(cost[key]),String(old[key]));}
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  result={verifiedWithRollback:true,requestId,sourceId:row.sourceId,versionBefore:before.document.version,versionAfter:after.document.version,codeIds:after.costs.map(c=>c.transactionCodeId),replacementCount:changed.result?.entryIds?.length||0};
  throw Error('VERIFY_ROLLBACK');
 },{isolationLevel:'Serializable',timeout:240000,maxWait:10000});}catch(e){if(e.message!=='VERIFY_ROLLBACK')throw e;}
 assert.equal((await db.changeApprovalRequest.findUnique({where:{id:requestId}})).status,'PENDING','Verification must not persist approval');
 return result;
}
async function diagnose(db,orgId=1){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const requests=await tx.changeApprovalRequest.findMany({where:{orgId,menu:'EXPENSE',operation:'UPDATE',status:'PENDING'},orderBy:{createdAt:'desc'},take:10});
  const results=[];
  for(const request of requests){
   const source=await loadExpenseEditorSource(tx,orgId,request.sourceKind,request.sourceId);
   const current=expenseEditorRevision(source);
   let correctionEligible=true,blockedReason=null,paymentCount=0;try{assertPaidExpenseCorrection(source,request.payload);paymentCount=(await paidExpenseEntries(tx,orgId,source)).length;}catch(error){correctionEligible=false;blockedReason=error.message;}
   results.push({requestId:request.id,sourceId:request.sourceId,createdAt:request.createdAt,reason:request.reason,status:request.status,requestedByEmployeeId:request.requestedByEmployeeId,stages:request.policy?.resolvedStages,sourceVersion:request.sourceVersion,currentVersion:source.document?.version,revisionMatches:request.revision===current,payloadRevisionMatches:request.payload?.revision===current,bankReconciled:source.document?.bankReconciled,correctionEligible,blockedReason,paymentCount,items:source.costs.map(c=>({id:c.id,codeId:c.transactionCodeId,amount:String(c.amount)})),proposed:request.payload?.items?.map(c=>({id:c.itemId,codeId:c.transactionCodeId}))});
  }
  return results;
 },{timeout:60000});
}
module.exports={diagnose,verifyWithRollback};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',async()=>{let db;try{
 const url=JSON.parse(input).DATABASE_PUBLIC_URL;assert.ok(url);assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const args=process.argv.slice(2);
 if(args.includes('--prepare-schema')){
  const applied=await db.$queryRawUnsafe('SELECT version,checksum FROM "EntitySchemaMigration"');
  const pending=migrations().filter(m=>!applied.some(row=>row.version===m.version));assert.ok(pending.every(m=>m.version==='20261117060000_paid_expense_correction'),'Unrelated migrations require separate deployment');
  await runEntityProfileMigrations({env:{...process.env,DATABASE_URL:url,DIRECT_URL:url},db});
 }
 assert.equal((await missingSchema(db)).length,0,'Required schema is missing');
 const verify=args.find(a=>a.startsWith('--verify='))?.slice(9);
 console.log(JSON.stringify(verify?await verifyWithRollback(db,verify):await diagnose(db),null,2));
 }catch(e){console.error('Approval diagnosis stopped: '+(e.code||e.message));process.exitCode=1;}finally{await db?.$disconnect();}});}
