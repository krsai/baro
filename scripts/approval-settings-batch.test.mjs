import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveApprovalActionBatch,approvalActionKey}=require('../backend/dist/services/approvalActions');
test('approval changes save atomically with real company membership, per-policy revisions and untouched inherited policies',async()=>{
 const fixture=await changeApprovalFixture();try{
  const db=fixture.db,seed=await seedChangeApproval(db),orgId=seed.company.id,actor=seed.people.admin.id;
  const expenseKey=approvalActionKey(orgId,'EXPENSE','CREATE'),ledgerKey=approvalActionKey(orgId,'BANK_LEDGER','CREATE');
  const expense={...seed.config,kind:'EXPENSE',revision:0,rules:[],drafterScope:{role:'ALL',gradeId:null}};
  const ledger={revision:0,registrationStages:[{role:'ACCOUNTANT',gradeMatch:'ANY',gradeId:null},{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:seed.people.senior.gradeId}]};
  const changes=[{menu:'EXPENSE',operation:'CREATE',settings:expense},{menu:'BANK_LEDGER',operation:'CREATE',settings:ledger}];
  const original=await db.systemSetting.findUnique({where:{key:expenseKey}});
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,[changes[0],{...changes[1],settings:{...ledger,revision:9}}]),/APPROVAL_SETTINGS_CHANGED/);
  assert.deepEqual(await db.systemSetting.findUnique({where:{key:expenseKey}}),original);assert.equal(await db.systemSetting.findUnique({where:{key:ledgerKey}}),null);
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,[changes[0],{...changes[1],settings:{...ledger,registrationStages:[{role:'ACCOUNTANT',gradeMatch:'EXACT',gradeId:-1}]}}]),/INVALID_APPROVAL_RULE/);
  await assert.rejects(saveApprovalActionBatch(db,orgId,seed.people.junior.id,changes),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(saveApprovalActionBatch(db,seed.other.id,actor,changes),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,[changes[0],changes[0]]),/INVALID_APPROVAL_SUBJECT/);
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,[{settings:expense}]),/INVALID_APPROVAL_SUBJECT/);
  await fixture.pg.exec(`CREATE FUNCTION reject_approval_batch_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key='${ledgerKey}' THEN RAISE EXCEPTION 'TEST_WRITE_FAILURE'; END IF; RETURN NEW; END $$;CREATE TRIGGER reject_approval_batch_test BEFORE INSERT OR UPDATE ON "SystemSetting" FOR EACH ROW EXECUTE FUNCTION reject_approval_batch_test();`);
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,changes),/TEST_WRITE_FAILURE/);
  assert.deepEqual(await db.systemSetting.findUnique({where:{key:expenseKey}}),original);assert.equal(await db.systemSetting.findUnique({where:{key:ledgerKey}}),null);
  await fixture.pg.exec('DROP TRIGGER reject_approval_batch_test ON "SystemSetting";DROP FUNCTION reject_approval_batch_test();');
  const saved=await saveApprovalActionBatch(db,orgId,actor,changes);assert.deepEqual(saved.map(row=>row.settings.revision),[1,1]);
  assert.equal(saved[0].settings.seniorGradeId,seed.config.seniorGradeId);assert.equal(saved[0].settings.leadGradeId,seed.config.leadGradeId);
  assert.equal(await db.systemSetting.findUnique({where:{key:approvalActionKey(orgId,'BANK_LEDGER','DELETE')}}),null);
  await assert.rejects(saveApprovalActionBatch(db,orgId,actor,changes),/APPROVAL_SETTINGS_CHANGED/);
  assert.equal((await db.systemSetting.findUnique({where:{key:expenseKey}})).value.revision,1);
 }finally{await fixture.close();}
});
