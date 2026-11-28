import {createHttpError} from '../utils/http';

export const loadEmployeeGrades=(db:any,orgId:number)=>db.employeeGradeSet.findMany({
  where:{orgId},
  include:{grades:{include:{_count:{select:{employees:true}}},orderBy:[{sortOrder:'asc'},{id:'asc'}]}},
  orderBy:{id:'asc'},
});

// Keep every employee's grade unchanged, including inactive/departed employees.
export async function deleteUnusedEmployeeGrade(db:any,orgId:number,gradeId:number){
  if(!Number.isSafeInteger(gradeId)||gradeId<=0)throw createHttpError(400,'INVALID_EMPLOYEE_GRADE');
  try{
    return await db.$transaction(async(tx:any)=>{
      const grade=await tx.employeeGrade.findFirst({where:{id:gradeId,orgId},include:{_count:{select:{employees:true}}}});
      if(!grade)throw createHttpError(404,'EMPLOYEE_GRADE_NOT_FOUND');
      if(grade.isDefault)throw createHttpError(409,'EMPLOYEE_GRADE_DEFAULT');
      if(grade._count.employees)throw createHttpError(409,'EMPLOYEE_GRADE_IN_USE');
      // Recheck in the DELETE itself. The real employee FK also protects an
      // assignment racing this deletion; never replace it with reassignment.
      const deleted=await tx.employeeGrade.deleteMany({where:{id:gradeId,orgId,isDefault:false,employees:{none:{}}}});
      if(deleted.count!==1)throw createHttpError(409,'EMPLOYEE_GRADE_CHANGED');
      return {ok:true};
    });
  }catch(error:any){
    if(error.code==='P2003')throw createHttpError(409,'EMPLOYEE_GRADE_IN_USE');
    throw error;
  }
}
