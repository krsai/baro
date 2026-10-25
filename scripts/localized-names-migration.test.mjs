import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('backend/prisma/migrations/20261025100000_localized_name_primary_english/migration.sql','utf8');
const tables=['ProcessMasterOption','Organization','Factory','Warehouse','EmployeeGrade','SalaryItem','AttrColor','AttrCategory','AttrProcess','PriorCompletionReason','OutsourcingServiceType','TransactionCode','SettingServiceDefault','PartnerRole','SettingTransactionCodeDefault','TransactionCodeBase','ExpenseType','TaxTreatment'];
test('name migration preserves translations and non-name values, and records recoverable aliases',async()=>{
 const db=new PGlite();try{
  for(const table of tables){
   const entity=['Organization','Factory','Warehouse'].includes(table);
   await db.exec(`CREATE TABLE "${table}"(id int PRIMARY KEY,${entity?'name text,':'"nameEn" text,name text,'}"nameKo" text,"nameVi" text, "ownerId" int NOT NULL,amount numeric NOT NULL);`);
   await db.query(`INSERT INTO "${table}"(id,${entity?'name':'"nameEn"'},"nameKo","nameVi","ownerId",amount${entity?'':',name'}) VALUES(1,'','한국어','Tiếng Việt',44,123.45${entity?'':",'Legacy alias'"}),(2,'','','Tiếng Việt',44,789.00${entity?'':",'Legacy alias'"}),(3,'English','한국어','Tiếng Việt',44,1.00${entity?'':",'Legacy alias'"})`);
  }
  await db.exec(sql);
  for(const table of tables){
   const entity=['Organization','Factory','Warehouse'].includes(table);
   const {rows}=await db.query(`SELECT * FROM "${table}" ORDER BY id`);
   assert.equal(rows[0][entity?'name':'nameEn'],'한국어');assert.equal(rows[1][entity?'name':'nameEn'],'Tiếng Việt');assert.equal(rows[2][entity?'name':'nameEn'],'English');
   assert.equal(rows[0].nameKo,'한국어');assert.equal(rows[0].nameVi,'Tiếng Việt');assert.equal(rows[2].name,'English');
   assert.ok(rows.every(row=>row.ownerId===44));assert.equal(Number(rows[0].amount),123.45);
  }
  const {rows}=await db.query('SELECT * FROM "LocalizedNameMigrationAudit"');assert.equal(rows.length,51);
  assert.ok(rows.some(row=>row.beforeNames.name==='Legacy alias'&&row.afterNames.name==='English'));
  await assert.rejects(db.exec('DELETE FROM "LocalizedNameMigrationAudit"'),/LOCALIZED_NAME_AUDIT_APPEND_ONLY/);
 }finally{await db.close();}
});
