import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {prismaPGlite} from './prisma-pglite.mjs';
const require=createRequire(import.meta.url);
let schema;
export async function changeApprovalFixture(){
 schema??=execFileSync(process.execPath,[path.resolve('backend/node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel',path.resolve('backend/prisma/schema.prisma'),'--script'],{encoding:'utf8',env:{...process.env,DIRECT_URL:'postgresql://test:local@127.0.0.1:5432/test'},maxBuffer:20*1024*1024});
 const f=await prismaPGlite();try{
  await f.pg.exec(schema);
  await f.pg.exec(require('../../backend/scripts/migrate-expenses').migrationSql());
  // The generated empty schema already has FKs added unconditionally by some
  // historical rollout steps. Start those steps from their original FK state.
  for(const migration of require('../../backend/scripts/migrate-entity-profiles').migrations()){
   for(const match of migration.sql.matchAll(/CREATE TABLE "([^"]+)"/g))await f.pg.exec(`DROP TABLE IF EXISTS "${match[1]}" CASCADE`);
   for(const match of migration.sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g))await f.pg.exec(`DROP INDEX IF EXISTS "${match[1]}"`);
   for(const match of migration.sql.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/g))await f.pg.exec(`ALTER TABLE IF EXISTS "${match[1]}" DROP CONSTRAINT IF EXISTS "${match[2]}"`);
   await f.pg.exec(migration.sql);
  }
  return f;
 }catch(e){await f.close();throw e;}
}
export async function seedChangeApproval(db){
 const company=await db.organization.create({data:{name:'Service company',code:'TEST',type:'SERVICE',country:'VN'}});
 const other=await db.organization.create({data:{name:'Other company',code:'OTHR',type:'SERVICE',country:'VN'}});
 const set=await db.employeeGradeSet.create({data:{orgId:company.id,code:'TEST',name:'Grades'}}),people={};
 for(const [key,role,code] of [['junior','ACCOUNTANT','CL1'],['senior','ACCOUNTANT','CL2'],['lead','ACCOUNTANT','CL3'],['admin','ADMIN','ADMIN']]){
  const grade=await db.employeeGrade.create({data:{orgId:company.id,setId:set.id,code,name:code,nameKo:code,nameEn:code,nameVi:code,sortOrder:Object.keys(people).length}});
  people[key]=await db.employee.create({data:{orgId:company.id,name:key,email:key+'@example.test',orgRole:role,gradeId:grade.id,status:'ACTIVE'}});
 }
 const currency=await db.currency.upsert({where:{code:'USD'},create:{code:'USD',name:'US dollar'},update:{}});
 const vendor=await db.organization.create({data:{name:'Vendor',type:'LOGISTICS_PROVIDER',ownerOrgId:company.id}});
 const bankData={orgId:company.id,currencyId:currency.id,bankName:'Bank',accountNumber:'001',accountHolder:'Company',createdByEmployeeId:people.admin.id,updatedByEmployeeId:people.admin.id};
 const own=await db.organizationBankAccount.create({data:{...bankData,entityId:company.id}}),payee=await db.organizationBankAccount.create({data:{...bankData,entityId:vendor.id}});
 const account=await db.bankLedgerAccount.create({data:{orgId:company.id,entityAccountId:own.id,clientKey:crypto.randomUUID(),bankName:'Bank',accountNumber:'001',accountHolder:'Company',currencyCode:'USD',openingDate:'0001-01-01',openingBalance:'0',createdBy:'admin@example.test'}});
 const names={nameKo:'Test',nameEn:'Test',nameVi:'Test'};
 const role=await db.partnerRole.upsert({where:{code:'MATERIAL_SUPPLIER'},create:{code:'MATERIAL_SUPPLIER',...names},update:{}});
 const expenseType=await db.expenseType.upsert({where:{code:'GENERAL'},create:{code:'GENERAL',entryMode:'GENERAL',...names},update:{}});
 const source=await db.settingServiceDefault.create({data:{code:'CHANGE_TEST',...names,entryMode:'GENERAL',partnerRoleId:role.id}});
 const base=await db.transactionCodeBase.create({data:{code:'TST',...names,entryMode:'GENERAL',serviceTypeId:source.id,expenseTypeId:expenseType.id}});
 const tax=await db.taxTreatment.findFirst({where:{suffix:'E'}})||await db.taxTreatment.create({data:{id:99,code:'EXEMPT',suffix:'E',...names}});
 const variant=await db.settingTransactionCodeDefault.create({data:{code:'TSTE',...names,serviceTypeId:source.id,baseId:base.id,taxTreatmentId:tax.id}});
 const local=await db.outsourcingServiceType.create({data:{ownerOrgId:company.id,systemDefaultId:source.id,code:'CHANGE_TEST',...names,entryMode:'GENERAL'}});
 const code=await db.transactionCode.create({data:{ownerOrgId:company.id,serviceTypeId:local.id,code:'TSTE',...names,baseId:base.id,systemDefaultId:variant.id,taxTreatmentId:tax.id}});
 const config={...require('../../backend/dist/services/expenseApproval').defaultApprovalSettings(),seniorGradeId:people.senior.gradeId,leadGradeId:people.lead.gradeId};
 await db.systemSetting.create({data:{key:'EXPENSE_APPROVAL_POLICY:'+company.id,value:config}});
 return {company,other,people,currency,vendor,own,payee,account,code,config};
}
