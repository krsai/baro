const {test}=require('node:test');
const assert=require('node:assert/strict');
const {employeeCodePlan}=require('../backend/scripts/employee-code-plan.cjs');
test('prefix change preserves sequence and IDs, including inactive employees, and leaves current codes alone',()=>{
 const plan=employeeCodePlan({id:1,code:'BARO'},[{id:1,employeeNo:'BRVN0001'},{id:2,employeeNo:'BRVN0027',status:'INACTIVE'},{id:3,employeeNo:'BARO0028'},{id:4,employeeNo:null}],'BRVN');
 assert.deepEqual(plan.changes,[{id:1,before:'BRVN0001',after:'BARO0001'},{id:2,before:'BRVN0027',after:'BARO0027'}]);
});
test('collision detection is independent of employee order and case',()=>{
 for(const rows of [[{id:1,employeeNo:'BRVN0001'},{id:2,employeeNo:'BARO0001'}],[{id:2,employeeNo:'baro0001'},{id:1,employeeNo:'BRVN0001'}]])assert.throws(()=>employeeCodePlan({id:1,code:'BARO'},rows,'BRVN'),/COLLISION/);
});
test('malformed historical numbers stop the plan rather than guessing sequences',()=>assert.throws(()=>employeeCodePlan({id:1,code:'BARO'},[{id:1,employeeNo:'BRVN10000'}],'BRVN'),/REVIEW_REQUIRED/));
