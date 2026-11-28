import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {prismaPGlite} from './helpers/prisma-pglite.mjs';
const require=createRequire(import.meta.url),{loadEmployeeGrades,deleteUnusedEmployeeGrade:remove}=require('../backend/dist/employees/employeeGrades');

test('grade deletion preserves employee assignments and company boundaries with actual Prisma and SQL FKs',async t=>{
 const schema=execFileSync(process.execPath,[path.resolve('backend/node_modules/prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel',path.resolve('backend/prisma/schema.prisma'),'--script'],{encoding:'utf8',env:{...process.env,DIRECT_URL:'postgresql://test:local@127.0.0.1:5432/test'},maxBuffer:20*1024*1024});
 const f=await prismaPGlite(),db=f.db;
 try{
  await f.pg.exec(schema);
  const org=await db.organization.create({data:{name:'Grade test',type:'MANUFACTURER',country:'VN'}}),other=await db.organization.create({data:{name:'Other',type:'MANUFACTURER',country:'VN'}});
  const set=await db.employeeGradeSet.create({data:{orgId:org.id,code:'TEST',name:'Grades'}}),otherSet=await db.employeeGradeSet.create({data:{orgId:other.id,code:'TEST',name:'Grades'}});
  let sequence=0;
  const grade=(code,extra={},company=org,group=set)=>db.employeeGrade.create({data:{orgId:company.id,setId:group.id,code,name:code,nameKo:code,nameEn:code,nameVi:code,sortOrder:++sequence,...extra}});
  const base=await grade('DEFAULT',{isDefault:true}),used=await grade('USED'),retired=await grade('RETIRED'),free=await grade('FREE'),foreign=await grade('OTHER',{},other,otherSet);
  await db.employee.create({data:{orgId:org.id,name:'Active',gradeId:used.id,status:'ACTIVE'}});
  await db.employee.create({data:{orgId:org.id,name:'Terminated',gradeId:retired.id,status:'TERMINATED'}});
  const employees=await db.employee.findMany({orderBy:{id:'asc'}});
  await t.test('usage includes departed employees and lists only this company',async()=>{
   const sets=await loadEmployeeGrades(db,org.id);assert.equal(sets.length,1);
   assert.equal(sets[0].grades.find(g=>g.id===used.id)._count.employees,1);
   assert.equal(sets[0].grades.find(g=>g.id===retired.id)._count.employees,1);
   assert.equal(sets[0].grades.some(g=>g.id===foreign.id),false);
  });
  await t.test('used and default grades cannot be deleted or reassign anyone',async()=>{
   for(const id of [used.id,retired.id])await assert.rejects(remove(db,org.id,id),e=>e.status===409&&e.message==='EMPLOYEE_GRADE_IN_USE');
   await assert.rejects(remove(db,org.id,base.id),e=>e.status===409&&e.message==='EMPLOYEE_GRADE_DEFAULT');
   assert.deepEqual(await db.employee.findMany({orderBy:{id:'asc'}}),employees);
  });
  await t.test('foreign and malformed grade IDs cannot delete any grade',async()=>{
   await assert.rejects(remove(db,org.id,foreign.id),e=>e.status===404);
   for(const id of [0,-1,NaN,1.2])await assert.rejects(remove(db,org.id,id),e=>e.status===400);
   assert.ok(await db.employeeGrade.findUnique({where:{id:foreign.id}}));
  });
  await t.test('a stale unused check cannot bypass the atomic employee relation guard',async()=>{
   const race=await grade('RACE');
   const racing={$transaction:fn=>db.$transaction(tx=>fn({employeeGrade:{findFirst:args=>tx.employeeGrade.findFirst(args),deleteMany:async args=>{await tx.employee.create({data:{orgId:org.id,name:'Assigned during delete',gradeId:race.id}});return tx.employeeGrade.deleteMany(args);}}}))};
   await assert.rejects(remove(racing,org.id,race.id),e=>e.status===409&&e.message==='EMPLOYEE_GRADE_CHANGED');
   assert.ok(await db.employeeGrade.findUnique({where:{id:race.id}}));
   assert.deepEqual(await db.employee.findMany({orderBy:{id:'asc'}}),employees);
  });
  await t.test('the real FK rejects direct deletion of an employee grade',async()=>{
   await assert.rejects(db.employeeGrade.delete({where:{id:used.id}}),e=>e.code==='P2003');
   assert.deepEqual(await db.employee.findMany({orderBy:{id:'asc'}}),employees);
  });
  await t.test('only an unused company grade is removed without touching employees',async()=>{
   assert.deepEqual(await remove(db,org.id,free.id),{ok:true});
   assert.equal(await db.employeeGrade.findUnique({where:{id:free.id}}),null);
   assert.deepEqual(await db.employee.findMany({orderBy:{id:'asc'}}),employees);
  });
 }finally{await f.close();}
});
