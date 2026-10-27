import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {processVersionSignature,confirmCurrentProcessVersion}=require('../backend/dist/services/styleProcessVersionLifecycle.js');

test('JSONB key order and runtime AT/work-history changes are not unconfirmed process edits',()=>{
 const saved=[{id:1,styleProcessId:1,code:'C01',pt:70,stBuckets:[{bucketQuantity:1000,bucketStSeconds:70000,setAt:'old'}],atParams:{a:61},workRecordCount:0}];
 const live=[{workRecordCount:5,atParams:{a:62},stBuckets:[{setAt:'new',bucketStSeconds:70000,bucketQuantity:1000}],pt:70,code:'C01',styleProcessId:1,id:1}];
 assert.notEqual(JSON.stringify(saved),JSON.stringify(live));
 assert.equal(processVersionSignature(saved),processVersionSignature(live));
 for(const change of [p=>p.pt=71,p=>p.styleProcessId=2,p=>p.code='C02',p=>p.stBuckets[0].bucketStSeconds=71000,p=>p.genderScope='MALE_ONLY',p=>p.timesPerPiece=2]){
  const edited=structuredClone(live);change(edited[0]);assert.notEqual(processVersionSignature(saved),processVersionSignature(edited));
 }
 assert.notEqual(processVersionSignature([{id:1},{id:2}]),processVersionSignature([{id:2},{id:1}]));
});
test('a confirmation retry reuses the stored version after JSONB reorder and live history change',async()=>{
 const latest={id:8,versionNumber:1,processSnapshot:[{pt:70,id:1,workRecordCount:0}]};let writes=0;
 const db={$queryRawUnsafe:async()=>[{id:1}],styleProcessVersion:{findFirst:async()=>latest,create:async()=>{writes++;throw Error('Unexpected new version');}}};
 const result=await confirmCurrentProcessVersion(db,{orgId:1,styleId:1,actor:'test',date:'2026-10-27',loadSnapshot:async()=>[{id:1,pt:70,workRecordCount:4,atParams:{a:61}}]});
 assert.equal(result.id,8);assert.equal(writes,0);
});
test('same-tick style save clicks issue one request and unlock after success/failure',async()=>{
 let calls=0,release;const lock={current:false};const states=[];
 const source=loadSourceBindings('frontend/src/pages/App/style/StyleDetail.jsx',['handleSaveRequest'],{
  saveInFlight:lock,loadingStyle:false,isDirty:true,setSavingStyle:value=>states.push(value),handleSave:()=>{calls++;return new Promise(resolve=>release=resolve);},
 });
 const first=source.handleSaveRequest();await source.handleSaveRequest();assert.equal(calls,1);assert.equal(lock.current,true);
 release();await first;assert.equal(lock.current,false);assert.deepEqual(states,[true,false]);
 const failing=loadSourceBindings('frontend/src/pages/App/style/StyleDetail.jsx',['handleSaveRequest'],{saveInFlight:lock,loadingStyle:false,isDirty:true,setSavingStyle:()=>{},handleSave:async()=>{throw Error('failed');}});
 await assert.rejects(failing.handleSaveRequest(),/failed/);assert.equal(lock.current,false);
});
test('ordinary saves rely on atomic server confirmation; pending query uses the same signature',()=>{
 const page=readFileSync('frontend/src/pages/App/style/StyleDetail.jsx','utf8');
 assert.doesNotMatch(page,/await confirmStyleProcessVersion/);
 const server=readFileSync('backend/src/index.ts','utf8');
 assert.match(server,/processVersionSignature\(normalizeStyleProcesses\(latestVersion.processSnapshot\)\)/);
 assert.match(server,/processVersionSignature\(liveProcesses\)/);
});

test('version-boundary save also rejects same-tick duplicate clicks',async()=>{
 let calls=0,closed=0,release;const lock={current:false};
 const source=loadSourceBindings('frontend/src/pages/App/style/styleDetail/ProcessVersionManager.jsx',['save'],{
  mutationInFlight:lock,busy:false,scope:'style-1',currentScope:{current:'style-1'},setBusy:()=>{},
  styleId:1,orgId:1,ownerOrgId:1,versions:[{id:1}],boundaries:{1:10},
  saveStyleProcessVersionBoundaries:()=>{calls++;return new Promise(resolve=>release=resolve);},
  setSavedBoundaries:()=>{},notify:()=>{},copy:{saved:'saved'},onClose:()=>{closed++;},
 });
 const first=source.save();await source.save();assert.equal(calls,1);release();await first;assert.equal(lock.current,false);assert.equal(closed,1);
});
