import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';import {expenseCodeForLine} from '../frontend/src/utils/expenseRequest.mjs';
const require=createRequire(import.meta.url),{resolveExpenseCodeLink}=require('../backend/dist/services/expenseCodeLinkPolicy');
test('current settings replace old requirements while preserving populated references and production identity',async()=>{
 const settings={orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:['destination']};const code={baseId:4,base:{entryMode:'GENERAL',...settings}};
 const line={itemId:'old',workOrderId:5,inputSettings:{orderInput:'REQUIRED',requiredFields:['origin']}};
 const current=expenseCodeForLine(line,code);assert.equal(current.base.orderInput,'OPTIONAL');assert.deepEqual(current.base.requiredFields,['destination']);assert.equal(line.inputSettings.orderInput,'REQUIRED');
 const tx={expenseCodeLinkPolicy:{findUnique:async()=>({target:'NONE',auditId:2,inputSettings:settings})}};
 const resolved=await resolveExpenseCodeLink(tx,1,code,{cost:{workOrderId:5,linkTarget:'ORDER',linkPolicyAuditId:1}});assert.equal(resolved.linkPolicyAuditId,1);assert.equal(resolved.linkTarget,'ORDER');assert.equal(resolved.base.orderInput,'OPTIONAL');assert.deepEqual(resolved.base.requiredFields,['destination']);
 const production=expenseCodeForLine({...line,productionLinked:true},code);assert.equal(production.base.entryMode,'PROCESS');assert.equal(production.base.processInput,'REQUIRED');
});
test('SQL guard validates latest required fields on real document edits without rewriting original audit',async()=>{
 const f=await changeApprovalFixture();try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
 const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest'),{saveExpenseEditor,loadExpenseEditorSource,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
 await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{requiredFields:['reference','origin']}});
 const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-04-02',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'DOC',origin:'Old origin',evidenceFile:'receipt.pdf'}}]}));
 const audits=await db.expenseRequestAudit.findMany({where:{requestId:doc.id}});
 await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{requiredFields:['reference','destination']}});
 const form=expenseEditorForm(await loadExpenseEditorSource(db,org,'request',String(doc.id)));
 const payload={...form,clientKey:randomUUID(),items:form.items.map(item=>({...item,details:{...item.details,destination:'New destination'}}))};
 const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
 const reviewer=await db.employee.create({data:{orgId:org,name:'Reviewer',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}});
 const change=await requestChangeApproval(db,org,actor,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(doc.id),payload,selection:{changeAdminEmployeeId:reviewer.id},clientKey:randomUUID()});
 await decideChangeApproval(db,org,reviewer.id,change.id,{decision:'APPROVED'});
 const saved=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:doc.id}});assert.equal(saved.details.origin,'Old origin');assert.equal(saved.details.destination,'New destination');assert.equal(saved.linkPolicyAuditId,doc.items[0].linkPolicyAuditId);
 assert.deepEqual(await db.expenseRequestAudit.findMany({where:{requestId:doc.id,version:1}}),audits);
 const migration=readFileSync('backend/prisma/migrations/20261107030000_current_expense_inputs/migration.sql','utf8');await f.pg.exec(migration);
 }finally{await f.close()}
});
