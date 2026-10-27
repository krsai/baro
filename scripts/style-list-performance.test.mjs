import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import memoModule from '../backend/dist/services/contentMemo.js';
import readModule from '../backend/dist/services/inFlightRead.js';
import listModule from '../backend/dist/services/styleListResponse.js';
const {contentMemo}=memoModule,{coalesceInFlightRead}=readModule,{toStyleListResponse}=listModule;
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=fs.readFileSync('backend/src/index.ts','utf8');
const timeSource=fs.readFileSync('frontend/src/utils/processTime.js','utf8').replace(/^\uFEFF?import .*;\r?\n/,'const formatNumberWithCommas = String;\n');
const time=await import('data:text/javascript;base64,'+Buffer.from(timeSource).toString('base64'));

test('list projection preserves PT/ST/AT/reliability and omits detail payload',()=>{
  const process={pt:120,ct:120000,timeRefQuantity:1000,timesPerPiece:2,processComposition:{locations:['body']},
    stBuckets:[{bucketQuantity:1000,bucketStSeconds:120000,setBy:'unused'}],stManual:true,
    atStFallbackApproved:true,atParams:{a:120,b:50},atV2Observations:[{assignmentPlanId:1,quantity:500,allocatedLaborInputSeconds:60000}],
    atSharedPrediction:{version:'shared-at-v1',a:120,b:50,smallQuantityBoundary:100,isProvisional:true,
      validation:{overall:{meanPredictionSeconds:120,reliabilityMethod:'predicted-time-absolute-error-v1',predictionRelativeError:.2}}},
    description:'large detail text',name:'private detail name'};
  for(const processes of [[],[process],[{...process,atV2Observations:[],atSharedPrediction:null}],[{...process,atV2Observations:undefined,atParams:null}]]){
    const style={id:1,bom:[{large:'x'.repeat(20000)}],imageUrls:['image'],processes,timeBucketQuantities:[1000]};
    const list=toStyleListResponse(style);
    assert.equal(list.bom,undefined);assert.equal(list.imageUrls,undefined);
    const summarize=ps=>({
      pt:time.calculateProcessTotalForOrderQuantity(ps,'pt',1000),
      st:ps.map(p=>time.resolveProcessStTotalSecondsForOrderQuantity(p,1000)),
      at:time.calculateProcessDisplayAtTotalForOrderQuantity(ps,1000,[1000]),
      hasAt:time.hasCompleteDisplayableProcessAtTime(ps,1000,[1000]),
      reliability:time.resolveStyleAtPredictionReliability(ps),
    });
    assert.deepEqual(summarize(list.processes),summarize(processes));
    assert.ok(JSON.stringify(list).length<JSON.stringify(style).length);
  }
});

test('read-only process hydration never seeds or synchronizes stored rows',async()=>{
  const fnSource=source.slice(source.indexOf('const ensureStyleProcessStorageForStyles ='),source.indexOf('const loadRelationshipTimeBucketContextByStyleId ='));
  const build=new Function('prisma','toPositiveIntOrNull','ensureArray','loadStyleProcessRowsByStyleId','loadStyleProcessNameLookup','loadStyleAtPredictions','buildStyleProcessMirrorFromRows','normalizeStyleProcesses','isStyleProcessStorageOutOfSync','syncStyleProcessStorageForStyle',ts.transpileModule(fnSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return ensureStyleProcessStorageForStyles;');
  const fail=()=>{throw Error('unexpected mutation or reconciliation');};
  const hydrate=build({},v=>Number(v)||null,v=>Array.isArray(v)?v:[],async()=>new Map([[1,[{id:5,styleProcessId:5}]]]),async()=>new Map(),async()=>new Map(),rows=>rows,v=>v,fail,fail);
  const rows=await hydrate([{id:1,orgId:1,processes:[{pt:100}]},{id:2,orgId:1,processes:[{pt:200}]}],{processOrgId:1,readOnly:true});
  assert.equal(rows.get(1)[0].id,5);assert.equal(rows.get(2)[0].pt,200);
});

test('in-flight reads isolate org/month, release failures, and re-read after source edits',async()=>{
  const read=coalesceInFlightRead();let calls=0,release;
  const task=()=>{calls++;return new Promise(r=>release=r);};
  const a=read('1:2026-09',task),b=read('1:2026-09',task);
  await Promise.resolve();assert.equal(calls,1);release('old');assert.equal(await a,'old');assert.equal(await b,'old');
  assert.equal(await read('1:2026-09',async()=> 'edited'),'edited');
  assert.equal(await read('2:2026-09',async()=> 'other org'),'other org');
  await assert.rejects(read('1:2026-09',async()=>{throw Error('retry');}));
  assert.equal(await read('1:2026-09',async()=> 'recovered'),'recovered');
});

test('prediction memo detects same-count edits, deletions and is bounded',()=>{
  const memo=contentMemo(2);let calls=0;const calculate=()=>++calls;
  assert.equal(memo([{quantity:1}],calculate),1);assert.equal(memo([{quantity:1}],calculate),1);
  assert.equal(memo([{quantity:2}],calculate),2);assert.equal(memo([],calculate),3);
  assert.equal(memo([{quantity:1}],calculate),4);
});
