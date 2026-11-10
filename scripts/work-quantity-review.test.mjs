import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=readFileSync('backend/src/index.ts','utf8');
const names=['appendWorkLogQuantityRemark','reviewWorkLogQuantityBeforeSave','resolveStyleProcessRowApplicableQuantity'];
const ast=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true),declarations=[];
function visit(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(ast)))declarations.push(`const ${node.getText(ast)};`);ts.forEachChild(node,visit);}visit(ast);
assert.equal(declarations.length,names.length);
const js=ts.transpileModule(declarations.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 let prior=80;const locks=[],scopes=[];
 const plans=[{id:7,orgId:1,factoryId:2,styleId:40,workOrderId:5,style:{name:'AM01622'},workOrder:{orderNumber:'L16-1'},assignmentCtSnapshot:{processes:[{styleProcessId:648}]}},{id:8,orgId:1,factoryId:2,styleId:40,workOrderId:6,style:{name:'AM01622'},workOrder:{orderNumber:'L16-2'},assignmentCtSnapshot:{processes:[{styleProcessId:648}]}}];
 const db={
  $queryRawUnsafe:async(...args)=>{locks.push(args);return[];},
  assignmentPlan:{findMany:async({where})=>{scopes.push(where);return plans.filter(plan=>plan.orgId===where.orgId&&(where.id?where.id.in.includes(plan.id):plan.styleId===where.styleId&&plan.workOrderId!==where.workOrderId.not&&(!where.factoryId||where.factoryId===plan.factoryId)));}},
  styleProcess:{findMany:async()=>[{id:648,processCode:'TS05',processName:'Sew collar',genderScope:'UNISEX'}]},
  workRecord:{findMany:async({where})=>{assert.equal(where.orgId,1);assert.deepEqual(where.workLogId,{not:9});return where.assignmentPlan.workOrderId.in.includes(5)?[{quantity:prior,styleProcessId:648,assignmentPlan:{workOrderId:5,styleId:40},workLog:{displayDate:'2026-11-01'}}]:[];}},
  outsourcedWorkRecord:{findMany:async()=>[]}
 };
 const deps={ensureArray:value=>Array.isArray(value)?value:[],toPositiveIntOrNull:value=>Number(value)>0?Number(value):null,collectWorkRecordAssignmentPlanIds:rows=>[...new Set(rows.map(row=>row.assignmentPlanId))],resolveNormalizedAssignmentCtSnapshot:plan=>plan.assignmentCtSnapshot,normalizeProcessGenderScope:value=>value,loadStyleGenderQuantityMapForWorkOrderIds:async()=>new Map([['5:40',{total:100,male:0,female:0}],['6:40',{total:200,male:0,female:0}]])};
 const api=new Function(...Object.keys(deps),`${js};return {reviewWorkLogQuantityBeforeSave};`)(...Object.values(deps));
 return {review:api.reviewWorkLogQuantityBeforeSave,args:{db,orgId:1,excludedWorkLogId:9,records:[{assignmentPlanId:7,styleProcessId:648,quantity:30}],note:'Manual note'},locks,scopes,setPrior:value=>{prior=value;}};
}
test('save review reports cumulative excess, alternative order quantities and company/factory scope',async()=>{
 const f=fixture();let error;
 try{await f.review(f.args,{body:{factoryId:2}});}catch(value){error=value;}
 assert.equal(error.message,'WORK_QUANTITY_REVIEW_REQUIRED');
 assert.equal(error.quantityReviewItems[0].previous,80);assert.equal(error.quantityReviewItems[0].incoming,30);assert.equal(error.quantityReviewItems[0].target,100);assert.equal(error.quantityReviewItems[0].excess,10);
 assert.equal(error.quantityAlternatives[0].orderNumber,'L16-2');assert.equal(error.quantityAlternatives[0].target,200);assert.equal(error.quantityAlternatives[0].incoming,30);assert.equal(error.quantityAlternatives[0].previous,0);
 assert.equal(f.locks.length,1);assert.equal(f.scopes.find(where=>where.styleId)?.factoryId,2);
 const key=error.quantityReviewItems[0].key;
 assert.match(await f.review(f.args,{body:{factoryId:2,approvedQuantityKeys:[key]}}),/Manual note/);
 f.setPrior(81);
 await assert.rejects(f.review(f.args,{body:{factoryId:2,approvedQuantityKeys:[key]}}),error=>error.quantityReviewItems[0].excess===11);
});
test('non-excess records save without requesting review',async()=>{
 const f=fixture();f.setPrior(20);assert.equal(await f.review(f.args,{body:{factoryId:2}}),'Manual note');assert.equal(f.scopes.length,1);
});

