import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readPayeeAccounts,requirePayeeBankAccount,saveEntityBankAccount,registerEntityBankRoutes}=require('../backend/dist/services/entityBankAccount');
test('linked SaaS payment accounts stay current, satisfy expense validation, and expose no ledger data or cross-company writes',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,source=s.other.id,actor=s.people.admin.id;
  await db.organization.update({where:{id:source},data:{businessNumber:'123456'}});
  await db.organization.update({where:{id:s.vendor.id},data:{country:'VN',businessNumber:'123456'}});
  const gradeSet=await db.employeeGradeSet.create({data:{orgId:source,code:'SOURCE',name:'Source grades'}});
  const grade=await db.employeeGrade.create({data:{orgId:source,setId:gradeSet.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:1}});
  const sourceAdmin=await db.employee.create({data:{orgId:source,gradeId:grade.id,name:'Source administrator',email:'source@example.test',orgRole:'ADMIN',status:'ACTIVE'}});
  await db.companyPartnerLink.create({data:{orgId:org,entityId:s.vendor.id,targetOrgId:source,createdByEmployeeId:actor,matchMethod:'SELECTED'}});
  assert.deepEqual((await readPayeeAccounts(db,org,s.vendor.id)).accounts,[],'stale local bank is not used for a SaaS company');
  await assert.rejects(requirePayeeBankAccount(db,org,s.vendor.id),/PAYEE_BANK_ACCOUNT_REQUIRED/);
  const bank={accountKind:'BANK',displayName:'Main receiving account',bankName:'MB',accountNumber:'001234',accountHolder:'BARO GARMENT',currencyId:s.currency.id};
  const saved=await saveEntityBankAccount(db,source,sourceAdmin.id,source,null,bank);
  await saveEntityBankAccount(db,source,sourceAdmin.id,source,null,{accountKind:'CASH',displayName:'Private cash',currencyId:s.currency.id});
  const read=await readPayeeAccounts(db,org,s.vendor.id);assert.equal(read.canEditAccounts,false);assert.equal(read.accounts.length,1);assert.equal(read.accounts[0].id,saved.id);assert.equal(read.accounts[0].accountNumber,'001234');assert.deepEqual(read.accounts[0].ledgerAccounts,[]);
  for(const field of ['orgId','entityId','createdByEmployeeId','updatedByEmployeeId','openingBalance','currentBalance'])assert.equal(field in read.accounts[0],false);
  await requirePayeeBankAccount(db,org,s.vendor.id);
  await db.organizationBankAccount.delete({where:{id:s.payee.id}});
  // Exercise the real deferred bank guard separately from unrelated document
  // numbering, approval and edit-context guards.
  await f.pg.exec(`CREATE TEMP TABLE payment_guard_probe(id INT,"orgId" INT,"partnerOrgId" INT,"payeeEmployeeId" INT);
   CREATE CONSTRAINT TRIGGER payment_guard_check AFTER INSERT ON payment_guard_probe DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_payee_bank_guard();
   INSERT INTO payment_guard_probe VALUES(-100,${org},${s.vendor.id},NULL);`);
  await saveEntityBankAccount(db,source,sourceAdmin.id,source,saved.id,{...bank,accountNumber:'009876'});
  assert.equal((await readPayeeAccounts(db,org,s.vendor.id)).accounts[0].accountNumber,'009876');
  await assert.rejects(saveEntityBankAccount(db,org,actor,s.vendor.id,saved.id,bank),/LINKED_BANK_ACCOUNT_READ_ONLY/);
  await assert.rejects(saveEntityBankAccount(db,org,actor,s.vendor.id,null,bank),/LINKED_BANK_ACCOUNT_READ_ONLY/);
  const outsider=await db.organization.create({data:{name:'Unrelated',type:'SERVICE'}});
  await assert.rejects(readPayeeAccounts(db,outsider.id,s.vendor.id),/ENTITY_NOT_FOUND/);
  const routes=new Map();registerEntityBankRoutes(Object.fromEntries(['get','put','post'].map(method=>[method,(path,fn)=>routes.set(method+path,fn)])),db,{requireOrgRole:async()=>({organization:{id:org,type:'SERVICE'},employee:{orgRole:'ADMIN'}}),getActor:()=>actor,loadPolicy:async()=>({policy:{SERVICE:{ADMIN:['BANK_LEDGER']}}})});
  let result;await routes.get('get/entities/:entityId/bank-accounts')({params:{entityId:s.vendor.id}},{json:value=>{result=value;}});assert.equal(result.canLedger,false);assert.equal(result.canEditAccounts,false);
  await assert.rejects(routes.get('put/entities/:entityId/bank-accounts/order')({params:{entityId:s.vendor.id},body:{ids:[saved.id],revision:result.revision}},{json:()=>{}}),/LINKED_BANK_ACCOUNT_READ_ONLY/);
  // Resolve the same source through the common identity link as well.
  const identity=await db.companyIdentity.create({data:{anchorEntityId:source,code:'OTHR',name:'Source',country:'VN',businessNumber:'123456'}});
  await db.companyIdentityLink.create({data:{orgId:org,entityId:s.vendor.id,identityId:identity.id,createdByEmployeeId:actor}});
  assert.equal((await readPayeeAccounts(db,org,s.vendor.id)).accounts[0].accountNumber,'009876');
 }finally{await f.close();}
});
