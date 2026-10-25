import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {missingSchema,columns,constraints}=require('../backend/scripts/railway-schema-preflight.js');
const migration=readFileSync('backend/prisma/migrations/20261025160000_pay_type_constraints/migration.sql','utf8');

test('fixed-production salary rates fail under legacy constraints and succeed after schema-only repair; existing amounts remain identical',async()=>{
 const db=new PGlite();const tables=['SalaryItemRate','EmployeeCompensationPolicy','EmployeePayTypePolicy'];
 try{
  await db.exec(tables.map(t=>`CREATE TABLE "${t}"(id INT PRIMARY KEY,"payType" TEXT NOT NULL,amount INT,CONSTRAINT "${t}_payType_check" CHECK("payType" IN ('GENERAL','OUTPUT'))); INSERT INTO "${t}" VALUES(1,'GENERAL',20000),(2,'OUTPUT',30000);`).join('\n'));
  await assert.rejects(db.exec(`INSERT INTO "SalaryItemRate" VALUES(3,'OUTPUT_FIXED',20000)`),/SalaryItemRate_payType_check/);
  const before=await Promise.all(tables.map(t=>db.query(`SELECT * FROM "${t}" ORDER BY id`)));
  await db.exec(migration);await db.exec(migration);
  for(let i=0;i<tables.length;i++){
   const t=tables[i];assert.deepEqual((await db.query(`SELECT * FROM "${t}" ORDER BY id`)).rows,before[i].rows);
   await db.exec(`INSERT INTO "${t}" VALUES(3,'OUTPUT_FIXED',20000)`);
   await assert.rejects(db.exec(`INSERT INTO "${t}" VALUES(4,'INVALID',20000)`),new RegExp(t+'_payType_check'));
  }
 }finally{await db.close();}
});

test('deployment detects an old constraint definition even when its name already exists',async()=>{
 let fixed=false;
 const db={$queryRawUnsafe:async sql=>sql.includes('information_schema')?columns.map(([table_name,column_name])=>({table_name,column_name})):constraints.map(name=>({name,definition:name==='TransactionCost_style_scope_fkey'?'REFERENCES "Style"(id, "orgId")':name.endsWith('_payType_check')?(fixed?'GENERAL OUTPUT_FIXED OUTPUT':'GENERAL OUTPUT'):undefined}))};
 const missing=await missingSchema(db);
 assert.deepEqual(missing.sort(),['EmployeeCompensationPolicy_payType_check:OUTPUT_FIXED','EmployeePayTypePolicy_payType_check:OUTPUT_FIXED','SalaryItemRate_payType_check:OUTPUT_FIXED'].sort());
 fixed=true;assert.deepEqual(await missingSchema(db),[]);
});
