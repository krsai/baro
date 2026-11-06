import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ledgerApprovalBands} from '../frontend/src/utils/ledgerApprovalBands.mjs';
const {canSkipApprovalStage}=createRequire(import.meta.url)('../backend/dist/services/approvalStageAuthority');

test('intermediate authority requires the same role, active grade and grade set; final never skips',async()=>{
 const drafter={id:1,orgRole:'ACCOUNTANT'},stage={role:'ACCOUNTANT',gradeId:2};
 let own={grade:{isActive:true,set:{isActive:true},setId:1,sortOrder:2}},required={setId:1,sortOrder:2};
 const db={employee:{findFirst:async()=>own},employeeGrade:{findFirst:async()=>required}};
 assert.equal(await canSkipApprovalStage(db,7,drafter,stage,false),true);
 assert.equal(await canSkipApprovalStage(db,7,drafter,stage,true),false);
 assert.equal(await canSkipApprovalStage(db,7,{...drafter,orgRole:'ADMIN'},stage,false),false);
 required={setId:2,sortOrder:1};assert.equal(await canSkipApprovalStage(db,7,drafter,stage,false),false);
 required={setId:1,sortOrder:3};assert.equal(await canSkipApprovalStage(db,7,drafter,stage,false),false);
 required=null;assert.equal(await canSkipApprovalStage(db,7,drafter,stage,false),false);
 own={grade:{isActive:false,set:{isActive:true},setId:1,sortOrder:2}};assert.equal(await canSkipApprovalStage(db,7,drafter,{role:'ACCOUNTANT',gradeMatch:'ANY'},false),false);
});

test('legacy registration becomes unbounded currency bands without mutating its source',()=>{
 const source={registrationStages:[{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'},{role:'ACCOUNTANT',gradeId:2,gradeMatch:'MINIMUM'}]};
 const before=JSON.stringify(source),rules=ledgerApprovalBands(source);
 assert.deepEqual(rules.map(row=>row.currency),['USD','KRW','VND']);
 assert.ok(rules.every(row=>row.min==='0'&&row.max===null));
 rules[0].stages[0].gradeId=9;assert.equal(JSON.stringify(source),before);
 assert.throws(()=>ledgerApprovalBands({}),/INVALID_APPROVAL_SETTINGS/);
});
