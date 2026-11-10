import {ledgerFlowText} from '../frontend/src/constants/ledgerFlow.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
const file=path.resolve('frontend/bank-fees-acceptance.html'),port=43424;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Grid from '/src/components/LedgerEntryGrid.jsx';
function App(){const [rows,setRows]=React.useState([{clientKey:'bank',entryKind:'BANK',accountId:'account',direction:'OUT',amount:'100',purpose:'Payment',accountingCodeId:1,evidenceType:'EXPENSE',document:{id:1,reference:'EXP-1',payee:'Vendor'},counterparty:{kind:'PARTNER',id:10,name:'Vendor'},expenseItems:[{itemId:1,amount:'100',label:'Service'}]}]);window.feeRows=rows;return React.createElement(Grid,{rows,accounts:[{id:'account',currencyCode:'USD'}],codes:[{id:1,code:'GENE',nameEn:'General',cashDirection:'OUT'},{id:2,code:'FEEE',nameEn:'Bank fee',cashDirection:'OUT'}],parties:[{kind:'PARTNER',id:10,code:'MJLG',name:'Vendor'},{kind:'PARTNER',id:20,code:'BANK',name:'Bank'},{kind:'PARTNER',id:30,code:'DUP',name:'First'},{kind:'PARTNER',id:31,code:'DUP',name:'Second'}],languageCode:new URLSearchParams(location.search).get('lang'),headerFields:true,documentRemark:true,orgId:7,locked:false,onAddRow:()=>setRows(current=>[...current,{clientKey:'fee-bank',entryKind:'BANK',accountId:'account',direction:'OUT',amount:'',purpose:'Bank fee',accountingCodeId:'',evidenceType:'FILE',evidenceNumber:'',expenseItems:[],counterparty:null}]),resetEvidence:(key,patch)=>setRows(current=>current.filter(row=>row.parentClientKey!==key).map(row=>row.clientKey===key?{...row,...patch,document:null,paymentScheduleId:'',evidenceNumber:'',expenseItems:[]}:row)),edit:(key,patch)=>setRows(current=>current.map(row=>row.clientKey===key?{...row,...patch}:row)),mutate:fn=>setRows(fn)});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(App))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/bank-fees-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],t=ledgerEntryText[lang];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{}});'}));
  await page.goto(`http://127.0.0.1:${port}/bank-fees-acceptance.html?lang=${lang}`);
  const row=page.locator('[data-entry-kind="BANK"]').first();await row.waitFor();
  assert.equal(await page.getByTestId('ledger-bank-fees').count(),0);assert.equal(await page.locator('[data-ledger-details]').count(),0,'a single expense does not repeat payee, description or matching totals');
  const party=row.getByRole('textbox',{name:ledgerFlowText[lang].to,exact:true});assert.equal(await party.inputValue(),'MJLG / Vendor');
  await party.fill('DUP');await party.press('Enter');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await party.fill('MJLG');await party.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);await party.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);
  await row.getByRole('button',{name:ledgerWorkspaceText[lang].add,exact:true}).click();
  const fee=page.locator('[data-entry-kind="BANK"]').nth(1);await fee.getByRole('textbox',{name:bankLedgerMessages[lang].amount,exact:true}).fill('10');
  const feeCode=fee.getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:false});await feeCode.fill('FEEE');await feeCode.press('Enter');
  const feeParty=fee.getByRole('textbox',{name:ledgerFlowText[lang].to,exact:true});await feeParty.fill('BANK');await feeParty.press('Enter');assert.equal(await feeParty.inputValue(),'BANK / Bank');
  assert.deepEqual(await page.evaluate(()=>window.feeRows.map(row=>({kind:row.entryKind,parent:row.parentClientKey,amount:row.amount,code:row.accountingCodeId}))),[{kind:'BANK',parent:undefined,amount:'100',code:1},{kind:'BANK',parent:undefined,amount:'10',code:2}]);
  assert.equal(await page.locator('[data-ledger-details]').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: independent bank fee rows, compact expense links and direct party code/modal selection; ko/en/vi.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
