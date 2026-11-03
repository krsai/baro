import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {validateApprovalRules}=require('../backend/dist/services/approvalRules');
const {resolveExpenseApproval,defaultApprovalSettings}=require('../backend/dist/services/expenseApproval');
function fixture(){
 const grades=[{id:1,code:'CL1'},{id:2,code:'CL2'},{id:3,code:'CL3'}];
 const people=[{id:10,orgId:7,orgRole:'OPERATOR',gradeId:1},{id:20,orgId:7,orgRole:'OPERATOR',gradeId:3},{id:30,orgId:7,orgRole:'ACCOUNTANT',gradeId:2},{id:31,orgId:7,orgRole:'ACCOUNTANT',gradeId:3},{id:40,orgId:7,orgRole:'ADMIN',gradeId:3}].map(p=>({...p,name:String(p.id),status:'ACTIVE',grade:{...grades.find(g=>g.id===p.gradeId),isActive:true,set:{isActive:true}}}));
 const rule={id:'usd-operator',name:'USD operations',drafterRole:'OPERATOR',drafterGradeId:1,currency:'USD',min:'5000',max:null,stages:[{role:'OPERATOR',gradeId:3},{role:'ACCOUNTANT',gradeId:2},{role:'ADMIN',gradeId:null}]};
 const config={...defaultApprovalSettings(),version:2,revision:1,kind:'EXPENSE',rules:[rule]};
 const matches=(p,w)=>Object.entries(w).every(([key,value])=>key==='id'&&value?.notIn?!value.notIn.includes(p.id):value?.in?value.in.includes(p[key]):key==='grade'?p.grade.isActive&&p.grade.set.isActive&&(!value.code||p.grade.code===value.code):p[key]===value);
 const db={systemSetting:{findUnique:async()=>({value:config})},employeeGrade:{findFirst:async({where})=>where.orgId===7?grades.find(g=>g.id===where.id):null},employee:{findFirst:async({where})=>people.find(p=>matches(p,where)),findMany:async({where})=>people.filter(p=>matches(p,where))}};
 return {db,rule,config,people};
}
const item=amount=>({unitPrice:amount,currency:'USD',quantity:'1',vatRate:'0'});
test('5500 USD request uses configurable operations lead, senior accountant and admin in exact order',async()=>{
 const {db,config,rule}=fixture();assert.equal((await validateApprovalRules(db,7,[rule])).length,1);
 const selection={step1EmployeeId:20,step2EmployeeId:30,step3EmployeeId:40};
 const result=await resolveExpenseApproval(db,7,10,[item('5500')],selection);
 assert.deepEqual(result.ids,[20,30,40]);assert.deepEqual(result.policy.resolvedStages.map(s=>s.role),['OPERATOR','ACCOUNTANT','ADMIN']);
 await assert.rejects(resolveExpenseApproval(db,7,10,[item('5500')],{...selection,step1EmployeeId:10}),/INVALID_EXPENSE_APPROVERS/);
 await assert.rejects(resolveExpenseApproval(db,7,10,[item('5500')],{...selection,step2EmployeeId:31}),/INVALID_EXPENSE_APPROVERS/);
 const original=defaultApprovalSettings();config.rules=[];
 const old=await resolveExpenseApproval(db,7,10,[item('5500')],undefined,false,original);
 assert.deepEqual(old.ids,[30,31,40]);assert.equal(old.policy.config.version,undefined);
});
test('rules validate actual company grades, accountant requirement and exact decimal bounds',async()=>{
 const {db,rule}=fixture();
 for(const changed of [{...rule,min:'5500.001'},{...rule,max:'100'},{...rule,stages:[{role:'OPERATOR',gradeId:3}]},{...rule,stages:[{role:'ACCOUNTANT',gradeId:999}]}])await assert.rejects(validateApprovalRules(db,7,[changed]));
 await assert.rejects(validateApprovalRules(db,8,[rule]));
 assert.equal((await resolveExpenseApproval(db,7,10,[item('5000')],undefined)).ids[0],20);
 const below=await resolveExpenseApproval(db,7,10,[item('4999.99')],undefined);assert.deepEqual(below.ids,[30,31]);
});
test('two intermediate approvers can share a grade but must be different actual employees',async()=>{
 const {db,rule,people}=fixture();people.push({...people[1],id:21,name:'Second operations lead'});
 rule.stages=[{role:'OPERATOR',gradeId:3},{role:'OPERATOR',gradeId:3},{role:'ACCOUNTANT',gradeId:2},{role:'ADMIN',gradeId:null}];
 assert.equal((await validateApprovalRules(db,7,[rule]))[0].stages.length,4);
 const selection={step1EmployeeId:20,step2EmployeeId:21,step3EmployeeId:30,step4EmployeeId:40};
 assert.deepEqual((await resolveExpenseApproval(db,7,10,[item('5500')],selection)).ids,[20,21,30,40]);
 await assert.rejects(resolveExpenseApproval(db,7,10,[item('5500')],{...selection,step2EmployeeId:20}),/INVALID_EXPENSE_APPROVERS/);
});
test('mixed currencies merge required stages without FX and reject contradictory ordering',async()=>{
 const {db,config,rule}=fixture();
 const krw={...rule,id:'krw',currency:'KRW',min:'0',stages:[{role:'OPERATOR',gradeId:3},{role:'ACCOUNTANT',gradeId:2}]};config.rules.push(krw);
 const items=[item('5500'),{...item('1000000'),currency:'KRW'}];
 assert.deepEqual((await resolveExpenseApproval(db,7,10,items,undefined)).ids,[20,30,40]);
 krw.stages.reverse();await assert.rejects(resolveExpenseApproval(db,7,10,items,undefined),/APPROVAL_RULE_ORDER_CONFLICT/);
});
test('editing only USD conditions preserves untouched currency fallbacks and other drafter roles',async()=>{
 const {db}=fixture();
 const mixed=[item('5500'),{...item('1000000'),currency:'KRW'}];
 assert.deepEqual((await resolveExpenseApproval(db,7,10,mixed,undefined)).ids,[20,30,40]);
 // No accountant-specific condition exists: use their original own-grade limits.
 assert.deepEqual((await resolveExpenseApproval(db,7,30,mixed,undefined)).ids,[31,40]);
});
test('non-financial subjects resolve without money and cannot reuse expense policy namespaces',async()=>{
 const {db,rule,people}=fixture();const subject={key:'LEAVE',menuPath:'/leave-requests',hasAmount:false,enabled:true};
 const {resolveApprovalRules}=require('../backend/dist/services/approvalRules');
 const {approvalPolicyNamespace}=require('../backend/dist/services/approvalSubjects');
 const rules=await validateApprovalRules(db,7,[{...rule,stages:[{role:'OPERATOR',gradeId:3}],currency:undefined,min:undefined,max:undefined}],subject);
 assert.equal(rules[0].currency,null);assert.equal(rules[0].min,null);
 const config={version:2,kind:'LEAVE',rules};
 assert.deepEqual((await resolveApprovalRules(db,7,people[0],new Map(),config,{step1EmployeeId:20},false,subject)).ids,[20]);
 await assert.rejects(resolveApprovalRules(db,7,people[0],new Map(),config,{},true),/INVALID_APPROVAL_SUBJECT/);
 assert.equal(approvalPolicyNamespace(subject,7),'APPROVAL_POLICY:LEAVE:7');
});
test('only the named operator in a current expense rule snapshot can approve through the service',async()=>{
 const {db,people}=fixture();const {approvalState,approveExpense}=require('../backend/dist/services/bankEvidence');
 const decisions=[],policy={config:{version:2,kind:'EXPENSE'},resolvedStages:[{employeeId:20,role:'OPERATOR',gradeId:3}]};
 db.$transaction=async fn=>fn(db);db.$queryRawUnsafe=async()=>[];
 db.expenseRequest={findFirst:async()=>({id:1,version:1,createdByEmployeeId:10,approvalSteps:[{position:1,employeeId:20},{position:2,employeeId:30}]})};
 db.expenseRequestAudit={findFirst:async()=>({afterSnapshot:{approvalPolicy:policy}})};
 db.expenseApprovalDecision={findMany:async()=>decisions,create:async({data})=>{decisions.push(data);return data;}};
 assert.equal((await approvalState(db,7,1,20)).canApprove,true);
 assert.equal((await approvalState(db,7,1,10)).canApprove,false);
 policy.config.kind='LEAVE';assert.equal((await approvalState(db,7,1,20)).canApprove,false);policy.config.kind='EXPENSE';
 people[1].gradeId=1;assert.equal((await approvalState(db,7,1,20)).canApprove,false);people[1].gradeId=3;
 await approveExpense(db,7,20,1,1);assert.equal(decisions.length,1);assert.equal((await approvalState(db,7,1,30)).canApprove,true);
});
test('SQL allows only a snapshotted operator stage and keeps sequential, version and self-approval guards',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,"gradeId" INT);
 CREATE TABLE "ExpenseRequest"(id INT,"orgId" INT,version INT,"createdByEmployeeId" INT);
 CREATE TABLE "ExpenseRequestAudit"("orgId" INT,"requestId" INT,version INT,"afterSnapshot" JSONB);
 CREATE TABLE "ExpenseRequestApprovalStep"("orgId" INT,"requestId" INT,position INT,"employeeId" INT);
 CREATE TABLE "ExpenseApprovalDecision"("orgId" INT,"requestId" INT,version INT,position INT,"employeeId" INT,decision TEXT);
 CREATE TABLE "PartnerTransactionCost"(id TEXT,"expenseRequestId" INT);CREATE TABLE "BankLedgerEvidenceAllocation"("expenseItemId" TEXT,"entryId" TEXT);CREATE TABLE "BankLedgerEntry"(id TEXT,"voidedAt" TIMESTAMP);
 INSERT INTO "Employee" VALUES(10,7,'ACTIVE','OPERATOR',1),(20,7,'ACTIVE','OPERATOR',3),(30,7,'ACTIVE','ACCOUNTANT',2);
 INSERT INTO "ExpenseRequest" VALUES(1,7,1,10),(2,7,1,10);
 INSERT INTO "ExpenseRequestApprovalStep" VALUES(7,1,1,20),(7,1,2,30),(7,2,1,20);
 INSERT INTO "ExpenseRequestAudit" VALUES(7,1,1,'{"approvalPolicy":{"config":{"version":2,"kind":"EXPENSE"},"resolvedStages":[{"employeeId":20,"role":"OPERATOR","gradeId":3}]}}');`);
 const sql=readFileSync('backend/prisma/migrations/20261103140000_configurable_expense_approvals/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
 await db.exec(`CREATE TRIGGER "role_guard" BEFORE INSERT ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_expense_approval_role_guard();CREATE TRIGGER "sequence_guard" BEFORE INSERT ON "ExpenseApprovalDecision" FOR EACH ROW EXECUTE FUNCTION baro_expense_decision_guard();`);
 await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(7,1,1,2,30,'APPROVED')`));
 await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(7,2,1,1,20,'APPROVED')`));
 await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(7,1,2,1,20,'APPROVED')`));
 await db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES(7,1,1,1,20,'APPROVED'),(7,1,1,2,30,'APPROVED')`);
 assert.equal((await db.query('SELECT count(*)::int n FROM "ExpenseApprovalDecision"')).rows[0].n,2);
 }finally{await db.close();}
});
