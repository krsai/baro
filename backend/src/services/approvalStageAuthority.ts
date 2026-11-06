// Authority can skip an intermediate stage, never the final independent approval.
// Roles and active company grade sets must agree; names/codes imply no authority.
export async function canSkipApprovalStage(db:any,orgId:number,drafter:any,stage:any,final:boolean){
 if(final||drafter.orgRole!==stage.role)return false;
 const own=await db.employee.findFirst({where:{id:drafter.id,orgId,status:'ACTIVE',orgRole:stage.role},include:{grade:{include:{set:true}}}});
 if(!own?.grade?.isActive||!own.grade.set?.isActive)return false;
 if(stage.gradeMatch==='ANY'||stage.role==='ADMIN'&&!stage.gradeId)return true;
 if(!stage.gradeId)return false;
 const grade=await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}});
 return !!grade&&own.grade.setId===grade.setId&&own.grade.sortOrder>=grade.sortOrder;
}
