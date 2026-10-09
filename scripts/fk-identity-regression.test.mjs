import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const backend = readFileSync('backend/src/index.ts', 'utf8');
const work = readFileSync('frontend/src/pages/App/work/WorkDetail.jsx', 'utf8');
const order = readFileSync('frontend/src/pages/App/order/OrderList.jsx', 'utf8');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const text = value => value == null ? '' : String(value).trim();
// Execute the actual declarations, without starting the API or rendering React.
function load(source, names, deps = {}) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(declarations.length, names.length);
  const js = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
const common = { toPositiveIntOrNull: positive, toPositiveIdOrNull: positive, toText: text };

test('duplicate import explanation names the style, worker and exact conflicting rows in all languages',()=>{
  const source=readFileSync('frontend/src/pages/App/work/workLogImport.js','utf8');
  const {formatDuplicateImportIssue:format}=load(source,['formatDuplicateImportIssue'],{toText:text});
  const detail={source:'FILE',workDate:'2026-09-30',workerName:'Trần Thị Luyến',employeeNo:'BRVN0007',orderNo:'L18-1',styleName:'Style name differs from code',styleCode:'S-W998JW',processCode:'TT01',processName:'Sewing task',quantity:30,matchingRows:[{sheetName:'26 SEP',rowNumber:119,quantity:30},{sheetName:'26 SEP',rowNumber:132,quantity:30}]};
  for(const lang of ['ko','en','vi']){
    const output=format(detail,lang);
    for(const value of ['Trần Thị Luyến','BRVN0007','L18-1','Style name differs from code','TT01','Sewing task','119','132','2026-09-30'])assert.ok(output.includes(value));
    assert.doesNotMatch(output,/S-W998JW|worker#|StyleProcess#|\+\d+ more/);
    const saved=format({...detail,source:'SAVED',savedRecords:[{workDate:'2026-09-30',factoryName:'HANOI',quantity:20}]},lang);
    assert.ok(saved.includes('HANOI'));assert.ok(saved.includes('20'));assert.notEqual(saved,output);
  }
  assert.match(format(detail,'ko'),/한 행으로 합쳐/);
  assert.match(format({...detail,source:'SAVED',savedRecords:[]},'ko'),/기존 기록을 수정/);
  assert.match(format({...detail,styleName:''},'ko'),/스타일명 확인 필요/);
});

test('import combines 30 male and 30 female pieces of a shared process by FK while retaining source rows',()=>{
  const {combineImportedWorkRecords:combine}=load(backend,['combineImportedWorkRecords'],{
    buildWorkRecordWorkerStyleProcessSignature:r=>`${r.workerId}:${r.assignmentPlanId}:${r.styleProcessId}`,
    createHttpError:(status,message)=>Object.assign(Error(message),{status}),
  });
  const base={workerId:15,assignmentPlanId:7,styleProcessId:648,quantity:30,ctSeconds:551};
  const records=[base,{...base},{...base,styleProcessId:649},{...base,workerId:16},{...base,assignmentPlanId:8}];
  const result=combine(records);
  assert.deepEqual(result.records.map(r=>r.quantity),[60,30,30,30]);
  assert.deepEqual(result.sourceIndices,[[0,1],[2],[3],[4]]);
  assert.equal(result.records[0].ctSeconds,551);assert.equal(base.quantity,30);
  assert.throws(()=>combine([{...base,quantity:2147483647},base]),/too large/);
  const importRoute=backend.slice(backend.indexOf('app.post("/work-logs/import"'));
  assert.doesNotMatch(importRoute,/requiresMergeConfirmation: true/);
  assert.match(importRoute,/mergedRowGroups: mergeGroups/);
});

test('quantity remark uses order-wide history, permits excess and excludes the log being edited',async()=>{
  let history=[];let scope='UNISEX';let excluded;
  const db={
    $queryRawUnsafe:async()=>[],
    assignmentPlan:{findMany:async()=>[{id:7,styleId:40,workOrderId:5,style:{name:'AP1968 name'},workOrder:{orderNumber:'L18-1'}}]},
    styleProcess:{findMany:async()=>[{id:648,processCode:'TT01',processName:'Shared process',genderScope:scope}]},
    workRecord:{findMany:async({where})=>{excluded=where.workLogId;return history;}},
    outsourcedWorkRecord:{findMany:async()=>[]},
  };
  const {appendWorkLogQuantityRemark:remark,resolveStyleProcessRowApplicableQuantity:applicable}=load(backend,['appendWorkLogQuantityRemark','resolveStyleProcessRowApplicableQuantity'],{
    ensureArray:v=>Array.isArray(v)?v:[],toPositiveIntOrNull:positive,
    resolveNormalizedAssignmentCtSnapshot:()=>({processes:[{styleProcessId:648},{styleProcessId:649}]}),
    collectWorkRecordAssignmentPlanIds:r=>[...new Set(r.map(x=>x.assignmentPlanId))],
    loadStyleGenderQuantityMapForWorkOrderIds:async()=>new Map([['5:40',{total:60,male:30,female:30}]]),normalizeProcessGenderScope:v=>v,
  });
  const input={db,orgId:1,records:[{assignmentPlanId:7,styleProcessId:648,quantity:60}],note:'User note'};
  assert.equal(await remark(input),'User note');
  history=[{quantity:20,styleProcessId:648,assignmentPlan:{workOrderId:5,styleId:40},workLog:{displayDate:'2026-09-20'}}];
  const output=await remark(input);
  const reviewItems=[];
  await remark({...input,reviewItems});
  assert.equal(reviewItems.length,1);
  assert.equal(reviewItems[0].target,60);
  assert.deepEqual(reviewItems[0].assignmentPlanIds,[7]);
  assert.equal(reviewItems[0].excess,20);
  const originalKey=reviewItems[0].key;
  const changed=[];
  await remark({...input,records:[{...input.records[0],quantity:61}],reviewItems:changed});
  assert.notEqual(changed[0].key,originalKey);
  assert.match(output,/기존 20개 \(2026-09-20 20개\) \+ 이번 60개 = 80개, 주문 대상 60개 대비 20개 초과/);
  assert.match(output,/AP1968 name/);assert.match(output,/초과 생산으로 저장함/);
  await remark({...input,excludedWorkLogId:9});assert.deepEqual(excluded,{not:9});
  history=[];
  assert.equal(await remark({...input,note:output}),'User note');
  scope='MALE_ONLY';assert.match(await remark(input),/주문 대상 30개 대비 30개 초과/);
  assert.equal(applicable({genderScope:'UNISEX'},{total:60,male:30,female:30}),60);
  scope='UNISEX';
  db.styleProcess.findMany=async()=>[{id:648,processCode:'TT01',genderScope:scope},{id:649,processCode:'TT02',genderScope:scope}];
  const comparisonItems=[];
  await remark({...input,comparisonItems});
  assert.equal(comparisonItems.length,2);
  assert.equal(comparisonItems.find(row=>row.styleProcessId===649).total,0);
  assert.equal(comparisonItems.find(row=>row.styleProcessId===649).difference,-60);
  assert.equal(comparisonItems[0].requiredSetComplete,true);
});

test('comparison summarizes finished excess only with complete shared required processes',()=>{
  const source=readFileSync('frontend/src/pages/App/work/QuantityImportReviewTable.jsx','utf8');
  const {groupQuantityComparison:group}=load(source,['groupQuantityComparison']);
  const {summarizeProductionMonths:months}=load(source,['summarizeProductionMonths']);
  assert.deepEqual(months([{date:'2026-08-01',quantity:20},{date:'2026-08-31',quantity:20},{date:'2026-09-30',quantity:65}]),[{month:'2026-08',quantity:40},{month:'2026-09',quantity:65}]);
  const base={orderId:1,styleId:2,target:60,orderQuantity:60,genderScope:'UNISEX',required:true,requiredSetComplete:true};
  assert.equal(group([{...base,total:65},{...base,total:65}])[0].finishedQuantity,65);
  assert.equal(group([{...base,total:65},{...base,total:55}])[0].finishedQuantity,55);
  assert.equal(group([{...base,total:65,requiredSetComplete:false}])[0].finishedQuantity,null);
  assert.equal(group([{...base,total:65},{...base,total:30,target:30,genderScope:'MALE_ONLY'}])[0].finishedQuantity,null);
});

test('gender-aware complete sets distinguish extra garments from unmatched process output',()=>{
  const source=readFileSync('frontend/src/pages/App/work/QuantityImportReviewTable.jsx','utf8');
  const {estimateProductionSets:estimate}=load(source,['estimateProductionSets']);
  const row=(id,scope,total,target=1120)=>({styleProcessId:id,genderScope:scope,total,target,required:true,requiredSetComplete:true});
  const group={orderMaleQuantity:560,orderFemaleQuantity:560,orderUnspecifiedQuantity:0,rows:[row(1,'UNISEX',1125),row(2,'UNISEX',1125),row(3,'FEMALE_ONLY',560,560)]};
  const result=estimate(group);
  assert.deepEqual([result.total,result.maleMin,result.maleMax,result.femaleMin,result.femaleMax,result.hasRemnants],[1125,565,565,560,560,false]);
  const unmatched=estimate({...group,rows:[row(1,'UNISEX',1125),row(2,'UNISEX',1120),row(3,'FEMALE_ONLY',560,560)]});
  assert.equal(unmatched.total,1120);assert.equal(unmatched.maleMin,560);assert.equal(unmatched.femaleMin,560);
  assert.deepEqual(unmatched.remnants.find(row=>row.styleProcessId===1),{styleProcessId:1,min:5,max:5});
  const ambiguous=estimate({...group,rows:[row(1,'UNISEX',1125),row(2,'UNISEX',1125)]});
  assert.deepEqual([ambiguous.maleMin,ambiguous.maleMax,ambiguous.femaleMin,ambiguous.femaleMax],[560,565,560,565]);
  assert.equal(ambiguous.total,1125);
  assert.equal(estimate({...group,orderUnspecifiedQuantity:1}),null);
  assert.equal(estimate({...group,rows:[{...group.rows[0],requiredSetComplete:false}]}),null);
  const unisex=estimate({...group,orderMaleQuantity:0,orderFemaleQuantity:0,orderUnisexQuantity:100,rows:[row(1,'UNISEX',105,100)]});
  assert.deepEqual([unisex.total,unisex.maleMax,unisex.femaleMax,unisex.unisexMin,unisex.unisexMax,unisex.hasRemnants],[105,0,0,105,105,false]);
  const three=estimate({...group,orderUnisexQuantity:100,rows:[row(1,'UNISEX',1225,1220),row(3,'FEMALE_ONLY',560,560)]});
  assert.deepEqual([three.total,three.maleMin,three.maleMax,three.femaleMin,three.femaleMax,three.unisexMin,three.unisexMax],[1225,560,565,560,560,100,105]);
});

test('explicit unisex garments remain distinct from missing gender and share common process targets',()=>{
  const {accumulateStyleProcessGenderQuantity:add,resolveStyleProcessRowApplicableQuantity:target}=load(backend,['accumulateStyleProcessGenderQuantity','resolveStyleProcessRowApplicableQuantity'],{normalizeProcessGenderScope:value=>value});
  const bucket={total:0,male:0,female:0,unspecified:0};
  add(bucket,'M',30);add(bucket,'W',30);add(bucket,'U',10);
  assert.deepEqual(bucket,{total:70,male:30,female:30,unisex:10,unspecified:0});
  assert.equal(target({genderScope:'UNISEX'},bucket),70);
  assert.equal(target({genderScope:'MALE_ONLY'},bucket),30);
  assert.equal(target({genderScope:'FEMALE_ONLY'},bucket),30);
  add(bucket,null,2);assert.equal(bucket.unspecified,2);assert.equal(bucket.unisex,10);
});

test('import review precedes every write and requires fresh server quantities and server actor',async()=>{
  let creates=0; let reviewKey='original';
  const deps={
    prisma:{$transaction:async fn=>fn({workLog:{create:async()=>{creates++;return {id:3};}},workRecord:{createMany:async()=>{}}})},
    organization:{id:1},validatedGroups:[{normalized:{records:[{assignmentPlanId:7,styleProcessId:648,quantity:60}],note:null}}],
    req:{body:{}},updatedBy:'Reviewer',ensureArray:v=>Array.isArray(v)?v:[],
    appendWorkLogQuantityRemark:async args=>{ if(args.reviewItems)args.reviewItems.push({key:reviewKey,assignmentPlanIds:[7],styleProcessId:648,description:'Existing 20 + new 60 = 80; target 60'});return null;},
    createHttpError:(status,message)=>Object.assign(Error(message),{status}),
    buildWorkLogWriteDataWithOptionalCoverage:data=>data,Prisma:{DbNull:null},
    buildCanonicalWorkRecordWriteData:args=>args.record,
  };
  let captured;
  deps.prisma.$transaction=async fn=>fn({workLog:{create:async({data})=>{captured=data;creates++;return {id:3};}},workRecord:{createMany:async()=>{}}});
  const {createImportTransaction:save}=load(backend,['createImportTransaction'],deps);
  await assert.rejects(save(true),error=>error.quantityReviewItems[0].key==='original');
  assert.equal(creates,0);
  deps.req.body.approvedQuantityKeys=['original'];
  await save(true);assert.equal(creates,1);assert.match(captured.note,/이상 없음 승인: Reviewer/);
  reviewKey='changed-history';
  await assert.rejects(save(true),error=>error.quantityReviewItems[0].key==='changed-history');
  assert.equal(creates,1);
});

test('employee duplicate validation returns only the matching saved records with date and quantity',async()=>{
  const existing={workerId:15,assignmentPlanId:7,styleProcessId:648,quantity:20,workLog:{id:5,displayDate:'2026-09-30',factory:{name:'HANOI'}}};
  let query;
  const names=['buildWorkRecordActorProcessSignature','buildWorkRecordWorkerStyleProcessSignature','buildOutsourcedWorkRecordSignature','validateWorkLogWorkerStyleProcessDuplicates'];
  const {validateWorkLogWorkerStyleProcessDuplicates:validate}=load(backend,names,{
    ...common,ensureArray:v=>Array.isArray(v)?v:[],normalizeDateKey:text,
    collectPositiveIntSet:(...values)=>[...new Set(values.map(positive).filter(Boolean))],
    formatWorkerStyleProcessIdentityLabel:()=>'',formatOutsourcedRecordIdentityLabel:()=>'',
    prisma:{workRecord:{findMany:async args=>{query=args;return [existing,{...existing,styleProcessId:999}];}}},
  });
  const result=await validate({orgId:1,workDate:'2026-09-30',records:[{...existing,quantity:30}]});
  assert.deepEqual(result.existingConflictRows,[existing]);
  assert.equal(query.select.quantity,true);assert.equal(query.select.workLog.select.displayDate,true);
  const incoming=await validate({orgId:1,workDate:'2026-09-30',records:[existing,{...existing,quantity:30}]});
  assert.equal(incoming.incomingDuplicateRows.length,1);assert.equal(incoming.conflictRows.length,0);
});

test('AT process projection keeps customer identity separate from manufacturer ownership', async()=>{
  const ast=ts.createSourceFile('index.ts',backend,ts.ScriptTarget.Latest,true);
  let projection;
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='loadAtTrainingDataFromBuckets'){
      function query(n){
        if(ts.isCallExpression(n)&&n.expression.getText(ast)==='prisma.styleProcess.findMany'){
          const arg=n.arguments[0];const selected=arg.properties.find(p=>p.name?.getText(ast)==='select');
          projection=new Function('return ('+selected.initializer.getText(ast)+');')();
        }
        ts.forEachChild(n,query);
      }
      query(node);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  assert.ok(projection);
  const source={id:40,orgId:1,customerOrgId:2};
  const projected=Object.fromEntries(Object.entries(source).filter(([key])=>projection.style.select[key]===true));
  const {loadRelationshipTimeBucketContextByStyleId:contexts,applyRelationshipTimeBucketContexts:apply}=load(backend,['loadRelationshipTimeBucketContextByStyleId','applyRelationshipTimeBucketContexts'],{
    ...common,toPositiveInt:(v,d)=>positive(v)??d,ensureArray:v=>Array.isArray(v)?v:[],prisma:null,
    createHttpError:(status,message)=>Object.assign(Error(message),{status}),
  });
  const db={orgRelationship:{findMany:async({where})=>{
    assert.equal(where.manufacturerOrgId,1);assert.deepEqual(where.brandOrgId.in,[2]);
    return [{id:9,brandOrgId:2,timeBucketSetVersion:{id:5,entries:[{bucketQuantity:1000}]},timeBucketOverrides:[]}];
  }}};
  const map=await contexts({db,manufacturerOrgId:1,styles:[projected]});
  assert.equal(apply({styles:[projected],contextByStyleId:map})[0].timeBucketSetVersionId,5);
  await assert.rejects(async()=>apply({styles:[{id:40,orgId:1}],contextByStyleId:await contexts({db,manufacturerOrgId:1,styles:[{id:40,orgId:1}]})}),/missing for style 40/);
});

test('style API and editor never substitute customer and manufacturer IDs',()=>{
  const api=readFileSync('frontend/src/utils/styleApi.js','utf8');
  const {normalizeStyle}=load(api,['normalizeStyle'],{
    toPositiveOrgId:positive,normalizeProcesses:v=>v||[],normalizeArray:v=>Array.isArray(v)?v:[],normalizeBucketQuantities:v=>v||[],
  });
  assert.equal(normalizeStyle({customerOrgId:2}).ownerOrgId,null);
  assert.equal(normalizeStyle({ownerOrgId:1}).customerOrgId,null);
  assert.equal(normalizeStyle({orgId:1,customerOrgId:2}).ownerOrgId,1);
  const detail=readFileSync('frontend/src/pages/App/style/StyleDetail.jsx','utf8');
  const {buildPayload}=load(detail,['buildPayload'],{todayDateKey:()=> '2026-10-08',createEmptyStyle:()=>({}),toOrgId:positive});
  assert.equal(buildPayload({id:'X',ownerOrgId:1}).customerOrgId,null);
  assert.equal(buildPayload({id:'X',customerOrgId:2}).ownerOrgId,null);
  assert.doesNotMatch(detail,/customerOrgId:\s*styleFormData.customerOrgId\s*\|\|\s*resolvedOwnerOrgId/);
  assert.doesNotMatch(order,/customerOrgId:\s*style.customerOrgId\s*\?\?\s*style.ownerOrgId/);
});

test('AT source lookup isolates manufacturers sharing a customer',()=>{
  const ast=ts.createSourceFile('index.ts',backend,ts.ScriptTarget.Latest,true);let where;
  function visit(n){
    if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='buildAtTrainingBucketDraftsFromRawSource'){
      function query(q){if(ts.isCallExpression(q)&&q.expression.getText(ast)==='db.style.findMany'){
        const property=q.arguments[0].properties.find(p=>p.name?.getText(ast)==='where');
        where=new Function('orgId','syncTargetOrgIds','styleIds','return ('+property.initializer.getText(ast)+');')(1,[2],[40]);
      }ts.forEachChild(q,query);}query(n);
    }ts.forEachChild(n,visit);
  }visit(ast);
  assert.equal(where.orgId,1);assert.deepEqual(where.customerOrgId.in,[2]);
  const rows=[{id:40,orgId:1,customerOrgId:2},{id:41,orgId:3,customerOrgId:2}];
  assert.deepEqual(rows.filter(s=>s.orgId===where.orgId&&where.customerOrgId.in.includes(s.customerOrgId)).map(s=>s.id),[40]);
});

