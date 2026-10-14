import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { processVersionLockReason, annotateProcessVersionProtection } = require('../backend/dist/services/processVersionProtection.js');

test('version protection follows production-completed state, never the displayed percentage',()=>{
  assert.equal(processVersionLockReason({displayProgressPercent:100},{scheduleStatus:'IN_PROGRESS'}),null);
  assert.equal(processVersionLockReason({displayProgressPercent:110},{scheduleStatus:'REVIEW_REQUIRED'}),null);
  assert.equal(processVersionLockReason({displayProgressPercent:80},{scheduleStatus:'PRODUCTION_COMPLETED'}),'PRODUCTION_COMPLETED');
  assert.equal(processVersionLockReason({isCompleted:true},null),'PRODUCTION_COMPLETED');
  assert.equal(processVersionLockReason({},null,true),'PAYROLL_LOCKED');
  assert.equal(processVersionLockReason({},null,false,true),'SETTLEMENT_LOCKED');
});

test('each assignment in the same order keeps its own protection and original version identity',async()=>{
  const plans=[{id:1,externalId:'A',factoryId:1,workOrderId:1,styleProcessVersionId:10},{id:2,externalId:'B',factoryId:1,workOrderId:1,styleProcessVersionId:10},{id:3,externalId:'C',factoryId:2,workOrderId:2,styleProcessVersionId:10},{id:4,externalId:'D',factoryId:1,workOrderId:3,styleProcessVersionId:10}];
  const before=JSON.stringify(plans);let writes=0;
  const db={payrollSnapshot:{findMany:async()=>[{factoryId:2,month:'2026-08'}]},workOrder:{findMany:async()=>[{id:1},{id:2},{id:3,invoiceFinalLockedAt:new Date()}]},
    workRecord:{findMany:async()=>[]},outsourcedWorkRecord:{findMany:async()=>[{assignmentPlanId:3,workLog:{displayDate:'2026-08-15'}}]},assignmentPlan:{update:()=>writes++}};
  const result=await annotateProcessVersionProtection(db,1,plans,async(client,rows)=>{
    assert.equal(client,db);assert.equal(rows,plans);
    return[{id:'A',scheduleStatus:'PRODUCTION_COMPLETED'},{id:'B',scheduleStatus:'REVIEW_REQUIRED',displayProgressPercent:100}];
  });
  assert.deepEqual(result.map(row=>row.versionLockReason),['PRODUCTION_COMPLETED',null,'PAYROLL_LOCKED','SETTLEMENT_LOCKED']);
  assert.ok(result.every(row=>row.styleProcessVersionId===10));assert.equal(JSON.stringify(plans),before);assert.equal(writes,0);
  assert.deepEqual(await annotateProcessVersionProtection(db,1,[],()=>{throw Error('unexpected read');}),[]);
});

