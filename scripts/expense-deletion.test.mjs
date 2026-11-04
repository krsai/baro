import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {requestExpenseDeletion,decideExpenseDeletion,canApproveExpenseDeletion,listExpenseDeletions,attachExpenseDeletionAvailability}=require('../backend/dist/services/expenseDeletion');
const {canDraftExpense,validateApprovalSettings,defaultApprovalSettings,resolveExpenseApproval}=require('../backend/dist/services/expenseApproval');
const {approvalState}=require('../backend/dist/services/bankEvidence');
function fixture(){
 const grade=(id,sortOrder,setId=1)=>({id,setId,sortOrder,isActive:true,set:{isActive:true}});
 const people=[{id:1,orgId:7,status:'ACTIVE',orgRole:'OPERATOR',gradeId:10,grade:grade(10,1)},{id:2,orgId:7,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:20,grade:grade(20,2)},{id:3,orgId:7,status:'ACTIVE',orgRole:'ADMIN',gradeId:20,grade:grade(20,2)},{id:4,orgId:7,status:'ACTIVE',orgRole:'ADMIN',gradeId:30,grade:grade(30,3)},{id:5,orgId:7,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:30,grade:grade(30,3)}];
 const document={id:11,orgId:7,version:1,requestDate:'2026-11-03',managementNumber:'EXP-TEST',remark:'Keep original',createdByEmployeeId:1,createdByEmployee:people[0],approvalSteps:[{id:'step1',position:1,employeeId:2}],items:[{id:'cost1',orgId:7,amount:'100',currency:'USD',expenseRequestLine:1}]},requests=[],audits=[],decisions=[],payments=[];
 const db={$queryRaw:async()=>[],$queryRawUnsafe:async sql=>sql.includes('SELECT d.id')?requests.map(r=>({id:r.id})):[],employee:{findFirst:async({where})=>people.find(p=>p.id===where.id&&p.orgId===where.orgId&&(!where.status||p.status===where.status))||null},employeeGrade:{findFirst:async({where})=>people.map(p=>p.grade).find(g=>g.id===where.id&&where.orgId===7)},organization:{findUnique:async()=>({type:'MANUFACTURER',country:'VN'})},expenseRequest:{findFirst:async({where})=>where.id===11&&where.orgId===7?document:null,update:async({data})=>Object.assign(document,{...data,version:document.version+1})},expenseRequestAudit:{findFirst:async()=>({afterSnapshot:{approvalPolicy:{exempt:false,config:{version:2,kind:'EXPENSE'}}}}),create:async({data})=>{audits.push(data);return data;}},expenseApprovalDecision:{findMany:async()=>decisions},bankLedgerEvidenceAllocation:{findFirst:async()=>payments.find(p=>p.voidedAt===null)||null,findMany:async()=>payments.filter(p=>p.voidedAt===null).map(p=>({expenseItemId:p.expenseItemId}))},expenseDeletionRequest:{findUnique:async({where})=>requests.find(r=>r.clientKey===where.orgId_clientKey.clientKey),findFirst:async({where})=>requests.find(r=>(!where.id||r.id===where.id)&&r.orgId===where.orgId&&(!where.version||r.version===where.version)&&(!where.status||r.status===where.status)),create:async({data})=>{const row={id:'delete1',status:'PENDING',createdAt:new Date(),...data};requests.push(row);return row;},update:async({where,data})=>Object.assign(requests.find(r=>r.id===where.id),data),findMany:async()=>requests.map(r=>({...r,request:document,requestedBy:{name:'Drafter'}}))}};db.$transaction=async fn=>fn(db);
 return {db,document,requests,audits,decisions,people,payments};
}
const body={version:1,reason:'Duplicate entry',clientKey:'delete-key-1234'};
test('drafter scope supports all/specific roles and grades and rejects unauthorized new drafting before amount resolution',async()=>{
 const {db,people}=fixture();
 for(const role of ['ALL','OPERATOR','ACCOUNTANT','ADMIN'])for(const gradeId of [null,10,20]){
  const config={drafterScope:{role,gradeId}};
  for(const p of people)assert.equal(!!canDraftExpense(p,config),(role==='ALL'||role===p.orgRole)&&(!gradeId||gradeId===p.gradeId));
 }
 const config=await validateApprovalSettings(db,7,{...defaultApprovalSettings(),rules:[],revision:0,drafterScope:{role:'OPERATOR',gradeId:10}});assert.deepEqual(config.drafterScope,{role:'OPERATOR',gradeId:10});
 await assert.rejects(validateApprovalSettings(db,7,{...defaultApprovalSettings(),drafterScope:{role:'SYSTEM',gradeId:null}}),/INVALID_APPROVAL_RULE/);
 db.systemSetting={findUnique:async()=>({value:config})};
 await assert.rejects(resolveExpenseApproval(db,7,4,[{quantity:'1',unitPrice:'100',currency:'USD',vatRate:'0'}]),/DRAFTER_NOT_ALLOWED/);
 const existing=await resolveExpenseApproval(db,7,4,[{quantity:'1',unitPrice:'100',currency:'USD',vatRate:'0'}],undefined,false,config);
 assert.equal(existing.policy.exempt,true,'new submission restrictions do not revoke editing of an existing saved document');
});
test('request requires reason, current version, participant and active membership; retries do not duplicate',async()=>{
 const {db,document,requests,decisions,people}=fixture();
 await assert.rejects(requestExpenseDeletion(db,7,1,11,{...body,reason:' '}),/REASON_REQUIRED/);
 await assert.rejects(requestExpenseDeletion(db,8,1,11,body),/ACTIVE_EMPLOYEE_REQUIRED/);
 await assert.rejects(requestExpenseDeletion(db,7,5,11,body),/NOT_PARTICIPANT/);
 await assert.rejects(requestExpenseDeletion(db,7,1,11,{...body,version:2}),/REQUEST_CHANGED/);
 decisions.push({requestId:11,version:1,position:1,employeeId:2,decision:'APPROVED'});
 // Completed approval remains intact and no longer prevents deletion requests.
 await requestExpenseDeletion(db,7,1,11,body);await requestExpenseDeletion(db,7,1,11,body);assert.equal(requests.length,1);assert.equal(document.deletedAt,undefined);
 await assert.rejects(requestExpenseDeletion(db,7,1,11,{...body,clientKey:'another-key-1234'}),/PENDING/);
 assert.equal(canApproveExpenseDeletion(people[2],requests[0]),false);assert.equal(canApproveExpenseDeletion(people[3],requests[0]),true);assert.equal(canApproveExpenseDeletion(people[4],requests[0]),false);
});
test('only a higher-grade administrator can decide; approval soft deletes atomically and preserves cost IDs, amounts, original approval and audit snapshots',async()=>{
 const {db,document,requests,audits,people}=fixture(),original=structuredClone(document);
 await requestExpenseDeletion(db,7,1,11,body);
 await assert.rejects(decideExpenseDeletion(db,7,3,'delete1',{decision:'APPROVED'}),/APPROVER_REQUIRED/);
 await assert.rejects(decideExpenseDeletion(db,7,5,'delete1',{decision:'APPROVED'}),/APPROVER_REQUIRED/);
 people[3].grade.setId=2;await assert.rejects(decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'}),/APPROVER_REQUIRED/);people[3].grade.setId=1;
 await decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'});assert.ok(document.deletedAt);assert.equal(document.version,2);assert.equal(document.deletionRequestId,'delete1');assert.deepEqual(document.items,original.items);assert.deepEqual(document.approvalSteps,original.approvalSteps);
 assert.equal(requests[0].status,'APPROVED');assert.equal(audits[0].afterSnapshot.deletion.reason,body.reason);assert.equal(audits[0].beforeSnapshot.document.version,1);assert.equal(audits[0].afterSnapshot.document.version,2);
 const state=await approvalState(db,7,11,2);assert.equal(state.status,'DELETED');assert.equal(state.canApprove,false);assert.equal(state.approved,false);
 await decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'});assert.equal(audits.length,1);
});
test('self approval, changed version and final-grade changes cannot delete; rejection keeps expense intact',async()=>{
 for(const change of ['self','version','grade']){
  const {db,document,people,decisions}=fixture();await requestExpenseDeletion(db,7,change==='self'?4:1,11,body);
  if(change==='version')document.version=2;if(change==='grade')people[1].gradeId=30;
  await assert.rejects(decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'}),/APPROVER_REQUIRED|ALREADY_APPROVED|REQUEST_CHANGED/);assert.equal(document.deletedAt,undefined);
 }
 const {db,document,requests}=fixture();await requestExpenseDeletion(db,7,1,11,body);await assert.rejects(decideExpenseDeletion(db,7,4,'delete1',{decision:'REJECTED',reason:''}),/REASON_REQUIRED/);await decideExpenseDeletion(db,7,4,'delete1',{decision:'REJECTED',reason:'Keep this expense'});assert.equal(requests[0].status,'REJECTED');assert.equal(document.deletedAt,undefined);
});
test('deletion inbox exposes only the requester or eligible administrators and never returns document snapshots',async()=>{
 const {db}=fixture();await requestExpenseDeletion(db,7,1,11,body);
 assert.deepEqual(await listExpenseDeletions(db,7,3),[]);
 const [admin]=await listExpenseDeletions(db,7,4);assert.equal(admin.canDecide,true);assert.equal(admin.reason,body.reason);assert.equal('documentSnapshot' in admin,false);
 const [own]=await listExpenseDeletions(db,7,1);assert.equal(own.canDecide,false);
 await assert.rejects(listExpenseDeletions(db,8,4),/ACTIVE_EMPLOYEE_REQUIRED/);
});
test('approved expenses may be deleted, but any live payment blocks both requesting and deciding until all linked payments are voided',async()=>{
 const {db,document,payments,decisions,requests}=fixture();
 decisions.push({requestId:11,version:1,position:1,employeeId:2,decision:'APPROVED'});
 const originalDecisions=structuredClone(decisions);
 payments.push({expenseItemId:'cost1',voidedAt:null},{expenseItemId:'cost1',voidedAt:null});
 await assert.rejects(requestExpenseDeletion(db,7,1,11,body),/ALREADY_RECONCILED/);
 payments[0].voidedAt=new Date();await assert.rejects(requestExpenseDeletion(db,7,1,11,body),/ALREADY_RECONCILED/);
 payments[1].voidedAt=new Date();await requestExpenseDeletion(db,7,1,11,body);
 payments.push({expenseItemId:'cost1',voidedAt:null});
 await assert.rejects(decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'}),/ALREADY_RECONCILED/);assert.equal(requests[0].status,'PENDING');assert.equal(document.deletedAt,undefined);
 payments[2].voidedAt=new Date();await decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'});
 assert.ok(document.deletedAt);assert.equal(payments.length,3);assert.deepEqual(decisions,originalDecisions);assert.equal(document.items[0].amount,'100');
});
test('list availability follows live payments instead of approval status and re-enables after voiding payments',async()=>{
 const {db,document,people,payments}=fixture(),row={...document,approval:{approved:true,status:'APPROVED'},deletionRequests:[{version:1}]};
 db.changeApprovalRequest={findMany:async()=>[]};
 const read=async actor=>(await attachExpenseDeletionAvailability(db,7,[row],actor||people[0]))[0];
 assert.equal((await read()).canRequestDeletion,true);assert.equal((await read()).deletionPending,true);
 payments.push({expenseItemId:'cost1',voidedAt:null});assert.equal((await read()).canRequestDeletion,false);assert.equal((await read()).bankReconciled,true);
 payments[0].voidedAt=new Date();assert.equal((await read()).canRequestDeletion,true);assert.equal((await read()).bankReconciled,false);
 assert.equal((await read(people[4])).canRequestDeletion,false);
});
test('a self-authorized document uses its original drafter as final authority and still needs a higher-grade administrator',async()=>{
 const {db,document,people,requests}=fixture();document.approvalSteps=[];document.createdByEmployeeId=3;document.createdByEmployee=people[2];
 await requestExpenseDeletion(db,7,3,11,body);assert.equal(requests[0].finalEmployeeId,3);assert.equal(requests[0].finalGradeOrder,2);
 await assert.rejects(decideExpenseDeletion(db,7,3,'delete1',{decision:'APPROVED'}),/APPROVER_REQUIRED/);
 await decideExpenseDeletion(db,7,4,'delete1',{decision:'APPROVED'});assert.ok(document.deletedAt);
});
test('SQL protects company/grade scopes and history, applies deletion only with approved request and refuses later approvals',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "EmployeeGradeSet"(id INT PRIMARY KEY,"isActive" BOOL DEFAULT true);CREATE TABLE "EmployeeGrade"(id INT,"orgId" INT,"setId" INT,"sortOrder" INT,"isActive" BOOL DEFAULT true,UNIQUE(id,"orgId"));CREATE TABLE "Employee"(id INT,"orgId" INT,"gradeId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));CREATE TABLE "ExpenseRequest"(id INT,"orgId" INT,version INT,"createdByEmployeeId" INT,UNIQUE(id,"orgId"));CREATE TABLE "ExpenseRequestApprovalStep"("requestId" INT,"orgId" INT,position INT,"employeeId" INT);CREATE TABLE "ExpenseApprovalDecision"("requestId" INT,"orgId" INT,version INT,position INT,"employeeId" INT,decision TEXT);CREATE TABLE "PartnerTransactionCost"(id TEXT,"orgId" INT,"expenseRequestId" INT);CREATE TABLE "BankLedgerEvidenceAllocation"("expenseItemId" TEXT,"entryId" TEXT);CREATE TABLE "BankLedgerEntry"(id TEXT,"voidedAt" TIMESTAMP);CREATE FUNCTION baro_expense_approval_exempt(INT,INT,INT) RETURNS BOOL LANGUAGE SQL AS 'SELECT false';INSERT INTO "EmployeeGradeSet" VALUES(1,true);INSERT INTO "EmployeeGrade" VALUES(1,7,1,1,true),(2,7,1,2,true),(3,7,1,3,true);INSERT INTO "Employee" VALUES(1,7,1,'ACTIVE','OPERATOR'),(2,7,2,'ACTIVE','ACCOUNTANT'),(3,7,2,'ACTIVE','ADMIN'),(4,7,3,'ACTIVE','ADMIN');INSERT INTO "ExpenseRequest" VALUES(11,7,1,1);INSERT INTO "ExpenseRequestApprovalStep" VALUES(11,7,1,2);`);
 const sql=readFileSync('backend/prisma/migrations/20261103210000_expense_deletion_requests/migration.sql','utf8');await db.exec(sql);
 const approvedSql=readFileSync('backend/prisma/migrations/20261103220000_approved_expense_deletion/migration.sql','utf8');await db.exec(approvedSql);await db.exec(approvedSql);
 const insert=`INSERT INTO "ExpenseDeletionRequest"(id,"orgId","requestId",version,"clientKey","requestedByEmployeeId",reason,"finalEmployeeId","finalGradeId","gradeSetId","finalGradeOrder","documentSnapshot") VALUES('d1',7,11,1,'key12345678',1,'Duplicate',2,2,1,2,'{"document":{"id":11,"version":1}}')`;
 await db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(11,7,1,1,2,'APPROVED');INSERT INTO "PartnerTransactionCost" VALUES('c1',7,11);INSERT INTO "BankLedgerEntry" VALUES('payment1',NULL),('payment2',NULL);INSERT INTO "BankLedgerEvidenceAllocation" VALUES('c1','payment1'),('c1','payment2');`);
 await assert.rejects(db.exec(insert),/NOT_AVAILABLE/);
 await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now() WHERE id='payment1'`);await assert.rejects(db.exec(insert),/NOT_AVAILABLE/);
 await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now() WHERE id='payment2'`);await db.exec(insert);
 await db.exec(`INSERT INTO "BankLedgerEntry" VALUES('payment3',NULL);INSERT INTO "BankLedgerEvidenceAllocation" VALUES('c1','payment3')`);
 await assert.rejects(db.exec(`UPDATE "ExpenseDeletionRequest" SET status='REJECTED',"decidedByEmployeeId"=4,"decidedAt"=now(),"decisionReason"='Check payment'`),/NOT_AVAILABLE/);
 await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now() WHERE id='payment3'`);
 await db.exec(`INSERT INTO "ExpenseRequest" VALUES(12,7,1,3,NULL,NULL,NULL);INSERT INTO "ExpenseDeletionRequest"(id,"orgId","requestId",version,"clientKey","requestedByEmployeeId",reason,"finalEmployeeId","finalGradeId","gradeSetId","finalGradeOrder","documentSnapshot") VALUES('self',7,12,1,'self12345678',3,'Duplicate',3,2,1,2,'{"document":{"id":12,"version":1}}')`);
 await assert.rejects(db.exec(`UPDATE "ExpenseDeletionRequest" SET reason='Rewrite'`),/IMMUTABLE/);
 await assert.rejects(db.exec(`UPDATE "ExpenseDeletionRequest" SET status='APPROVED',"decidedByEmployeeId"=3,"decidedAt"=now() WHERE id='d1'`),/APPROVER_REQUIRED/);
 await assert.rejects(db.exec(`UPDATE "ExpenseRequest" SET "deletedAt"=now()`),/APPROVAL_REQUIRED/);
 await assert.rejects(db.exec(`UPDATE "ExpenseDeletionRequest" SET status='APPROVED',"decidedByEmployeeId"=4,"decidedAt"=now() WHERE id='d1'`),/NOT_APPLIED/);
 // Use the deployed editor/audit guards too: deletion must carry the existing
 // transaction capability and append a matching, incremented document snapshot.
 await db.exec(`ALTER TABLE "ExpenseRequest" ADD COLUMN "createdAt" TIMESTAMP DEFAULT now(),ADD COLUMN "clientKey" TEXT DEFAULT 'original',ADD COLUMN "submissionHash" TEXT DEFAULT 'original',ADD COLUMN "updatedAt" TIMESTAMP,ADD COLUMN "updatedByEmployeeId" INT,ADD COLUMN remark TEXT DEFAULT '',ADD COLUMN "requestDate" TEXT DEFAULT '2026-11-03',ADD COLUMN "partnerOrgId" INT,ADD COLUMN "payeeEmployeeId" INT;CREATE TABLE "ExpenseRequestAudit"(id TEXT,"orgId" INT,"requestId" INT,"actorId" INT,version INT,action TEXT,"clientKey" TEXT,"beforeSnapshot" JSONB,"afterSnapshot" JSONB);`);
 const functions=(file,names)=>{const source=readFileSync(file,'utf8');return names.map(name=>{const begin=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=source.indexOf('$$;',begin)+3;assert.ok(begin>=0&&end>begin);return source.slice(begin,end);}).join('\n');};
 await db.exec(functions('backend/prisma/migrations/20261020160000_expense_audit_versions/migration.sql',['baro_expense_editor_authorized','baro_expense_request_write_guard','baro_expense_audit_write_guard']));
 await db.exec(functions('backend/prisma/migrations/20261030210000_employee_expense_payees/migration.sql',['baro_expense_editor_audit_guard']));
 await db.exec(`CREATE TRIGGER "ExpenseRequest_write_guard" BEFORE UPDATE ON "ExpenseRequest" FOR EACH ROW EXECUTE FUNCTION baro_expense_request_write_guard();CREATE CONSTRAINT TRIGGER "ExpenseRequest_audit_guard" AFTER UPDATE ON "ExpenseRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_editor_audit_guard();CREATE TRIGGER "ExpenseRequestAudit_append_only" BEFORE INSERT ON "ExpenseRequestAudit" FOR EACH ROW EXECUTE FUNCTION baro_expense_audit_write_guard();`);
 await db.exec(`BEGIN;SELECT set_config('baro.expense_editor_actor','4',true),set_config('baro.expense_editor_org','7',true),set_config('baro.expense_editor_key','EXPENSE_REQUEST_EDIT:7:DELETE_d1',true);UPDATE "ExpenseDeletionRequest" SET status='APPROVED',"decidedByEmployeeId"=4,"decidedAt"=now() WHERE id='d1';UPDATE "ExpenseRequest" SET "deletedAt"=now(),"deletedByEmployeeId"=4,"deletionRequestId"='d1',version=2,"updatedAt"=now(),"updatedByEmployeeId"=4 WHERE id=11;INSERT INTO "ExpenseRequestAudit" VALUES('a2',7,11,4,2,'UPDATE','EXPENSE_REQUEST_EDIT:7:DELETE_d1','{}',jsonb_build_object('document',(SELECT to_jsonb(r) FROM "ExpenseRequest" r WHERE id=11)));COMMIT;`);
 assert.equal((await db.query('SELECT count(*)::int n FROM "BankLedgerEntry"')).rows[0].n,3);
 await assert.rejects(db.exec(`INSERT INTO "BankLedgerEvidenceAllocation" VALUES('c1','payment1')`),/REQUEST_DELETED/);
 await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(11,7,2,1,2,'APPROVED')`),/REQUEST_DELETED/);
 await assert.rejects(db.exec(`UPDATE "ExpenseRequest" SET "deletedAt"=NULL WHERE id=11`),/REQUEST_DELETED/);
 await assert.rejects(db.exec(`DELETE FROM "ExpenseDeletionRequest"`),/IMMUTABLE/);
 }finally{await db.close();}
});
