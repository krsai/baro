import {createHttpError} from '../utils/http';
import {loadManagementPeriod,assertManagedDate,normalizeFactoryManagementStartDateKey} from '../factories/factoryManagementStart';
import {payrollManagementInclude,resolvePayrollManagement} from '../employees/payrollManagement';

const automaticNotes={
 clockIn:['출근 기록 없음 → 08:00 출근 자동 생성','Missing clock-in → 08:00 clock-in auto-filled','Thiếu giờ vào → tự động bổ sung giờ vào 08:00'],
 clockOut:['퇴근 기록 없음 → 17:00 퇴근 자동 생성','Missing clock-out → 17:00 clock-out auto-filled','Thiếu giờ ra → tự động bổ sung giờ ra 17:00'],
};
const autoSide=(line:string)=>Object.keys(automaticNotes).find(side=>(automaticNotes as any)[side].some((suffix:string)=>line.endsWith(': '+suffix)));
export function mergeAttendancePunches(old:any,incoming:any){
 const oldNotes=String(old?.note||'').split('\n').filter(Boolean),newNotes=String(incoming.note||'').split('\n').filter(Boolean);
 const notes=[...oldNotes,...newNotes].filter(line=>!autoSide(line)),result:any={workerId:incoming.workerId};
 for(const side of ['clockIn','clockOut']){
  const oldAuto=oldNotes.find(line=>autoSide(line)===side),newAuto=newNotes.find(line=>autoSide(line)===side);
  const keep=!incoming[side]||Boolean(newAuto&&old?.[side]&&!oldAuto);
  result[side]=(keep?old?.[side]:incoming[side])||null;
  const note=keep?oldAuto:newAuto;if(note)notes.push(note);
 }
 result.note=[...new Set(notes)].join('\n')||null;
 return result;
}

// One confirmed file is one transaction. No day-by-day HTTP writes or partial success.
export async function importAttendanceFile(db:any,orgId:number,actorId:number,body:any,normalizeEntries:(value:any)=>any,employmentDate:(value:any)=>string){
 const fail=(status:number,message:string):never=>{throw createHttpError(status,message)};
 const factoryId=body?.factoryId,days=body?.dailyEntries;
 if(!Number.isSafeInteger(factoryId)||factoryId<=0||!Number.isSafeInteger(actorId)||actorId<=0)return fail(400,'INVALID_ATTENDANCE_IMPORT');
 if(!Array.isArray(days)||!days.length||days.length>366)return fail(400,'INVALID_ATTENDANCE_IMPORT');
 const seen=new Set<string>();let count=0;
 const normalized=days.map((day:any)=>{
  const date=normalizeFactoryManagementStartDateKey(day?.workDate);
  if(!date||date!==day.workDate||seen.has(date)||!Array.isArray(day.entries)||!day.entries.length)return fail(400,'INVALID_ATTENDANCE_IMPORT');
  seen.add(date);count+=day.entries.length;if(count>20000)return fail(400,'INVALID_ATTENDANCE_IMPORT');
  const result=normalizeEntries(day.entries);
  if(result.invalidWorkerEntryIndex>=0||result.invalidClockInEntryIndex>=0||result.invalidClockOutEntryIndex>=0||result.duplicateWorkerId!==null||result.rows.length!==day.entries.length)return fail(400,'INVALID_ATTENDANCE_IMPORT');
  return {workDate:date,entries:result.rows};
 });
 return db.$transaction(async(tx:any)=>{
  // Serialize file imports for this factory, including absent attendance rows.
  const locked=await tx.$queryRawUnsafe('SELECT id FROM "Factory" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',factoryId,orgId);
  if(!locked.length)return fail(404,'FACTORY_NOT_FOUND');
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}});
  if(!actor)return fail(403,'FORBIDDEN');
  const period=await loadManagementPeriod(tx,orgId,factoryId);
  const workerIds=[...new Set(normalized.flatMap(day=>day.entries.map((row:any)=>row.workerId)))];
  const workers=await tx.employee.findMany({where:{orgId,factoryId,id:{in:workerIds}},include:{payrollManagementVersions:payrollManagementInclude}});
  const byWorker=new Map<number,any>(workers.map((worker:any)=>[worker.id,worker]));
  for(const day of normalized){
   assertManagedDate(day.workDate,period.startDate);
   for(const row of day.entries){
    const employee=byWorker.get(row.workerId);if(!employee)return fail(400,'INVALID_ATTENDANCE_WORKER');
    const policy=resolvePayrollManagement(employee,day.workDate.slice(0,7));
    if(policy.alwaysFullAttendance||policy.payrollExcluded)return fail(409,'ATTENDANCE_MANAGEMENT_EXCLUDED');
    const joined=employmentDate(employee.joinedAt),left=employmentDate(employee.leftAt);
    if(!['ACTIVE','TERMINATED','SUSPENDED'].includes(employee.status)||employee.status==='TERMINATED'&&!left||joined&&day.workDate<joined||left&&day.workDate>left)return fail(400,'ATTENDANCE_OUTSIDE_EMPLOYMENT');
   }
  }
  const existing=await tx.attendanceEntry.findMany({where:{orgId,factoryId,workDate:{in:[...seen]},workerId:{in:workerIds}}});
  const byKey=new Map(existing.map((row:any)=>[row.workDate+':'+row.workerId,row]));
  const creates:any[]=[],updates:any[]=[];
  for(const day of normalized)for(const incoming of day.entries){
   const old:any=byKey.get(day.workDate+':'+incoming.workerId);
   if(old?.managementExcluded)return fail(409,'ATTENDANCE_MANAGEMENT_EXCLUDED');
   const merged=mergeAttendancePunches(old,incoming),computed=normalizeEntries([merged]).rows[0];
   if(!computed)return fail(400,'INVALID_ATTENDANCE_IMPORT');
   if(!old)creates.push({...computed,orgId,factoryId,workDate:day.workDate,createdBy:actor.email||'system@baro.local',createdByEmployeeId:actorId,updatedByEmployeeId:actorId});
   else if(['clockIn','clockOut','note','workedSeconds'].some(key=>(old[key]??null)!==(computed[key]??null)))updates.push({id:old.id,data:{...computed,updatedByEmployeeId:actorId}});
  }
  if(creates.length)await tx.attendanceEntry.createMany({data:creates});
  for(const row of updates)await tx.attendanceEntry.update({where:{id:row.id},data:row.data});
  return {dayCount:normalized.length,entryCount:count,createdCount:creates.length,updatedCount:updates.length,unchangedCount:count-creates.length-updates.length,firstDate:[...seen].sort()[0],lastDate:[...seen].sort().at(-1)};
 },{isolationLevel:'Serializable',timeout:60000,maxWait:10000});
}
