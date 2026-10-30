import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {resolveEvidence,approveExpense}=require('../backend/dist/services/bankEvidence.js');
const {postLedgerEntry,postLedgerBatch,listLedgerActivity}=require('../backend/dist/services/bankLedger.js');
async function fixture(){
 const db=new PGlite();await db.exec("SET TIME ZONE 'UTC'");
 await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY);INSERT INTO "Organization" VALUES(1),(2);
 CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));INSERT INTO "Employee" VALUES(10,1,'ACTIVE','ADMIN'),(11,1,'ACTIVE','ACCOUNTANT');
 CREATE TABLE "ExpenseRequest"(id INT,"orgId" INT,version INT,UNIQUE(id,"orgId"));INSERT INTO "ExpenseRequest" VALUES(1,1,1);
 CREATE TABLE "ExpenseRequestApprovalStep"(id TEXT,"orgId" INT,"requestId" INT,position INT,"employeeId" INT);INSERT INTO "ExpenseRequestApprovalStep" VALUES('s1',1,1,1,10),('s2',1,1,2,11);
 CREATE TABLE "Invoice"(id TEXT PRIMARY KEY,"sellerOrgId" INT,status TEXT,"currencyCode" TEXT,total NUMERIC,"invoiceNumber" TEXT);INSERT INTO "Invoice" VALUES('i1',1,'ISSUED','USD',10000,'INV-1'),('i2',2,'ISSUED','USD',10000,'INV-2');
 CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"expenseRequestId" INT,"expenseRequestLine" INT,currency TEXT,amount NUMERIC,description TEXT);INSERT INTO "PartnerTransactionCost" VALUES('c1',1,1,1,'USD',100,'Expense');`);
 await db.exec(await readFile('backend/prisma/migrations/20261027160100_bank_ledger/migration.sql','utf8'));
 // Old transactions are preserved without rewriting their evidence.
 await db.exec(`INSERT INTO "BankLedgerAccount"(id,"orgId","clientKey","bankName","accountNumber","accountHolder","currencyCode","openingDate","openingBalance","createdBy") VALUES('a',1,'a','B','001','C','USD','2026-01-01',0,'actor');
 INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy") VALUES('old',1,'a','old','2026-01-01','IN',1,'Legacy','old-ref','actor');`);
 await db.exec(await readFile('backend/prisma/migrations/20261027210000_ledger_evidence/migration.sql','utf8'));
 await db.exec(await readFile('backend/prisma/migrations/20261027210100_ledger_evidence_delete/migration.sql','utf8'));
 await db.exec(await readFile('backend/prisma/migrations/20261027220000_ledger_batch/migration.sql','utf8'));
 await db.exec('ALTER TABLE "ExpenseRequest" ADD COLUMN "createdByEmployeeId" integer; CREATE TABLE "ExpenseRequestAudit" ("requestId" integer,"orgId" integer,version integer,"afterSnapshot" jsonb);');
 await db.exec(await readFile('backend/prisma/migrations/20261028090000_expense_approval_settings/migration.sql','utf8'));
 await db.exec(await readFile('backend/prisma/migrations/20261030150000_ledger_settlement_lines/migration.sql','utf8'));
 return db;
}
const entry=(id,type,amount,fee=0,direction='IN',reference='evidence.pdf')=>`INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy","evidenceType","bankFee") VALUES('${id}',1,'a','${id}','2026-01-02','${direction}',${amount},'Reason','${reference}','actor','${type}',${fee});`;

