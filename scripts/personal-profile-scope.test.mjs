import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {personalProfileEmployee}=require('../backend/dist/employees/personalProfile');

test('personal information resolves the current company employee, even with the same login in other companies',async()=>{
 const rows=[{id:1,orgId:1,status:'ACTIVE',phone:'Other company'},{id:125,orgId:1845,status:'ACTIVE',phone:'DEX contact'}];
 const db={employee:{findFirst:async({where})=>rows.find(row=>Object.entries(where).every(([key,value])=>row[key]===value))}};
 assert.equal((await personalProfileEmployee(db,{organization:{id:1845},employee:rows[1]})).phone,'DEX contact');
 for(const employee of [null,rows[0],{...rows[1],status:'INACTIVE'}])
  await assert.rejects(personalProfileEmployee(db,{organization:{id:1845},employee}),/ACTIVE_EMPLOYEE_REQUIRED/);
 rows[1].status='INACTIVE';
 await assert.rejects(personalProfileEmployee(db,{organization:{id:1845},employee:{id:125,orgId:1845,status:'ACTIVE'}}),/ACTIVE_EMPLOYEE_REQUIRED/);
});