test('unused style deletes editable prices atomically and rejects orders, production and assignments', async()=>{
  const {deleteUnusedStyle:remove}=load(backend,['deleteUnusedStyle'],{createHttpError:(status,message)=>Object.assign(new Error(message),{status})});
  for (const blocked of [null,'workRecord','outsourcedWorkRecord','workOrderItem','assignmentPlan']) {
    const calls=[];
    const tx={$queryRawUnsafe:async()=>calls.push('lock')};
    for(const model of ['workRecord','outsourcedWorkRecord','workOrderItem','assignmentPlan']) tx[model]={findFirst:async()=>model===blocked?{id:1,workOrder:{orderId:'ORDER'}}:null};
    tx.customerSalesPriceList={deleteMany:async()=>calls.push('prices')};
    tx.style={delete:async()=>calls.push('style')};
    const db={$transaction:async fn=>fn(tx)};
    if(blocked){await assert.rejects(()=>remove(db,13),e=>e.status===409);assert.deepEqual(calls,['lock']);}
    else {await remove(db,13);assert.deepEqual(calls,['lock','prices','style']);}
  }
});

test('internal style creation requires customer ID; import resolves unique customer names only', async () => {
  const customers = [{ brand: { id: 2, name: 'Same customer' } }, { brand: { id: 3, name: 'Same customer' } }];
  const { resolveStyleOwnerForCreateOrThrow: resolve } = load(backend, ['resolveStyleOwnerForCreateOrThrow'], {
    ...common, isManufacturerOrg: () => true,
    createHttpError: (status,message) => Object.assign(new Error(message),{status}),
    prisma: { orgRelationship: { findFirst: async ({where}) => customers.find(c=>c.brand.id===where.brandOrgId), findMany: async()=>customers } },
  });
  const organization={id:1};
  await assert.rejects(()=>resolve({organization,payload:{customer:'Same customer'}}),/customerOrgId is required/);
  await assert.rejects(()=>resolve({organization,payload:{customer:'Same customer'},allowImportName:true}),/multiple customers/);
  assert.equal((await resolve({organization,payload:{customerOrgId:2,customer:'Renamed'}})).customerOrgId,2);
  customers.pop();
  assert.equal((await resolve({organization,payload:{customer:'Same customer'},allowImportName:true})).customerOrgId,2);
});

