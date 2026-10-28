import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { editableAssignmentStyleIds } from '../frontend/src/pages/App/assign/utils/assignmentLoading.mjs';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
const require=createRequire(import.meta.url);
const {loadAssignmentStyleDetails}=require('../backend/dist/services/assignmentStyleLoading.js');
const {annotateAssignmentInvoiceWorkflow}=require('../backend/dist/services/invoiceWorkflow.js');

test('completed-only styles need no initial process read; editable, split, unassigned and unknown cards still do',()=>{
 const cards=[{id:'done',styleId:1},{id:'active',styleId:2},{id:'split',styleId:2},{id:'new',styleId:3},{id:'unknown',styleId:4}];
 const assignments=[{cardId:'done',isCompleted:true},{cardId:'active',isCompleted:true},{cardId:'split',isCompleted:false,isManagementClosed:true},{cardId:'unknown'}];
 const before=JSON.stringify({cards,assignments});assert.deepEqual(editableAssignmentStyleIds(cards,assignments),[2,3,4]);
 assert.deepEqual(editableAssignmentStyleIds(cards.slice(0,1),assignments),[]);assert.equal(JSON.stringify({cards,assignments}),before);
});
test('style details read only requested company-card FKs and do not rebuild card summaries or order readiness',async()=>{
 let styleReads=0;
 const db={assignmentCard:{findMany:async({where,select})=>{assert.equal(where.orgId,1);assert.deepEqual(select,{styleId:true});return [{styleId:2},{styleId:3}];}},style:{findMany:async({where,select})=>{styleReads++;assert.deepEqual(where.id.in,[2,3]);assert.equal(select.processes,true);return [{id:2,processes:[]},{id:3,processes:[]}];}}};
 assert.equal((await loadAssignmentStyleDetails(db,1,'2,3,2')).length,2);assert.equal(styleReads,1);
 await assert.rejects(loadAssignmentStyleDetails(db,1,'2,9'),/ASSIGNMENT_STYLE_NOT_FOUND/);assert.equal(styleReads,1);
 for(const value of ['', '1,x','0','-1','1.5'])await assert.rejects(loadAssignmentStyleDetails(db,1,value),/INVALID_ASSIGNMENT_STYLE_IDS/);
});
test('metadata-only company access does not request manufacturing processes',async()=>{
 const db={assignmentCard:{findMany:async()=>[{styleId:2}]},style:{findMany:async({select})=>{assert.equal(select.processes,undefined);return [{id:2}];}}};
 assert.deepEqual(await loadAssignmentStyleDetails(db,1,'2',false),[{id:2}]);
});
test('incomplete assignments cannot close even with a full advance invoice and skip all billing lookup work',async()=>{
 const rows=[{id:'a',workOrderId:1,styleId:7,isCompleted:false}];
 const result=await annotateAssignmentInvoiceWorkflow({},1,rows,()=>{throw Error('Unexpected progress read');});
 assert.deepEqual(result,[{...rows[0],isManagementClosed:false}]);assert.equal(rows[0].isManagementClosed,undefined);
});
test('completed but unbilled work skips sibling progress calculation',async()=>{
 const rows=[{id:'a',workOrderId:1,styleId:7,isCompleted:true}];
 const db={workOrder:{findMany:async()=>[{id:1,orderId:'o',sellerOrgId:1,buyerOrgId:2,workOrderItems:[{id:5,styleId:7,totalQuantity:100}]}]},invoiceOrder:{findMany:async({where})=>{assert.equal(where.billingPercentage,100);return [];}}};
 assert.equal((await annotateAssignmentInvoiceWorkflow(db,1,rows,()=>{throw Error('Unexpected sibling calculation');}))[0].isManagementClosed,false);
});
test('employee and outsourced work records are fetched concurrently without changing their provenance',async()=>{
 const gates=[];let reads=0;
 const read=kind=>new Promise(resolve=>{reads++;gates.push(()=>resolve([{id:kind,assignmentPlanId:1,styleId:7,styleProcess:{styleId:7}}]));});
 const db={workRecord:{findMany:()=>read('employee')},outsourcedWorkRecord:{findMany:()=>read('outsourced')}};
 const {loadAssignmentPlanProgressWorkRows}=loadSourceBindings('backend/src/index.ts',['loadAssignmentPlanProgressWorkRows'],{prisma:db,ensureArray:value=>Array.isArray(value)?value:[],toPositiveIntOrNull:value=>Number(value)>0?Number(value):null});
 const result=loadAssignmentPlanProgressWorkRows({orgId:1,plans:[{id:1,styleId:7}],stateAssignmentsByExternalId:new Map(),context:'test',db});
 await Promise.resolve();assert.equal(reads,2,'Both independent queries must start before either finishes');gates.forEach(release=>release());
 const rows=await result;assert.equal(rows.length,2);assert.equal(rows[0].isOutsourced,false);assert.equal(rows[1].isOutsourced,true);
});
test('board view can reuse the revision read before source reads; default callers retain their revision',async()=>{
 const source=readFileSync('backend/src/index.ts','utf8');const section=source.slice(source.indexOf('app.get("/assignment-board-view"'),source.indexOf('app.get("/assignment-board-versions"'));
 const ts=require('../backend/node_modules/typescript');let handler,reads=0,response;
 const deps={app:{get:(_path,fn)=>{handler=fn;}},getOrganizationByQuery:async()=>({id:1}),assignmentBoardRevision:async()=>{reads++;return 'current';},prisma:{assignmentBoardState:{findUnique:async()=>({})}},buildReadOnlyAssignmentBoardStateResponse:async()=>({assignments:[{id:'a'}]})};
 new Function(...Object.keys(deps),ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(deps));
 await handler({query:{includeRevision:'0',includeCards:'0'}},{json:value=>{response=value;}});assert.equal(reads,0);assert.equal(response.editRevision,null);assert.equal(response.assignments.length,1);
 await handler({query:{}},{json:value=>{response=value;}});assert.equal(reads,1);assert.equal(response.editRevision,'current');
});