test('changing an order rebuilds excess remarks and preserves manual notes',async()=>{
 const f=fixture();
 f.args.note='Manual note\n[생산 수량 확인]\n주문 L16-1 old excess\n[/생산 수량 확인]\nAdditional note';
 f.args.records[0].assignmentPlanId=8;
 assert.equal(await f.review(f.args,{body:{factoryId:2}}),'Manual note\nAdditional note');
 f.args.records[0].quantity=230;
 let review;
 try{await f.review(f.args,{body:{factoryId:2}});}catch(error){review=error;}
 assert.equal(review.quantityReviewItems[0].orderNumber,'L16-2');
 const note=await f.review(f.args,{body:{factoryId:2,approvedQuantityKeys:[review.quantityReviewItems[0].key]}});
 assert.match(note,/Manual note\nAdditional note/);
 assert.match(note,/주문 L16-2/);
 assert.doesNotMatch(note,/L16-1|old excess/);
 assert.equal(note.match(/\[생산 수량 확인\]/g).length,1);
});

const frontendSource=readFileSync('frontend/src/pages/App/work/WorkDetail.jsx','utf8');
const frontendAst=ts.createSourceFile('WorkDetail.jsx',frontendSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
const helperNames=['isSameProcess','mergeMatchedProcessOption','changeWorkRowAssignment'];
const helpers=[];
function visitFrontend(node){if(ts.isVariableDeclaration(node)&&helperNames.includes(node.name.getText(frontendAst)))helpers.push(`const ${node.getText(frontendAst)};`);ts.forEachChild(node,visitFrontend);}visitFrontend(frontendAst);
assert.equal(helpers.length,helperNames.length);
const changeAssignment=new Function('toPositiveIdOrNull','toText',`${helpers.join('\n')};return changeWorkRowAssignment;`)(value=>Number(value)>0?Number(value):null,value=>String(value??'').trim());

test('order correction preserves process FK and quantity with the destination CT snapshot',()=>{
 const row={id:'row-1',worker:{id:3},assignment:{dbId:7},process:{styleProcessId:648,code:'TS05',ctSeconds:115},quantity:350,outsourceUnitPrice:20};
 const assignment={id:'L19-plan',dbId:8,processes:[{styleProcessId:648,code:'TS05',ctSeconds:120}]};
 const next=changeAssignment(row,assignment);
 assert.equal(next.assignment,assignment);assert.equal(next.styleOptionId,'L19-plan');
 assert.equal(next.process.styleProcessId,648);assert.equal(next.process.ctSeconds,120);
 assert.equal(next.quantity,350);assert.equal(next.worker,row.worker);assert.equal(next.outsourceUnitPrice,20);
 assert.equal(row.process.ctSeconds,115);
});

test('a missing or ambiguous destination process cannot be linked by its code',()=>{
 const row={process:{styleProcessId:648,code:'TS05'},quantity:350};
 for(const assignment of [null,{dbId:8,processes:[{styleProcessId:999,code:'TS05'}]},{dbId:8,processes:[{styleProcessId:648},{styleProcessId:648}]}]){
  const next=changeAssignment(row,assignment);
  assert.equal(next.process,null);assert.equal(next.quantity,'');
 }
});