test('existing manual boundaries stay in place; server protection is rechecked under order and assignment locks',()=>{
  const source=readFileSync('backend/src/index.ts','utf8');
  const route=source.slice(source.indexOf('app.put("/styles/:styleId/process-version-boundaries"'),source.indexOf('const deleteUnusedStyle'));
  assert.match(route,/prisma\.\$transaction\(async \(tx\)/);
  assert.match(route,/SELECT id FROM "WorkOrder".*FOR UPDATE/);
  assert.match(route,/SELECT id FROM "AssignmentPlan".*FOR UPDATE/);
  assert.match(route,/req\.body\?\.boundaries/);
  assert.match(route,/if \(plan\.isVersionLocked\) return \[\]/);
  assert.match(route,/tx\.assignmentPlan\.update/);
  assert.doesNotMatch(route,/prisma\.assignmentPlan\.update/);
  assert.match(route,/await Promise\.all\(updates\)/);
});

test('locked historical versions do not create conflicting boundaries when reopening the version manager',()=>{
  const source=readFileSync('frontend/src/pages/App/style/styleDetail/ProcessVersionManager.jsx','utf8');
  const start=source.indexOf('export const deriveEditableVersionBoundaries');
  const end=source.indexOf('const ProcessVersionManager =',start);
  const derive=new Function(source.slice(start,end).replace('export const','const')+';return deriveEditableVersionBoundaries;')();
  const versions=[{id:10},{id:11}];
  assert.deepEqual(derive(versions,[{assignmentPlanId:1,versionId:11},{assignmentPlanId:2,versionId:10,isVersionLocked:true},{assignmentPlanId:3,versionId:11}]),{11:1});
  assert.deepEqual(derive(versions,[{assignmentPlanId:1,versionId:10,isVersionLocked:true},{assignmentPlanId:2,versionId:11}]),{11:1});
  assert.deepEqual(derive(versions,[{assignmentPlanId:1,versionId:10,isVersionLocked:true}]),{});
});

test('the actual boundary API can apply Ver.11 across a completed Ver.10 assignment without changing it',async()=>{
  const ts=require('../backend/node_modules/typescript');
  const source=readFileSync('backend/src/index.ts','utf8');
  const start=source.indexOf('app.put("/styles/:styleId/process-version-boundaries"');
  const code=ts.transpileModule(source.slice(start,source.indexOf('const deleteUnusedStyle',start)),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const newlyCompleted of [false,true]){
    let handler;const writes=[];const locks=[];
    const plans=[1,2].map(id=>({id,externalId:String(id),factoryId:1,styleProcessVersionId:10,assignmentQuantity:100,assignmentCtSnapshot:{styleProcessVersionId:10,processes:[{styleProcessId:1}]},assignmentStSnapshot:{styleProcessVersionId:10,processes:[{styleProcessId:1}]},workRecords:[]}));
    const original=JSON.stringify(plans);
    const versions=[{id:10,versionNumber:10,processSnapshot:[{id:1}]},{id:11,versionNumber:11,confirmedDate:'2026-10-14',processSnapshot:[{id:2}]}];
    const tx={$queryRawUnsafe:async sql=>locks.push(sql),styleProcessVersion:{findMany:async()=>versions},assignmentPlan:{findMany:async()=>plans,update:async args=>{writes.push(args);return args.data;}},payrollSnapshot:{findMany:async()=>[]},workOrder:{findMany:async()=>[]},workRecord:{findMany:async()=>[]},outsourcedWorkRecord:{findMany:async()=>[]}};
    const deps={app:{put:(_path,fn)=>{handler=fn;}},requireOrgRole:async()=>({organization:{id:1},employee:{id:1,email:'actor'}}),ORG_MANAGEMENT_ROLES:['ADMIN'],
      resolveStyleByIdForAccess:async()=>({id:1}),parseStyleOwnerOrgIdQuery:()=>null,
      prisma:{$transaction:async fn=>fn(tx)},ensureInitialStyleProcessVersion:async args=>{assert.equal(args.db,tx);},annotateAssignmentPlanRowsWithPayrollLocks:async(_org,rows,db)=>{assert.equal(db,tx);return rows;},
      annotateProcessVersionProtection,buildAssignmentPlanProgressRows:async(_org,ids,{db})=>{assert.equal(db,tx);assert.deepEqual(ids,['1','2']);return[{id:'1',scheduleStatus:'PRODUCTION_COMPLETED'},{id:'2',scheduleStatus:newlyCompleted?'PRODUCTION_COMPLETED':'REVIEW_REQUIRED',displayProgressPercent:100}];},
      ensureArray:value=>Array.isArray(value)?value:[],toPositiveIntOrNull:value=>Number(value)||null,createHttpError:(status,message)=>Object.assign(Error(message),{status}),
      normalizeStyleProcesses:value=>value,normalizeProcessGenderScope:()=> 'UNISEX',loadStyleGenderQuantityMapForWorkOrderIds:async()=>new Map(),
      resolveOptionalString:(value,fallback)=>value||fallback,getRequesterEmail:()=> 'actor',assignmentCtSnapshotMatchesProcessVersion:()=>false,
      findStyleProcessGenderScopeAmbiguity:()=>false,buildEditableAssignmentCtSnapshotFromLiveStyle:({style})=>({readiness:{ready:true},assignment:{assignmentCtSnapshot:{processes:style.processes.map(process=>({styleProcessId:process.id}))}}}),normalizeAssignmentCtSnapshot:value=>value,
      resolveStyleProcessVersionStPerPieceSeconds:()=>10,resolveStyleProcessRowApplicableQuantity:()=>100,
    };
    new Function(...Object.keys(deps),code)(...Object.values(deps));
    let response;
    await handler({params:{styleId:'1'},query:{},body:{boundaries:[{versionId:11,startAssignmentPlanId:1}]}},{json:value=>{response=value;},status:()=>{throw Error('unexpected status');}});
    assert.deepEqual(response,{ok:true});assert.equal(locks.length,5);assert.equal(JSON.stringify(plans),original);
    assert.deepEqual(writes.map(write=>write.where.id),newlyCompleted?[]:[2]);
    if(writes.length){assert.equal(writes[0].data.styleProcessVersionId,11);assert.equal(writes[0].data.assignmentCtSnapshot.processes[0].styleProcessId,2);}
  }
});
