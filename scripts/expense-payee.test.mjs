import test from 'node:test';
import assert from 'node:assert/strict';
import service from '../backend/dist/services/expensePayee.js';
const {expensePayeeIds,registerExpensePayeeRoutes}=service;

test('payee identity requires exactly one real positive company or employee ID',()=>{
 assert.deepEqual(expensePayeeIds({partnerOrgId:11}),{partnerOrgId:11});
 assert.deepEqual(expensePayeeIds({partnerOrgId:null,payeeEmployeeId:31}),{partnerOrgId:null,payeeEmployeeId:31});
 for(const input of [{},{partnerOrgId:11,payeeEmployeeId:31},{payeeEmployeeId:'31'},{payeeEmployeeId:-1},{partnerOrgId:0}])assert.throws(()=>expensePayeeIds(input),/INVALID_EXPENSE_REQUEST_HEADER/);
});

test('payee routes scope employee lookup and bank registration to the authenticated company and actor',async()=>{
 const routes=new Map(),accounts=[],employees=[{id:20,orgId:1,status:'ACTIVE',orgRole:'ACCOUNTANT',name:'Actor'},{id:31,orgId:1,status:'ACTIVE',orgRole:'WORKER',name:'Employee',employeeNo:'E031',bankAccountNumber:'payroll'},{id:32,orgId:2,status:'ACTIVE',orgRole:'WORKER',name:'Other company'}];let allowed=true;
 const db={
  employee:{findFirst:async({where})=>employees.find(row=>row.id===where.id&&row.orgId===where.orgId&&row.status===where.status&&(!where.orgRole||where.orgRole.in.includes(row.orgRole)))||null,findMany:async({where})=>employees.filter(row=>row.orgId===where.orgId&&row.status===where.status)},
  organization:{findMany:async({where})=>{assert.equal(where.ownerOrgId,1);return [{id:11,name:'Vendor',code:null,type:'MATERIAL_SUPPLIER',isActive:true,outsourcingServiceAssignments:[]}];}},
  employeeExpenseBankAccount:{findMany:async({where})=>accounts.filter(row=>row.orgId===where.orgId&&row.employeeId===where.employeeId),findFirst:async({where})=>accounts.find(row=>Object.entries(where).every(([key,value])=>row[key]===value))||null,create:async({data})=>{const row={id:'bank-1',...data};accounts.push(row);return row;}},
  $queryRawUnsafe:async()=>[],
 };
 db.$transaction=async(run,options)=>{assert.equal(options.isolationLevel,'Serializable');return run(db);};
 registerExpensePayeeRoutes({get:(path,handler)=>routes.set('GET '+path,handler),post:(path,handler)=>routes.set('POST '+path,handler)},db,{requireOrgRole:async(_req,_res,options)=>{if(options.allowedRoles.length===2)assert.deepEqual(options.allowedRoles,['ADMIN','ACCOUNTANT']);return allowed?{organization:{id:1}}:null;},actorId:()=>20});
 const response=()=>({json(value){this.value=value;}}),req={params:{id:'31'},query:{orgId:2},body:{orgId:2,employeeId:32,createdByEmployeeId:32,currencyCode:'USD',bankName:'Bank',accountNumber:'new-expense-bank',accountHolder:'Employee'}};
 let res=response();await routes.get('GET /expense-payees')({},res);assert.equal(res.value.some(row=>row.employeeId===32),false);assert.equal(res.value.find(row=>row.employeeId===31).id,'EMP:31');assert.equal(res.value[0].code,null);
 res=response();await routes.get('POST /expense-payees/employees/:id/bank-accounts')(req,res);assert.equal(res.value.orgId,1);assert.equal(res.value.employeeId,31);assert.equal(res.value.createdByEmployeeId,20);assert.equal(employees[1].bankAccountNumber,'payroll');
 await routes.get('POST /expense-payees/employees/:id/bank-accounts')(req,response());assert.equal(accounts.length,1);
 await assert.rejects(routes.get('GET /expense-payees/employees/:id/bank-accounts')({...req,params:{id:'32'}},response()),/INVALID_EXPENSE_EMPLOYEE/);
 await assert.rejects(routes.get('POST /expense-payees/employees/:id/bank-accounts')({...req,body:{...req.body,currencyCode:'EUR'}},response()),/INVALID_EMPLOYEE_BANK_ACCOUNT/);
 allowed=false;res=response();await routes.get('GET /expense-payees')({},res);assert.equal(res.value,undefined);
});