test('accounting migration preserves legacy purpose and restricts new classifications to active company codes',async()=>{
 const db=await fixture();try{
  await db.exec(`CREATE TABLE "ExpenseType"(id INT PRIMARY KEY,"isActive" BOOL);INSERT INTO "ExpenseType" VALUES(1,true);
   CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY,"expenseTypeId" INT,"isActive" BOOL);INSERT INTO "TransactionCodeBase" VALUES(1,1,true);
   CREATE TABLE "TaxTreatment"(id INT PRIMARY KEY);INSERT INTO "TaxTreatment" VALUES(1);
   CREATE TABLE "TransactionCode"(id INT PRIMARY KEY,"ownerOrgId" INT,"baseId" INT,"taxTreatmentId" INT,"isActive" BOOL);INSERT INTO "TransactionCode" VALUES(7,1,1,1,true),(8,2,1,1,true),(9,1,1,1,false);
   CREATE TABLE "SettingTransactionCodeDefault"("baseId" INT,"taxTreatmentId" INT,"isActive" BOOL,"isEnabled" BOOL);INSERT INTO "SettingTransactionCodeDefault" VALUES(1,1,true,true);`);
  const sql=await readFile('backend/prisma/migrations/20261030220000_ledger_accounting_codes/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('SELECT purpose,"accountingCodeId",amount::text FROM "BankLedgerEntry" WHERE id=\'old\'')).rows,[{purpose:'Legacy',accountingCodeId:null,amount:'1.0000'}]);
  const coded=(id,code)=>entry(id,'FILE',10).replace('"bankFee")','"bankFee","accountingCodeId")').replace("'FILE',0);",`'FILE',0,${code});`);
  await db.exec(coded('valid',7));
  await assert.rejects(db.exec(coded('foreign',8)),/ACCOUNTING_CODE_INVALID|foreign key/);
  await assert.rejects(db.exec(coded('inactive',9)),/ACCOUNTING_CODE_INVALID/);
  await assert.rejects(db.exec('UPDATE "BankLedgerEntry" SET "accountingCodeId"=8 WHERE id=\'valid\''),/immutable|append|UPDATE/i);
  await db.exec('UPDATE "SettingTransactionCodeDefault" SET "isEnabled"=false');
  await assert.rejects(db.exec(coded('disabled',7)),/ACCOUNTING_CODE_INVALID/);
  assert.equal((await db.query('SELECT sum(amount)::text total FROM "BankLedgerEntry"')).rows[0].total,'11.0000');
 }finally{await db.close();}
});
test('SQL accepts accountant exemption only for the exact saved drafter and version',async()=>{
 const db=await fixture();
 const allocation=`INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","expenseItemId","requestVersion",amount) VALUES('exempt-a','exempt',1,'c1',1,50);`;
 try{
   await db.exec('DELETE FROM "ExpenseRequestApprovalStep"; UPDATE "ExpenseRequest" SET "createdByEmployeeId"=11;');
   await rejectTx(db,entry('exempt','EXPENSE',50,0,'OUT')+allocation,/LEDGER_EXPENSE_NOT_APPROVED/);
   await db.exec(`INSERT INTO "ExpenseRequestAudit" VALUES(1,1,1,'{"approvalPolicy":{"drafterId":11,"exempt":true}}');`);
   await db.exec('BEGIN;'+entry('exempt','EXPENSE',50,0,'OUT')+allocation+'COMMIT;');
 }finally{await db.close();}
});
test('administrator final authority completes only the active original company author without bypassing saved approval lines',async()=>{
 const db=await fixture();try{
  await db.exec(await readFile('backend/prisma/migrations/20261030120000_expense_approval_rejection/migration.sql','utf8'));
  const sql=await readFile('backend/prisma/migrations/20261030170000_admin_drafter_final_authority/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`UPDATE "ExpenseRequest" SET "createdByEmployeeId"=10`);
  const exempt=async(org=1,version=1)=>(await db.query(`SELECT baro_expense_approval_exempt(1,$1,$2) AS allowed`,[org,version])).rows[0].allowed;
  assert.equal(await exempt(),false,'saved approvers still have to act');
  await db.exec('DELETE FROM "ExpenseRequestApprovalStep"');assert.equal(await exempt(),true);
  assert.equal(await exempt(2),false);assert.equal(await exempt(1,2),false);
  await db.exec(`UPDATE "Employee" SET status='INACTIVE' WHERE id=10`);assert.equal(await exempt(),false);
  await db.exec(`UPDATE "Employee" SET status='ACTIVE',"orgRole"='ACCOUNTANT' WHERE id=10`);assert.equal(await exempt(),false);
  await db.exec(`UPDATE "Employee" SET "orgRole"='ADMIN' WHERE id=10`);
  await db.exec(`BEGIN;${entry('own-admin','EXPENSE',50,0,'OUT')}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","expenseItemId","requestVersion",amount) VALUES('own-admin-a','own-admin',1,'c1',1,50);COMMIT;`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "ExpenseApprovalDecision"`)).rows[0].n,0,'final authority does not fabricate approval decisions');
 }finally{await db.close();}
});
test('SQL rejects new approval decisions from operators even when a historical step names them',async()=>{
 const db=await fixture();try{
   await db.exec(`UPDATE "Employee" SET "orgRole"='OPERATOR' WHERE id=10;`);
   await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES('operator',1,1,1,1,10,now())`),/INVALID_EXPENSE_APPROVERS/);
 }finally{await db.close();}
});
async function rejectTx(db,sql,pattern){try{await assert.rejects(db.exec(`BEGIN;${sql}COMMIT;`),pattern);}finally{await db.exec('ROLLBACK');}}
test('rejection migration preserves approvals, requires reasons and prevents later decisions or payment until a new version',async()=>{
 const db=await fixture();try{
  await db.exec(`UPDATE "ExpenseRequest" SET "createdByEmployeeId"=99; INSERT INTO "ExpenseApprovalDecision" VALUES('prior',1,1,1,1,10,now());`);
  const sql=await readFile('backend/prisma/migrations/20261030120000_expense_approval_rejection/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query(`SELECT decision,reason FROM "ExpenseApprovalDecision" WHERE id='prior'`)).rows,[{decision:'APPROVED',reason:null}]);
  const decide=(id,position,employee,decision,reason)=>`INSERT INTO "ExpenseApprovalDecision"(id,"orgId","requestId",version,position,"employeeId",decision,reason) VALUES('${id}',1,1,1,${position},${employee},'${decision}',${reason});`;
  for(const reason of ['NULL',"'   '","repeat('x',1001)"])await assert.rejects(db.exec(decide('bad',2,11,'REJECTED',reason)),/ExpenseApprovalDecision_result_check/);
  await db.exec(decide('rejected',2,11,'REJECTED',"'Incorrect invoice'"));
  await assert.rejects(db.exec(decide('later',2,11,'APPROVED','NULL')),/NOT_YOUR_TURN/);
  await assert.rejects(db.exec(`UPDATE "ExpenseApprovalDecision" SET reason='changed' WHERE id='rejected'`),/EVIDENCE_APPEND_ONLY/);
  await assert.rejects(db.exec(`DELETE FROM "ExpenseApprovalDecision" WHERE id='rejected'`),/EVIDENCE_APPEND_ONLY/);
  const allocation=`INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","expenseItemId","requestVersion",amount) VALUES('rejected-a','rejected-pay',1,'c1',1,50);`;
  await rejectTx(db,entry('rejected-pay','EXPENSE',50,0,'OUT')+allocation,/LEDGER_EXPENSE_NOT_APPROVED/);
  await db.exec(`UPDATE "ExpenseRequest" SET version=2 WHERE id=1;`);
  await assert.rejects(db.exec(decide('stale',1,10,'APPROVED','NULL')),/NOT_YOUR_TURN/);
  await db.exec(`INSERT INTO "ExpenseApprovalDecision"(id,"orgId","requestId",version,position,"employeeId") VALUES('new-1',1,1,2,1,10),('new-2',1,1,2,2,11);`);
  await db.exec('BEGIN;'+entry('rejected-pay','EXPENSE',50,0,'OUT')+allocation.replace("'c1',1,50","'c1',2,50")+'COMMIT;');
  assert.equal((await db.query(`SELECT reason FROM "ExpenseApprovalDecision" WHERE id='rejected'`)).rows[0].reason,'Incorrect invoice');
 }finally{await db.close();}
});
test('database keeps old evidence, requires file evidence, and permits reasoned balance adjustments',async()=>{
 const db=await fixture();try{
  assert.deepEqual((await db.query(`SELECT amount::text,"evidenceNumber","evidenceType" FROM "BankLedgerEntry" WHERE id='old'`)).rows,[{amount:'1.0000',evidenceNumber:'old-ref',evidenceType:'FILE'}]);
  await assert.rejects(db.exec(entry('missing','FILE',10,0,'IN','')),/LEDGER_FILE_REQUIRED/);
  await db.exec(`INSERT INTO "PartnerTransactionCost"(id,"orgId",currency,amount) VALUES('unlinked',1,'USD',10);DELETE FROM "PartnerTransactionCost" WHERE id='unlinked';`);assert.equal((await db.query(`SELECT count(*)::int AS n FROM "PartnerTransactionCost" WHERE id='unlinked'`)).rows[0].n,0);
  await db.exec(entry('file','FILE',10));await db.exec(entry('adjust','ADJUSTMENT',5,0,'OUT',''));
  await assert.rejects(db.exec(`UPDATE "BankLedgerEntry" SET amount=999 WHERE id='file'`),/LEDGER_ENTRY_IMMUTABLE/);
 }finally{await db.close();}
});
test('invoice net receipt plus fee can match partially; missing allocations, other company and over-allocation fail',async()=>{
 const db=await fixture();try{
  await db.exec(`BEGIN;${entry('receipt','INVOICE',9980,20)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m1','receipt',1,'i1',10000);COMMIT;`);
  await rejectTx(db,entry('missing','INVOICE',1),/LEDGER_ALLOCATION_MISMATCH/);
  await rejectTx(db,`${entry('foreign','INVOICE',1)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m2','foreign',1,'i2',1);`,/foreign key/);
  await rejectTx(db,`${entry('over','INVOICE',1)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m3','over',1,'i1',1);`,/LEDGER_EXCEEDS_DOCUMENT/);
  await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id='receipt'`);
  await db.exec(`BEGIN;${entry('partial','INVOICE',4980,20)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m4','partial',1,'i1',5000);COMMIT;`);
 }finally{await db.close();}
});
test('expense item requires sequential approvals for current version, checks allocation and locks reconciled content',async()=>{
 const db=await fixture();const allocation=`INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","expenseItemId","requestVersion",amount) VALUES('x','expense',1,'c1',1,50);`;
 try{
  await rejectTx(db,entry('expense','EXPENSE',51,1,'OUT')+allocation,/LEDGER_EXPENSE_NOT_APPROVED/);
  await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES('d2',1,1,1,2,11,now())`),/EXPENSE_APPROVAL_NOT_YOUR_TURN/);
  await db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES('d1',1,1,1,1,10,now()),('d2',1,1,1,2,11,now())`);
  await rejectTx(db,entry('expense','EXPENSE',100,1,'OUT')+allocation,/LEDGER_ALLOCATION_MISMATCH/);
  await db.exec('BEGIN;'+entry('expense','EXPENSE',51,1,'OUT')+allocation+'COMMIT;');
  await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET amount=90 WHERE id='c1'`),/EXPENSE_ALREADY_RECONCILED/);
  await assert.rejects(db.exec(`UPDATE "ExpenseRequest" SET version=2 WHERE id=1`),/EXPENSE_ALREADY_RECONCILED/);
  await assert.rejects(db.exec(`DELETE FROM "ExpenseApprovalDecision"`),/EVIDENCE_APPEND_ONLY/);
  await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id='expense';UPDATE "ExpenseRequest" SET version=2 WHERE id=1;`);
  await rejectTx(db,entry('expense2','EXPENSE',50,0,'OUT')+allocation.replaceAll("'expense'","'expense2'").replace("'x'","'x2'"),/LEDGER_EXPENSE_NOT_APPROVED/);
 }finally{await db.close();}
});
test('service validates invoice scope, actual receipt and fees without forcing full settlement',async()=>{
 const invoices=[{id:'i',sellerOrgId:1,invoiceNumber:'INV-1',status:'ISSUED',currencyCode:'USD',total:'10000'}];
 const tx={$queryRawUnsafe:async()=>[],invoice:{findFirst:async({where})=>invoices.find(i=>Object.entries(where).every(([k,v])=>i[k]===v))},bankLedgerEvidenceAllocation:{findMany:async()=>[]}};
 const body={evidenceType:'INVOICE',direction:'IN',evidenceNumber:'INV-1',amount:'4980',bankFee:'20'};
 const result=await resolveEvidence(tx,1,{currencyCode:'USD'},body);assert.equal(result.allocations[0].amount,'5000.00');
 await assert.rejects(resolveEvidence(tx,2,{currencyCode:'USD'},body),/INVOICE_NOT_FOUND/);
 await assert.rejects(resolveEvidence(tx,1,{currencyCode:'VND'},body),/INVOICE_NOT_FOUND/);
 await assert.rejects(resolveEvidence(tx,1,{currencyCode:'USD'},{...body,amount:'10000'}),/EXCEEDS_DOCUMENT/);
});
test('first transaction initializes an owned business account at zero without opening inputs, and retries keep one transaction',async()=>{
 let account=null,row=null;let creates=0;
 const tx={$queryRawUnsafe:async()=>[],organizationBankAccount:{findFirst:async({where})=>where.entityId===1&&where.orgId===1?{id:'master',currency:{code:'USD'},bankName:'',accountNumber:'',accountHolder:''}:null},bankLedgerAccount:{findFirst:async({where})=>account&&where.orgId===account.orgId&&(!where.id||where.id===account.id)&&(!where.entityAccountId||where.entityAccountId===account.entityAccountId)?account:null,create:async({data})=>account={id:'ledger',...data}},bankLedgerEntry:{findUnique:async()=>row,create:async({data})=>{creates++;return row={id:'entry',...data};}}};tx.$transaction=async fn=>fn(tx);
 const body={clientKey:'11111111-1111-4111-8111-111111111111',transactionDate:'2026-01-02',direction:'IN',amount:'10',purpose:'Received',evidenceNumber:'receipt.pdf',evidenceType:'FILE',bankFee:'0'};
 await postLedgerEntry(tx,1,'actor','entity:master',body);await postLedgerEntry(tx,1,'actor','entity:master',body);assert.equal(creates,1);assert.equal(account.openingBalance,'0');
 await assert.rejects(postLedgerEntry(tx,2,'actor','entity:master',body),/ACCOUNT_NOT_FOUND/);
 await assert.rejects(postLedgerEntry(tx,1,'actor','entity:master',{...body,evidenceNumber:'different.pdf'}),/RETRY_CONFLICT/);
});
test('approval service uses active employee identity and only the designated next approver',async()=>{
 const decisions=[],request={id:1,orgId:1,version:1,approvalSteps:[{id:'s1',position:1,employeeId:10},{id:'s2',position:2,employeeId:11}]};
 const tx={$queryRawUnsafe:async()=>[],employee:{findFirst:async({where})=>[10,11].includes(where.id)?where:null},expenseRequest:{findFirst:async()=>request},expenseApprovalDecision:{findMany:async()=>decisions,create:async({data})=>{decisions.push(data);return data;}}};tx.$transaction=async fn=>fn(tx);
 await assert.rejects(approveExpense(tx,1,11,1,1),/NOT_YOUR_TURN/);await assert.rejects(approveExpense(tx,1,99,1,1),/ACCESS_DENIED/);
 assert.equal((await approveExpense(tx,1,10,1,1)).approved,false);await approveExpense(tx,1,10,1,1);assert.equal(decisions.length,1);assert.equal((await approveExpense(tx,1,11,1,1)).approved,true);
 await assert.rejects(approveExpense(tx,1,10,1,2),/REQUEST_CHANGED/);
});