test('process component resolver uses master ID across code/name changes and rejects missing/wrong type IDs', () => {
  const { findMatchingProcessMasterOptionRow: resolve } = load(backend,['findMatchingProcessMasterOptionRow'],{
    ...common, createHttpError:(status,message)=>Object.assign(new Error(message),{status}),
  });
  const rows=[{id:7,type:'LOCATION',code:'NEW_CODE',label:'New name'},{id:8,type:'LOCATION',code:'OLD_CODE',label:'Old name'}];
  assert.equal(resolve({rows,entry:{masterOptionId:7,code:'OLD_CODE',label:'Old name'}}).id,7);
  assert.throws(()=>resolve({rows,entry:{masterOptionId:99,code:'OLD_CODE'}}),/missing or wrong type/);
  assert.throws(()=>resolve({rows,entry:{code:'OLD_CODE'}}),/masterOptionId is required/);
  assert.equal(resolve({rows,entry:{isCustom:true,label:'Direct input'}}),null);
});

test('current composition labels and codes refresh by master ID after a rename',()=>{
  const {applyProcessMasterNamesToCompositionEntry: apply}=load(backend,['applyProcessMasterNamesToCompositionEntry'],{
    PROCESS_COMPOSITION_KIND_BY_MASTER_TYPE:{LOCATION:'location'},normalizeStyleProcessCompositionEntry:value=>value,
  });
  const lookup=new Map([['LOCATION',new Map([['7',{code:'NEW',label:'Renamed',nameKo:'새 이름',nameEn:'Renamed',nameVi:'Moi'}]])]]);
  const entry={masterOptionId:7,code:'OLD',label:'Original'};
  const result=apply(entry,'LOCATION',lookup);
  assert.equal(result.masterOptionId,7);assert.equal(result.code,'NEW');assert.equal(result.label,'Renamed');
  assert.deepEqual(entry,{masterOptionId:7,code:'OLD',label:'Original'});
});

