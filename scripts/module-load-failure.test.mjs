import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isModuleLoadFailure} from '../frontend/src/utils/moduleLoadFailure.mjs';

test('module failure classification does not disguise ordinary rendering errors',()=>{
 for(const message of ['Failed to fetch dynamically imported module: /assets/old.js','Importing a module script failed.','error loading dynamically imported module','Loading chunk 23 failed.','Unable to preload CSS for /assets/old.css'])assert.equal(isModuleLoadFailure(new Error(message)),true);
 for(const error of [new ReferenceError('value is not defined'),new TypeError('Cannot read properties of undefined'),new Error('Failed to fetch'),null,{}])assert.equal(isModuleLoadFailure(error),false);
 assert.equal(isModuleLoadFailure({name:'ChunkLoadError'}),true);
});

test('dashboard source editors load with the dashboard rather than on the first detail click',()=>{
 const source=readFileSync('frontend/src/components/DashboardDocumentDialog.jsx','utf8');
 assert.doesNotMatch(source,/\blazy\s*\(|\bimport\s*\(/);
 for(const page of ['Order','Employee','TradePartners','BankLedgerEntry','TransactionRequestEntry','invoice/InvoiceWorkspace'])assert.ok(source.includes("from '../pages/App/"+page+"'"));
});
