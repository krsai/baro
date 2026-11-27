import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const source=readFileSync('frontend/src/utils/approvalMenuOptions.js','utf8').replace("'./accessControl'",JSON.stringify(pathToFileURL(path.resolve('frontend/src/utils/accessControl.js')).href));
const {approvalMenuOptions}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const auth=(orgType,features)=>({isAuthenticated:true,accessProfile:{entryType:'ORG',orgType,orgRole:'ADMIN',industryMenuFeatures:features}});
test('approval subjects follow company menu access and retain system defaults',()=>{
  const forwarder=auth('SERVICE',['OUTSOURCING_RECORD','BANK_LEDGER','INVOICE','WORK_TIME','APPROVAL_SETTINGS']);
  assert.deepEqual(approvalMenuOptions(forwarder),['EXPENSE','BANK_LEDGER','INVOICE','WORK_TIME']);
  assert.ok(approvalMenuOptions(auth('MANUFACTURER',['INVENTORY_MOVEMENTS'])).includes('INVENTORY'));
  assert.deepEqual(approvalMenuOptions(auth('SERVICE',['BANK_LEDGER'])),['BANK_LEDGER']);
  assert.deepEqual(approvalMenuOptions(auth('SERVICE',[])),[]);
  assert.deepEqual(approvalMenuOptions({},true),['EXPENSE','BANK_LEDGER','INVOICE','WORK_TIME','INVENTORY']);
});