test('historical PART/SPEC masters are kept separate from the current editing resolver',()=>{
  const {createProcessMasterResolverState: state}=load(backend,['createProcessMasterResolverState'],{
    ...common, PROCESS_MASTER_TYPE_KEYS:['LOCATION','TARGET','TARGET_SPEC','ACTION','ACTION_SPEC'],
    normalizeProcessMasterType:value=>({PART:'LOCATION',SPEC:'TARGET_SPEC'})[value]||value,
    normalizeProcessMasterCode:text,
  });
  const result=state([{id:1,type:'LOCATION',code:'SAME'},{id:2,type:'PART',code:'SAME'},{id:3,type:'SPEC',code:'SPEC'}]);
  assert.deepEqual(result.rowsByType.get('LOCATION').map(r=>r.id),[1]);
  assert.equal(result.rowsByType.get('TARGET_SPEC').length,0);
});

test('order duplicate detection never substitutes party names for missing IDs',()=>{
  const {hasDuplicateOrderNumberByCustomer: duplicate}=load(order,['hasDuplicateOrderNumberByCustomer'],{toOrgId:positive});
  const existing={id:'o1',orderNumber:'001',buyerOrgId:2,sellerOrgId:1,buyerOrgName:'Same',sellerOrgName:'Baro'};
  assert.equal(duplicate({orders:[existing],orderNumber:'001',buyerOrgId:3,sellerOrgId:1,buyerOrgName:'Same',sellerOrgName:'Baro'}),false);
  assert.equal(duplicate({orders:[existing],orderNumber:'001',buyerOrgId:2,sellerOrgId:1,buyerOrgName:'Renamed'}),true);
  assert.equal(duplicate({orders:[existing],orderNumber:'001',buyerOrgName:'Same',sellerOrgName:'Baro'}),false);
});