// Real SQL transactions exercise rollback, scoped paging, exact sums and retry receipts.
function ledgerDatabase(pg){
 const q=async(sql,args=[])=> (await pg.query(sql,args)).rows;
 const whereSql=(where,values)=>Object.entries(where||{}).map(([key,value])=>{
  if(key==='OR')return '('+value.map(branch=>whereSql(branch,values)).join(' OR ')+')';
  if(value===null)return `"${key}" IS NULL`;
  if(value&&typeof value==='object'&&!(value instanceof Date))return Object.entries(value).map(([op,v])=>{values.push(v);return `"${key}" ${{lt:'<',lte:'<=',gt:'>',gte:'>='}[op]} $${values.length}`;}).join(' AND ');
  values.push(value);return `"${key}"=$${values.length}`;
 }).join(' AND ')||'TRUE';
 const dates=row=>{if(!row)return null;const {__createdAt,...rest}=row;return {...rest,createdAt:new Date(__createdAt.replace(' ','T')+'Z')};};
 const model=table=>({
  findFirst:async({where})=>{const args=[];return dates((await q(`SELECT *,"createdAt"::text AS "__createdAt" FROM "${table}" WHERE ${whereSql(where,args)} LIMIT 1`,args))[0]);},
  findUnique:async({where,include})=>{const row=await model(table).findFirst({where:Object.values(where)[0]});if(row&&include?.allocations)row.allocations=await q(`SELECT * FROM "BankLedgerEvidenceAllocation" WHERE "entryId"=$1`,[row.id]);return row;},
  findMany:async({where,orderBy=[],skip=0,take,include})=>{const args=[],order=orderBy.map(o=>{const [key,dir]=Object.entries(o)[0];return `"${key}" ${dir}`;}).join(',');return (await q(`SELECT *,"createdAt"::text AS "__createdAt" FROM "${table}" WHERE ${whereSql(where,args)} ${order?'ORDER BY '+order:''} OFFSET ${skip} ${take?'LIMIT '+take:''}`,args)).map(dates);},
  create:async({data})=>{const {allocations,...fields}=data,row={id:randomUUID(),...fields},keys=Object.keys(row);const values=keys.map(key=>key==='entryIds'?JSON.stringify(row[key]):row[key]);const saved=(await q(`INSERT INTO "${table}"(${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,values))[0];for(const allocation of allocations?.create||[])await model('BankLedgerEvidenceAllocation').create({data:{...allocation,entryId:saved.id}});return saved;},
  groupBy:async({by,where})=>{const args=[],fields=by.map(k=>'"'+k+'"').join(',');return (await q(`SELECT ${fields},sum(amount)::text AS total FROM "${table}" WHERE ${whereSql(where,args)} GROUP BY ${fields}`,args)).map(({total,...row})=>({...row,_sum:{amount:total}}));}
 });
 const db={bankLedgerAccount:model('BankLedgerAccount'),bankLedgerEntry:model('BankLedgerEntry'),bankLedgerBatch:model('BankLedgerBatch'),bankLedgerSettlementLine:model('BankLedgerSettlementLine'),organizationBankAccount:{findMany:async()=>[]},$queryRawUnsafe:async(sql,...args)=>q(sql,args)};
 db.$transaction=async run=>{await pg.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');try{const result=await run(db);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}};
 return db;
}
const batchRow=(extra={})=>({clientKey:randomUUID(),accountId:'a',transactionDate:'2026-01-02',direction:'IN',amount:'10',purpose:'Receipt',evidenceType:'FILE',evidenceNumber:'scan.pdf',...extra});
test('net receipts and separate fees/write-offs settle invoices exactly without changing cash twice',async()=>{
 const pg=await fixture(),db=ledgerDatabase(pg);try{
  db.invoice={findFirst:async({where})=>(await pg.query(`SELECT * FROM "Invoice" WHERE "sellerOrgId"=$1 AND ${where.id?'id':'"invoiceNumber"'}=$2 AND status='ISSUED' AND "currencyCode"=$3`,[where.sellerOrgId,where.id||where.invoiceNumber,where.currencyCode])).rows[0]};
  db.bankLedgerEvidenceAllocation={findMany:async({where})=>(await pg.query(`SELECT a.* FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."orgId"=$1 AND a."invoiceId"=$2 AND e."voidedAt" IS NULL`,[where.orgId,where.invoiceId])).rows};
  const main=batchRow({entryKind:'BANK',evidenceType:'INVOICE',evidenceNumber:'INV-1',amount:'990'}),fee={entryKind:'FEE',clientKey:randomUUID(),parentClientKey:main.clientKey,amount:'10',purpose:'Withheld bank fee'},body={clientKey:randomUUID(),rows:[main,fee]};
  const first=await postLedgerBatch(db,1,'actor',body);assert.deepEqual(await postLedgerBatch(db,1,'actor',body),first);
  assert.deepEqual((await pg.query(`SELECT amount::text,"bankFee"::text,"writeOffAmount"::text FROM "BankLedgerEntry" WHERE id=$1`,[first.entryIds[0]])).rows,[{amount:'990.0000',bankFee:'10.0000',writeOffAmount:'0.0000'}]);
  assert.equal((await pg.query(`SELECT amount::text FROM "BankLedgerEvidenceAllocation" WHERE "entryId"=$1`,[first.entryIds[0]])).rows[0].amount,'1000.0000');
  assert.equal((await listLedgerActivity(db,1,{start:'2026-01-01',end:'2026-01-31'})).accounts[0].currentBalance,'991.00');
  await assert.rejects(postLedgerBatch(db,1,'actor',{...body,rows:[main,{...fee,amount:'11'}]}),/RETRY_CONFLICT/);
  const second=batchRow({entryKind:'BANK',evidenceType:'INVOICE',evidenceNumber:'INV-1',amount:'900'}),loss={entryKind:'WRITEOFF',clientKey:randomUUID(),parentClientKey:second.clientKey,amount:'100',purpose:'Customer unable to pay'};
  await postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[second,loss]});
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[second]}),/RETRY_CONFLICT/);
  assert.equal((await pg.query(`SELECT sum(amount)::text AS total FROM "BankLedgerEvidenceAllocation"`)).rows[0].total,'2000.0000');
  assert.equal((await listLedgerActivity(db,1,{start:'2026-01-01',end:'2026-01-31'})).accounts[0].currentBalance,'1891.00');
  await assert.rejects(pg.exec(`UPDATE "BankLedgerSettlementLine" SET amount=99`),/EVIDENCE_APPEND_ONLY/);
  await assert.rejects(pg.query(`INSERT INTO "BankLedgerSettlementLine"(id,"orgId","entryId","clientKey",kind,amount,purpose,"createdBy") VALUES('late',1,$1,'late','FEE',1,'Late fee','actor')`,[first.entryIds[0]]),/ENTRY_IMMUTABLE/);
  const broken=batchRow({entryKind:'BANK',evidenceType:'INVOICE',evidenceNumber:'INV-1'}),before=(await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerEntry"`)).rows[0].n;
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[broken,{...loss,clientKey:randomUUID(),parentClientKey:broken.clientKey,purpose:'   '}]}),/INVALID_INPUT/);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerEntry"`)).rows[0].n,before);
  await pg.query(`UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id=$1`,[first.entryIds[0]]);
  assert.equal((await db.bankLedgerEvidenceAllocation.findMany({where:{orgId:1,invoiceId:'i1'}})).reduce((sum,row)=>sum+Number(row.amount),0),1000);
 }finally{await pg.close();}
});
test('settlement lines require the same transaction, exact totals, document type and company scope',async()=>{
 const pg=await fixture();try{
  const base=entry('typed','INVOICE',990).replace('"bankFee")','"bankFee","settlementMode")').replace("'INVOICE',0)","'INVOICE',10,'ROWS')");
  const allocation=`INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('typed-a','typed',1,'i1',1000);`;
  const child=`INSERT INTO "BankLedgerSettlementLine"(id,"orgId","entryId","clientKey",kind,amount,purpose,"createdBy") VALUES('typed-fee',1,'typed','typed-fee','FEE',10,'Fee','actor');`;
  await rejectTx(pg,base+allocation,/LEDGER_SETTLEMENT_MISMATCH/);
  await rejectTx(pg,base+allocation+child.replace("'FEE',10","'FEE',9"),/LEDGER_SETTLEMENT_MISMATCH/);
  await rejectTx(pg,base+allocation+child.replace("'typed-fee',1,","'typed-fee',2,"),/LEDGER_INVALID_SETTLEMENT/);
  await pg.exec('BEGIN;'+base+allocation+child+'COMMIT;');
  await assert.rejects(pg.exec(child.replaceAll('typed-fee','late-fee')),/LEDGER_ENTRY_IMMUTABLE/);
  await pg.exec(await readFile('backend/prisma/migrations/20261030150000_ledger_settlement_lines/migration.sql','utf8'));
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerSettlementLine"`)).rows[0].n,1);
 }finally{await pg.close();}
});

