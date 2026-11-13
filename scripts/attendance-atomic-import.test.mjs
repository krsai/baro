import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../backend/node_modules/typescript/lib/typescript.js';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {mergeImportedAttendanceEntries} from '../frontend/src/pages/App/attendance/attendanceFileImport.js';
const require=createRequire(import.meta.url),{importAttendanceFile,mergeAttendancePunches}=require('../backend/dist/services/attendanceImport');
const source=readFileSync('backend/src/index.ts','utf8');
const segment=source.slice(source.indexOf('const normalizeTimeText ='),source.indexOf('const normalizeHolidayDateKeyList ='));
const normalize=vm.runInNewContext(ts.transpile(segment+'\nnormalizeAttendanceEntryPayloadList;',{}),{ensureArray:value=>Array.isArray(value)?value:[],resolveOptionalString:(value,fallback)=>value==null||!String(value).trim()?fallback:String(value).trim(),toPositiveIntOrNull:value=>Number.isSafeInteger(value)&&value>0?value:null});
const date=value=>value?new Date(value).toISOString().slice(0,10):'';

test('server merge matches actual-punch and manual memo preservation for all three languages',()=>{
 for(const note of ['Test: 퇴근 기록 없음 → 17:00 퇴근 자동 생성','Test: Missing clock-out → 17:00 clock-out auto-filled','Test: Thiếu giờ ra → tự động bổ sung giờ ra 17:00']){
  for(const [old,incoming]of [[{workerId:1,clockIn:'07:40',clockOut:'18:22',note:'Manual memo'},{workerId:1,clockIn:'07:50',clockOut:'17:00',note}],[{workerId:1,clockIn:'07:50',clockOut:'17:00',note},{workerId:1,clockIn:'07:40',clockOut:'18:22',note:null}]])assert.deepEqual(mergeAttendancePunches(old,incoming),mergeImportedAttendanceEntries([old],[incoming])[0]);
 }
});

test('full month import is atomic, scoped, retry safe and preserves existing rows and payroll',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const factory=await db.factory.create({data:{orgId:org,name:'Hanoi',managementStartDate:'2026-04-01'}});
  await db.employee.update({where:{id:s.people.junior.id},data:{factoryId:factory.id,orgRole:'WORKER',joinedAt:new Date('2026-01-01')}});
  const body={factoryId:factory.id,dailyEntries:Array.from({length:31},(_,i)=>({workDate:'2026-10-'+String(i+1).padStart(2,'0'),entries:[{workerId:s.people.junior.id,clockIn:'07:40',clockOut:'17:22',note:null}]}))};
  await importAttendanceFile(db,org,actor,{...body,dailyEntries:body.dailyEntries.slice(0,18)},normalize,date);
  const before=await db.attendanceEntry.findMany({where:{orgId:org},orderBy:{id:'asc'}});
  const bad=structuredClone(body);bad.dailyEntries[18].entries[0].workerId=actor;
  await assert.rejects(importAttendanceFile(db,org,actor,bad,normalize,date),/INVALID_ATTENDANCE_WORKER/);
  assert.deepEqual(await db.attendanceEntry.findMany({where:{orgId:org},orderBy:{id:'asc'}}),before);
  await assert.rejects(importAttendanceFile(db,s.other.id,actor,body,normalize,date),/FACTORY_NOT_FOUND/);
  await assert.rejects(importAttendanceFile(db,org,s.people.junior.id,body,normalize,date),/FORBIDDEN/);
  await db.employee.update({where:{id:s.people.junior.id},data:{payrollExcluded:true}});
  await assert.rejects(importAttendanceFile(db,org,actor,body,normalize,date),/ATTENDANCE_MANAGEMENT_EXCLUDED/);
  await db.employee.update({where:{id:s.people.junior.id},data:{payrollExcluded:false,leftAt:new Date('2026-10-18')}});
  await assert.rejects(importAttendanceFile(db,org,actor,body,normalize,date),/ATTENDANCE_OUTSIDE_EMPLOYMENT/);
  await db.employee.update({where:{id:s.people.junior.id},data:{leftAt:null}});
  // A late database failure must roll back newly inserted days as well.
  const failing={...db,$transaction:(fn,options)=>db.$transaction(async tx=>{const result=await fn(tx);throw Error('late failure')},options)};
  await assert.rejects(importAttendanceFile(failing,org,actor,body,normalize,date),/late failure/);
  assert.equal(await db.attendanceEntry.count({where:{orgId:org}}),18);
  const result=await importAttendanceFile(db,org,actor,body,normalize,date);
  assert.equal(result.dayCount,31);assert.equal(result.entryCount,31);assert.equal(result.createdCount,13);assert.equal(result.unchangedCount,18);assert.equal(result.lastDate,'2026-10-31');
  assert.deepEqual(await db.attendanceEntry.findMany({where:{id:{in:before.map(row=>row.id)}},orderBy:{id:'asc'}}),before);
  const retry=await importAttendanceFile(db,org,actor,body,normalize,date);assert.equal(retry.createdCount,0);assert.equal(retry.updatedCount,0);assert.equal(retry.unchangedCount,31);
  assert.equal(await db.attendanceEntry.count({where:{orgId:org}}),31);
  assert.equal(await db.payrollSnapshot.count({where:{orgId:org}}),0);
  for(const mutate of [input=>input.dailyEntries.push(input.dailyEntries[0]),input=>input.dailyEntries[0].entries[0].clockIn='30:00',input=>input.dailyEntries[0].workDate='2026-02-30']){
   const invalid=structuredClone(body);mutate(invalid);await assert.rejects(importAttendanceFile(db,org,actor,invalid,normalize,date),/INVALID_ATTENDANCE_IMPORT/);
  }
 }finally{await f.close()}
});