test('work record comparison is stable across renames and never restores identity from names/codes',()=>{
  const {buildComparableWorkRecord: compare}=load(work,['buildComparableWorkRecord'],common);
  const record={workerId:1,assignmentPlanId:2,styleProcessId:3,styleCode:'OLD',processName:'Old',quantity:10};
  assert.deepEqual(compare(record),compare({...record,styleCode:'NEW',processName:'New'}));
  assert.equal(compare({quantity:10,workerName:'Same',styleCode:'Same',processCode:'Same'}).processKey,'');
});

test('outsourcing duplicate lookup uses vendor FK across renames and distinguishes different vendors', async () => {
  let query;
  const existing = { outsourcingPartnerId: 7, outsourceVendorName: 'Old name', assignmentPlanId: 4, styleProcessId: 8 };
  const deps = { ...common, resolveWorkRecordProcessMetricFromRecord: row => ({ processMetricKey: `process:${row.styleProcessId}` }),
    prisma: { outsourcedWorkRecord: { findMany: async args => { query = args; return args.where.outsourcingPartnerId.in.includes(7) ? [existing] : []; } } },
    ensureArray: value => Array.isArray(value) ? value : [], normalizeDateKey: text,
    collectPositiveIntSet: (...values) => [...new Set(values.map(positive).filter(Boolean))],
    formatOutsourcedRecordIdentityLabel: row => row.outsourceVendorName,
    formatWorkerStyleProcessIdentityLabel: () => '', buildWorkRecordWorkerStyleProcessSignature: () => '',
  };
  const { validateWorkLogWorkerStyleProcessDuplicates: validate } = load(backend,
    ['buildWorkRecordActorProcessSignature', 'buildOutsourcedWorkRecordSignature', 'validateWorkLogWorkerStyleProcessDuplicates'], deps);
  const args = { orgId: 1, workDate: '2026-10-02', recordKind: 'OUTSOURCING', excludedWorkLogId: 22 };
  assert.equal((await validate({ ...args, records: [{ ...existing, outsourceVendorName: 'New name' }] })).status, 400);
  assert.deepEqual(query.where.outsourcingPartnerId.in, [7]);
  assert.equal(query.where.workLog.id.not, 22);
  assert.equal(query.select.outsourcingPartnerId, true);
  assert.equal((await validate({ ...args, records: [{ ...existing, outsourcingPartnerId: 9 }] })).status, 200);
});

