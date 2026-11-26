import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {validEvidencePath} from '../frontend/src/utils/evidenceReference.mjs';
import {ledgerInputIssue} from '../frontend/src/utils/ledgerInputIssue.mjs';
const require=createRequire(import.meta.url);
const {resolveEvidence}=require('../backend/dist/services/bankEvidence');
const {ledgerRegistrationSource}=require('../backend/dist/services/ledgerRegistration');
const invalid=['','X','receipt.pdf','folder/receipt.pdf','C:receipt.pdf','C:\\','\\\\server\\share','/receipts/','/a/../receipt.pdf','/a/./receipt.pdf','https://example.com/','https://user:pass@example.com/receipt.pdf','https://example.com/bad%xx','javascript:alert(1)','/receipt.pdf\nX','/bad\u0000.pdf'];
const valid=['C:\\Evidence\\receipt.pdf','D:/Evidence/Receipt.pdf','\\\\server\\share\\receipt.pdf','/receipts/receipt.pdf','https://example.com/receipt.pdf?download=1','"C:\\Evidence Files\\receipt.pdf"',"'/receipts/receipt.pdf'"];
test('full paths only, with matching frontend/backend syntax and no network or filesystem probing',async()=>{
 assert.equal(readFileSync('frontend/src/utils/evidenceReference.mjs','utf8'),readFileSync('backend/src/utils/evidencePath.js','utf8'));
 for(const path of [...invalid,...valid]){
  const expected=valid.includes(path);assert.equal(validEvidencePath(path),expected,JSON.stringify(path));
  const row={entryKind:'BANK',clientKey:'main',accountId:'bank',amount:'10',accountingCodeId:1,evidenceType:'FILE',evidenceNumber:path,counterparty:{kind:'PARTNER',id:2}};
  assert.equal(ledgerInputIssue([row],[{id:'bank',currencyCode:'USD'}],[])?.field,expected?undefined:'evidence');
  const resolve=()=>resolveEvidence({},1,{currencyCode:'USD'},row);
  if(expected)assert.equal((await resolve()).evidenceNumber,path.trim());else{
   await assert.rejects(resolve,/LEDGER_FILE_REQUIRED/);
   await assert.rejects(ledgerRegistrationSource({},1,{sourceId:'batch',payload:{clientKey:'batch',rows:[{...row,purpose:'Payment'}]}}),/LEDGER_FILE_REQUIRED/);
  }
 }
});
test('internal transfer evidence remains separate from file paths',async()=>{
 const result=await resolveEvidence({},1,{currencyCode:'USD'},{evidenceType:'FILE',evidenceNumber:'IBT:transfer-key',amount:'10',counterparty:{kind:'ACCOUNT',id:'owned-account'}});
 assert.equal(result.evidenceNumber,'IBT:transfer-key');
 await assert.rejects(resolveEvidence({},1,{currencyCode:'USD'},{evidenceType:'FILE',evidenceNumber:'IBT:fake',amount:'10',counterparty:{kind:'PARTNER',id:2}}),/LEDGER_FILE_REQUIRED/);
});