test('expense fees are included in actual withdrawal, require current approval and do not increase item payments',async()=>{
 const pg=await fixture(),db=ledgerDatabase(pg);try{
  await pg.exec(`UPDATE "ExpenseRequest" SET "createdByEmployeeId"=99; INSERT INTO "ExpenseApprovalDecision" VALUES('pay-1',1,1,1,1,10,now()),('pay-2',1,1,1,2,11,now());`);
  db.partnerTransactionCost={findMany:async()=> (await pg.query(`SELECT * FROM "PartnerTransactionCost" WHERE id='c1'`)).rows,findFirst:async()=> (await pg.query(`SELECT * FROM "PartnerTransactionCost" WHERE id='c1'`)).rows[0]};
  db.expenseRequest={findFirst:async()=>{const row=(await pg.query(`SELECT * FROM "ExpenseRequest" WHERE id=1`)).rows[0];return {...row,approvalSteps:(await pg.query(`SELECT * FROM "ExpenseRequestApprovalStep" WHERE "requestId"=1 ORDER BY position`)).rows};}};
  db.expenseApprovalDecision={findMany:async({where})=>(await pg.query(`SELECT * FROM "ExpenseApprovalDecision" WHERE "requestId"=1 AND version=$1`,[where.version])).rows};
  db.bankLedgerEvidenceAllocation={findMany:async({where})=>(await pg.query(`SELECT a.* FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=$1 AND e."voidedAt" IS NULL`,[where.expenseItemId])).rows};
  const main=batchRow({entryKind:'BANK',direction:'OUT',evidenceType:'EXPENSE',evidenceNumber:'',amount:'101',expenseRequestId:1,expenseVersion:1,expenseItems:[{itemId:'c1',amount:'100'}]}),fee={entryKind:'FEE',clientKey:randomUUID(),parentClientKey:main.clientKey,amount:'1',purpose:'Transfer fee'};
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[{...main,expenseVersion:2},fee]}),/EXPENSE_REQUEST_CHANGED/);
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[main,{...fee,entryKind:'WRITEOFF'}]}),/INVALID_SETTLEMENT/);
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[main,{...fee,parentClientKey:randomUUID()}]}),/INVALID_SETTLEMENT/);
  const result=await postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[main,fee]});
  assert.equal((await pg.query(`SELECT amount::text FROM "BankLedgerEvidenceAllocation" WHERE "entryId"=$1`,[result.entryIds[0]])).rows[0].amount,'100.0000');
  assert.equal((await listLedgerActivity(db,1,{start:'2026-01-01',end:'2026-01-31'})).accounts[0].currentBalance,'-100.00');
 }finally{await pg.close();}
});
test('multi-row save is atomic, receipts prevent changed or duplicate retries, and foreign accounts roll back the whole save',async()=>{
 const pg=await fixture(),db=ledgerDatabase(pg);try{
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[batchRow(),batchRow({evidenceNumber:''})]}),/LEDGER_ROW:2:LEDGER_FILE_REQUIRED/);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerEntry"`)).rows[0].n,1);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerBatch"`)).rows[0].n,0);
  const body={clientKey:randomUUID(),rows:[batchRow({evidenceType:'ADJUSTMENT',evidenceNumber:'',amount:'100'}),batchRow({direction:'OUT',amount:'20'})]};
  const first=await postLedgerBatch(db,1,'actor',body);assert.deepEqual(await postLedgerBatch(db,1,'actor',body),first);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerEntry"`)).rows[0].n,3);
  await assert.rejects(postLedgerBatch(db,1,'actor',{...body,rows:[{...body.rows[0],amount:'99'},body.rows[1]]}),/RETRY_CONFLICT/);
  await assert.rejects(postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[batchRow(),batchRow({accountId:'foreign'})]}),/LEDGER_ROW:2:LEDGER_ACCOUNT_NOT_FOUND/);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BankLedgerEntry"`)).rows[0].n,3);
  await assert.rejects(pg.exec(`DELETE FROM "BankLedgerBatch"`),/EVIDENCE_APPEND_ONLY/);
 }finally{await pg.close();}
});
test('all-account activity and modal totals keep currencies separate and balances scoped to each account',async()=>{
 const pg=await fixture(),db=ledgerDatabase(pg);try{
  await pg.exec(`INSERT INTO "BankLedgerAccount"(id,"orgId","clientKey","bankName","accountNumber","accountHolder","currencyCode","openingDate","openingBalance","createdBy") VALUES('b',1,'b','B','002','C','USD','2026-01-01',0,'actor'),('c',1,'c','B','003','C','VND','2026-01-01',0,'actor'),('foreign',2,'f','B','f','C','USD','2026-01-01',999,'actor')`);
  await postLedgerBatch(db,1,'actor',{clientKey:randomUUID(),rows:[batchRow({amount:'100'}),batchRow({accountId:'b',direction:'OUT',amount:'5'}),batchRow({accountId:'c',amount:'200'})]});
  const result=await listLedgerActivity(db,1,{start:'2026-01-02',end:'2026-01-02'});assert.equal(result.rows.length,3);assert.equal(result.accounts.length,3);
  assert.equal(result.rows.find(r=>r.accountId==='a').balance,'101.00');assert.equal(result.rows.find(r=>r.accountId==='b').balance,'-5.00');
  assert.equal(result.currencyTotals.find(r=>r.currencyCode==='USD').currentBalance,'96.00');assert.equal(result.currencyTotals.find(r=>r.currencyCode==='VND').currentBalance,'200');
  const filtered=await listLedgerActivity(db,1,{start:'2026-01-02',end:'2026-01-02',accountId:'b'});assert.equal(filtered.rows.length,1);assert.equal(filtered.accounts.length,3);
  await assert.rejects(listLedgerActivity(db,1,{start:'2026-01-02',end:'2026-01-02',accountId:'foreign'}),/ACCOUNT_NOT_FOUND/);
 }finally{await pg.close();}
});
test('all-account pagination includes the prior running balance and voided rows do not affect totals',async()=>{
 const pg=await fixture(),db=ledgerDatabase(pg);try{
  await pg.exec(`INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy") SELECT 'bulk'||lpad(n::text,3,'0'),1,'a','bulk'||n,'2026-01-02','IN',1,'Batch','scan.pdf','actor' FROM generate_series(1,101) n;UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id='bulk001'`);
  const result=await listLedgerActivity(db,1,{start:'2026-01-02',end:'2026-01-02',page:1});assert.equal(result.rows.length,1);assert.equal(result.rows[0].balance,'101.00');assert.equal(result.accounts[0].totalIn,'100.00');
 }finally{await pg.close();}
});