test('process selection keeps FK identity despite identical names, codes and UI keys', () => {
  const { isSameProcess, resolveProcessOption, buildProcessIdentityKey } = load(work, ['isSameProcess', 'resolveProcessOption', 'buildProcessIdentityKey'], {
    ...common, mergeMatchedProcessOption: (row, match) => ({ ...row, ...match }),
  });
  const a = { styleProcessId: 1, code: 'P', name: 'Sew', processKey: 'same', ctSeconds: 10 };
  const b = { ...a, styleProcessId: 2, ctSeconds: 40 };
  assert.equal(isSameProcess(a, b), false);
  assert.notEqual(buildProcessIdentityKey(a), buildProcessIdentityKey(b));
  assert.equal(buildProcessIdentityKey({ name: 'Sew', code: 'P' }), '');
  assert.equal(isSameProcess({ name: 'Sew' }, { name: 'Sew' }), false);
  assert.equal(resolveProcessOption(b, { processes: [a, b] }).ctSeconds, 40);
  const broken = { ...a, styleProcessId: 99 };
  assert.equal(resolveProcessOption(broken, { processes: [a] }), broken);
});

test('worker and factory selection never replaces missing IDs by a matching name', () => {
  const { matchById: match } = load(work, ['matchById'], common);
  const options = [{ id: 1, name: 'Same' }, { id: 2, name: 'Same' }];
  assert.equal(match(options, { id: 2, name: 'Renamed' }).id, 2);
  assert.equal(match(options, { id: 3, name: 'Same' }), null);
  assert.equal(match(options, { name: 'Same' }), null);
});