test('actual bootstrap renders summaries first, requests editable details once and keeps saving locked until they arrive',async()=>{
 for(const allCompleted of [false,true]){
  const cards=[{id:'done',styleId:1},{id:'edit',styleId:2}],assignments=[{id:'a',cardId:'done',isCompleted:true},{id:'b',cardId:'edit',isCompleted:allCompleted}];
  const before=JSON.stringify({cards,assignments}),reads=[],states=[],notices=[];let styles=[],release;
  const gate=new Promise(resolve=>{release=resolve;});
  const deps={cancelled:false,activeOrgId:1,normalizedOrgId:1,languageCode:'en',setQueryError:()=>{},setPersistReady:value=>states.push(['ready',value]),setLoading:value=>states.push(['loading',value]),detailStyleFetchAttemptRef:{current:null},
   buildQueryString:object=>'?'+new URLSearchParams(object).toString(),
   requestJSON:async path=>{reads.push(path);const url=new URL(path,'http://test');
    if(url.pathname==='/assignment-board-revision')return {editRevision:'before-read'};
    if(url.pathname==='/assignment-cards'){
     if(url.searchParams.get('stylesOnly')==='1'){assert.equal(url.searchParams.get('styleIds'),'2');await gate;return {styles:[{id:2,processes:[{id:77}]}]};}
     assert.equal(url.searchParams.get('includeProcesses'),'0');return {cards,styles:[{id:1},{id:2}]};
    }
    if(url.pathname==='/assignment-board-view'){assert.equal(url.searchParams.get('includeRevision'),'0');return {cards:[],assignments};}
    return [];
   },isCardOrderAssignmentReady:()=>true,normalizeAssignmentCardForBoard:card=>card,
   applyLoadedBoardData:input=>{styles=input.nextStyles;assert.equal(input.boardState.editRevision,'before-read');},setAssignmentOperationStartDateKey:()=>{},resolveEarliestFactoryManagementStartDateKey:()=>'',buildAssignableFactoryScopes:()=>[],
   editableAssignmentStyleIds,mergeCardsWithSaved:cards=>cards,setStyles:update=>{styles=typeof update==='function'?update(styles):update;},
   hasLoadedSourceDataRef:{current:false},lastLoadedOrgIdRef:{current:null},showNotification:(...args)=>notices.push(args),getUiMessage:()=>'',
  };
  const {loadSourceData}=loadSourceBindings('frontend/src/pages/App/assign/AssignBoard.jsx',['loadSourceData'],deps);
  const pending=loadSourceData();for(let i=0;i<12;i++)await Promise.resolve();
  assert.deepEqual(states.find(row=>row[0]==='loading'&&row[1]===false),['loading',false]);
  if(!allCompleted){assert.equal(states.some(row=>row[0]==='ready'&&row[1]),false);release();}
  await pending;assert.ok(states.some(row=>row[0]==='ready'&&row[1]));assert.equal(notices.length,0);
  assert.equal(reads.filter(path=>path.startsWith('/assignment-cards?')).length,allCompleted?1:2);
  assert.ok(reads[0].startsWith('/assignment-board-revision?'));assert.equal(styles.length,2);assert.equal(styles[0].id,1);
  assert.equal(JSON.stringify({cards,assignments}),before);
 }
});
