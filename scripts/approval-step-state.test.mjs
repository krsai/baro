import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalStepState,approvalStepLabels} from '../frontend/src/utils/approvalStepState.mjs';
test('only the current approver is pending, later approvers wait and rejected chains stop',()=>{
 const approval={steps:[{position:1,employeeId:1,approved:true},{position:2,employeeId:2},{position:3,employeeId:3}]};
 assert.deepEqual([1,2,3,4].map(id=>approvalStepState(approval,id)),['approved','pending','waiting','unconfirmed']);
 approval.rejected=true;approval.steps[1].rejected=true;
 assert.deepEqual([1,2,3].map(id=>approvalStepState(approval,id)),['approved','rejected','stopped']);
 for(const lang of ['ko','en','vi'])assert.equal(new Set(Object.values(approvalStepLabels[lang])).size,8);
});