test('outsourcing UI duplicate actor is stable across renames and distinct for different partner IDs', () => {
  const { buildWorkerMetric: metric } = load(work, ['buildWorkerMetric'], common);
  assert.equal(metric({ outsourcingPartnerId: 1, workerName: 'A' }).key, metric({ outsourcingPartnerId: 1, workerName: 'B' }).key);
  assert.notEqual(metric({ outsourcingPartnerId: 1, workerName: 'A' }).key, metric({ outsourcingPartnerId: 2, workerName: 'A' }).key);
});

test('order style candidates use customer ID, including duplicate and renamed customer names', () => {
  const styles = [{ id: 1, customerOrgId: 7, customer: 'Old' }, { id: 2, customerOrgId: 8, customer: 'New' }];
  const get = buyer => load(order, ['availableStyleOptions'], { useMemo: fn => fn(), styleOptions: styles, selectedBuyerOrgId: buyer }).availableStyleOptions;
  assert.deepEqual(get(7).map(row => row.id), [1]);
  assert.deepEqual(get(8).map(row => row.id), [2]);
  assert.deepEqual(get(NaN), []);
});

test('order buyer display is defined while selection readiness depends only on its FK', () => {
  const get = formData => load(order, ['selectedBuyerOrgId', 'hasSelectedBuyer', 'selectedBuyerName'], { formData });
  assert.deepEqual(get({ buyerOrgId: 7, buyerOrgName: 'Renamed' }), { selectedBuyerOrgId: 7, hasSelectedBuyer: true, selectedBuyerName: 'Renamed' });
  assert.equal(get({ buyerOrgId: 7 }).hasSelectedBuyer, true);
  assert.equal(get({ buyerOrgName: 'Same name' }).hasSelectedBuyer, false);
  assert.doesNotMatch(order, /if \(!selectedBuyerName\)|disabled=\{!selectedBuyerName\}/);
});

