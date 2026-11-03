import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalAmountUnits,boundedApprovalBand,cleanApprovalBands,combineApprovalCurrencyRows,defaultApprovalBands,invalidApprovalBands,previousApprovalAmount,reflowApprovalBands,replaceApprovalGroup} from '../frontend/src/utils/approvalBands.mjs';
const grades=[{id:1,code:'CL1'},{id:10,code:'CL2'},{id:20,code:'CL3'}];
const settings={limits:{USD:{senior:'1000',lead:'5000'},VND:{senior:'20000000',lead:'100000000'}}};
const group={role:'OPERATOR',gradeId:null,currency:'USD'};
test('matching currency workflows share a compact row and different workflows stay separate',()=>{
 const groups=['USD','VND'].map(currency=>({currency,rows:defaultApprovalBands(settings,grades,{...group,currency})}));
 assert.equal(combineApprovalCurrencyRows(groups).length,3);
 groups[1].rows[0]={...groups[1].rows[0],stages:[{role:'ACCOUNTANT',gradeId:20}]};
 const rows=combineApprovalCurrencyRows(groups);assert.equal(rows.length,4);assert.equal(rows[0].entries.length,1);assert.equal(rows[1].entries[0].currency,'VND');
});
test('existing expense limits render as editable amount bands without writing or mutating them',()=>{
 const before=JSON.stringify(settings),rows=defaultApprovalBands(settings,grades,group);
 assert.deepEqual(rows.map(row=>[row.min,row.max]),[['0','1000'],['1000.01','5000'],['5000.01',null]]);
 assert.deepEqual(rows.map(row=>row.stages.length),[1,2,3]);assert.equal(invalidApprovalBands(rows),false);
 rows[0].max='1500';const next=reflowApprovalBands(rows,'USD');assert.equal(next[1].min,'1500.01');
 assert.equal(JSON.stringify(settings),before);assert.equal(previousApprovalAmount(next[1].min,'USD'),'1500.00');
 const vnd=defaultApprovalBands(settings,grades,{...group,currency:'VND'});assert.equal(vnd[1].min,'20000001');
});
test('band editing keeps currencies and drafter grades separate and prioritizes specific grades',()=>{
 const usd=defaultApprovalBands(settings,grades,group),vnd=defaultApprovalBands(settings,grades,{...group,currency:'VND'});
 const specific={...group,gradeId:1},rows=usd.map(row=>({...row,id:'specific-'+row.id,drafterGradeId:1}));
 const next=replaceApprovalGroup([...usd,...vnd],specific,rows);
 assert.equal(next[0].drafterGradeId,1);assert.equal(next.filter(row=>row.currency==='VND').length,3);
 const updated=replaceApprovalGroup(next,group,usd);assert.equal(updated[0].drafterGradeId,1);
});
test('unfinished amounts and invalid ranges block saving while repeated eligible grades remain selectable',()=>{
 const rows=defaultApprovalBands(settings,grades,group);
 const unfinished={...rows[0],max:'',__bounded:true};assert.equal(boundedApprovalBand(unfinished),true);assert.equal(invalidApprovalBands([unfinished]),true);
 assert.equal(invalidApprovalBands([{...rows[1],max:'999'}]),true);
 assert.equal(invalidApprovalBands([{...rows[0],stages:[{role:'OPERATOR',gradeId:20}]}]),true);
 const repeated={...rows[0],stages:[{role:'ACCOUNTANT',gradeId:10},{role:'ACCOUNTANT',gradeId:10}]};assert.equal(invalidApprovalBands([repeated]),false);
 assert.equal('__bounded' in cleanApprovalBands([{...rows[0],__bounded:true}])[0],false);
 assert.equal(approvalAmountUnits('1000.001','USD'),null);assert.equal(approvalAmountUnits('1000.1','VND'),null);
});
