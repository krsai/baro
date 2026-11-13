import {canSkipApprovalStage} from './approvalStageAuthority';
import {createHttpError} from '../utils/http';

// Older saved rule policies may still use exact grades without authorityVersion.
// Check the real company roster before excluding the drafter or selected people.
export async function hasApprovalGradeVacancy(db:any,orgId:number,ordered:any[]){
 for(const stage of ordered){
  if(!stage.gradeId||stage.gradeMatch==='ANY')continue;
  const grade=await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}});
  if(!grade)continue;
  const people=await (db.authorityEmployee||db.employee).findMany({where:{orgId,status:'ACTIVE',orgRole:stage.role,gradeId:stage.gradeId,grade:{orgId,setId:grade.setId,isActive:true,set:{isActive:true}}},select:{id:true}});
  if(!people.length){
   const higher=await (db.authorityEmployee||db.employee).findMany({where:{orgId,status:'ACTIVE',orgRole:stage.role,grade:{orgId,setId:grade.setId,sortOrder:{gt:grade.sortOrder},isActive:true,set:{isActive:true}}},select:{id:true}});
   if(higher.length)return true;
  }
 }
 return false;
}

// Resolve only new policies. Issued documents keep their employee/grade snapshot.
export async function flexibleApprovalStages(db:any,orgId:number,drafter:any,ordered:any[],selection:any,allowIncomplete:boolean){
 const pools=[];
 for(const stage of ordered){
  const grade=stage.gradeId?await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}}):null;
  const pool=stage.gradeId&&!grade?[]:await (db.authorityEmployee||db.employee).findMany({where:{orgId,status:'ACTIVE',orgRole:stage.role,...(grade?{grade:{orgId,setId:grade.setId,isActive:true,set:{isActive:true}}}:{})},select:{id:true,name:true,gradeId:true,grade:{include:{set:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
  pools.push({stage,grade,pool,eligible:grade?pool.filter((p:any)=>p.grade.sortOrder>=grade.sortOrder):pool});
 }
 const final=pools[pools.length-1]!;let vacancy:any=null;
 // Vacancy is company-wide, not caused by excluding the drafter or a selection.
 if(final?.grade&&!final.eligible.length&&final.pool.length){
  const rank=Math.max(...final.pool.map((p:any)=>p.grade.sortOrder));
  final.eligible=final.pool.filter((p:any)=>p.grade.sortOrder===rank);
  vacancy={requestedGradeId:final.grade.id,effectiveGradeId:final.eligible[0].gradeId,reason:'NO_ACTIVE_AT_OR_ABOVE'};
 }
 if(final?.eligible.some((person:any)=>person.id===drafter.id))return {ids:[],stages:[],complete:true,policy:{exempt:true,exemptionReason:'FINAL_DRAFTER',finalDrafterStage:final.stage,resolvedStages:[],effectiveRegistrationStages:[],skipped:ordered.map((_,index)=>'step'+(index+1)),...(vacancy?{vacancy}:{})}};
 const finalCandidates=final?.eligible.filter((p:any)=>p.id!==drafter.id)||[];
 const reserved=finalCandidates.length===1?finalCandidates[0].id:null;
 const ids:number[]=[],stages:any[]=[],resolvedStages:any[]=[],effectiveRegistrationStages:any[]=[],skipped:string[]=[];
 let complete=true;
 for(const [index,row] of pools.entries()){
  const last=index===pools.length-1,key='step'+(index+1),stage=row.stage;
  if(!last&&await canSkipApprovalStage(db,orgId,drafter,stage,false)){skipped.push(key);continue;}
  if(!last&&vacancy&&stage.role===final.stage.role&&(!row.grade||row.grade.setId===final.grade.setId&&row.grade.sortOrder>=final.eligible[0].grade.sortOrder)){skipped.push(key);continue;}
  const candidates=row.eligible.filter((p:any)=>p.id!==drafter.id&&!db.excludedApprovalIds?.includes(p.id)&&!ids.includes(p.id)&&(last||p.id!==reserved));
  if(!last&&!candidates.length&&row.eligible.some((p:any)=>p.id===reserved)&&stage.role===final.stage.role){skipped.push(key);continue;}
  const employeeId=selection?.[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null),chosen=candidates.find((p:any)=>p.id===employeeId);
  if(!chosen){complete=false;if(!allowIncomplete)throw createHttpError(400,employeeId?'INVALID_EXPENSE_APPROVERS':'EXPENSE_APPROVER_REQUIRED');}
  else {ids.push(chosen.id);resolvedStages.push({employeeId:chosen.id,role:stage.role,gradeId:chosen.gradeId});}
  const effectiveGrade=last&&vacancy?final.eligible[0].grade:row.grade;
  effectiveRegistrationStages.push({role:stage.role,gradeId:effectiveGrade?.id||null,gradeMatch:effectiveGrade?'MINIMUM':'ANY'});
  stages.push({key,role:stage.role,gradeId:null,minimumGradeId:effectiveGrade?.id||null,gradeMatch:effectiveGrade?'MINIMUM':'ANY',requiredGrade:effectiveGrade,employeeId:chosen?.id||null,name:chosen?.name,candidates,invalid:!!employeeId&&!chosen,...(last&&vacancy?{vacancy}: {})});
 }
 return {ids,stages,complete,policy:{exempt:false,resolvedStages,effectiveRegistrationStages,skipped,...(vacancy?{vacancy}: {})}};
}