test('import refuses ambiguous processes inside one assignment instead of choosing the first', () => {
  const { resolveWorkLogImportMatchedProcess: match } = load(backend, ['resolveWorkLogImportMatchedProcess'], {
    resolveOptionalString: value => value || null, normalizeProcessCodeKey: text, normalizeProcessNameKey: text,
    buildWorkLogImportPlanProcessOptions: plan => plan.processes,
    buildWorkLogImportProcessCodeCandidates: row => [row.processCode],
    createHttpError: (status, message) => Object.assign(new Error(message), { status }),
  });
  const plan = { processes: [{ styleProcessId: 1, processCode: 'P1', processName: 'Sew' }, { styleProcessId: 2, processCode: 'P2', processName: 'Sew' }] };
  assert.throws(() => match({ plan, processCode: 'Sew' }), error => error.status === 409);
  assert.equal(match({ plan, processCode: 'P2' }).styleProcessId, 2);
  assert.equal(match({ plan, processCode: 'unknown' }), null);
});

test('assignment progress reads current outsourced vendor through the relation', () => {
  const query = backend.slice(backend.indexOf('const outsourcedRows: any[] = await prisma.outsourcedWorkRecord.findMany'), backend.indexOf('const outsourcedRows: any[] = await prisma.outsourcedWorkRecord.findMany') + 2000);
  assert.match(query, /outsourcingPartner: \{ select: \{ name: true \} \}/);
  assert.match(backend, /resolveOptionalString\(record\?\.outsourcingPartner\?\.name, "외주"\)/);
});
