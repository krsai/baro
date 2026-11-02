import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {resolveReliabilityRiskColor} from '../frontend/src/utils/reliabilityColor.js';
import {getLabelPalette} from '../frontend/src/theme/labelPalette.js';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
test('worker-period totals alone cannot identify per-process time: allocation changes when ST shares change',()=>{
 const {fitAtParamsWithProportionalAllocation}=require('../backend/dist/services/atTraining');
 const day={dayKey:'2026-09-01',order:1,workerId:1,productionStage:'SEWING',laborInputSeconds:28800,processRows:[{metricKey:'A',quantity:100},{metricKey:'B',quantity:100}]};
 const first=fitAtParamsWithProportionalAllocation([day],{initialPerPieceByMetricKey:new Map([['A',100],['B',100]])});
 const second=fitAtParamsWithProportionalAllocation([day],{initialPerPieceByMetricKey:new Map([['A',200],['B',100]])});
 assert.deepEqual(first.allocatedObservations.map(o=>o.laborInputSeconds),[14400,14400]);
 assert.deepEqual(second.allocatedObservations.map(o=>o.laborInputSeconds),[19200,9600]);
});
test('reliability display uses green from 70, yellow from 50, gray for low or unavailable values',()=>{
 for(const [value,tone] of [[70,'green'],[90,'green'],[100,'green'],[69,'yellow'],[50,'yellow'],[49,'gray'],[null,'gray']]){
  const palette=getLabelPalette(tone);assert.deepEqual(resolveReliabilityRiskColor(value),{bg:palette.background,text:palette.text});
 }
});
test('raw AT row normalization preserves explicit production stages instead of silently training every row as sewing',()=>{
 const source=fs.readFileSync('backend/src/index.ts','utf8'),tree=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);let declaration;
 const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='preliminaryRows')declaration=node;ts.forEachChild(node,visit);};visit(tree);assert.ok(declaration);
 let callback;const findCallback=node=>{if(ts.isArrowFunction(node)&&node.parameters[0]?.name.getText(tree)==='record')callback=node;ts.forEachChild(node,findCallback);};findCallback(declaration.initializer);assert.ok(callback);
 for(const productionStage of ['SEWING','IRONING','INSPECTION','PACKING']){
  const deps={toPositiveIntOrNull:v=>Number(v)>0?Number(v):null,resolveCandidateStyle:()=>({id:1}),styleProcessRowsById:new Map([[11,{styleId:1,productionStage}]]),resolveOptionalString:(v,f)=>v??f,resolveWorkRecordProcessName:()=>'',normalizeProductionStage:v=>v??'SEWING',resolveWorkRecordEffectiveCoverageStartDate:()=>null,resolveWorkRecordEffectiveCoverageEndDate:()=>null,periodStartDateKey:'2026-10-01',normalizedCoverageEndDate:'2026-10-31',workLogId:1,workLog:{},isEligibleWorkerOnDate:()=>true,diagnostics:{},pushAtTrainingSourceDiagnosticSample:()=>{},workerEligibilityFailureReasonById:new Map()};
  const fn=new Function(...Object.keys(deps),'return '+ts.transpileModule('('+callback.getText(tree)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(deps));
  const row=fn({quantity:20,workerId:2,assignmentPlanId:3,styleProcessId:11});assert.equal(row.productionStage,productionStage);assert.equal(fn({isOutsourced:true}),null);
 }
});
