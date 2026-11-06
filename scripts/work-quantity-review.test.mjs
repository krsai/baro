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
