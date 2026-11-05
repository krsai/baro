import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
const file=path.resolve('frontend/bank-fees-acceptance.html'),port=43424;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Grid from '/src/components/LedgerEntryGrid.jsx';
function App(){const [rows,setRows]=React.useState([{clientKey:'bank',entryKind:'BANK',accountId:'account',direction:'OUT',amount:'110',purpose:'Payment',accountingCodeId:1,evidenceType:'EXPENSE',document:{id:1,reference:'EXP-1',payee:'Vendor'},expenseItems:[{itemId:1,amount:'100',label:'Service'}]},{clientKey:'fee',parentClientKey:'bank',entryKind:'FEE',amount:'10',purpose:'Original fee',accountingCodeId:2}]);window.feeRows=rows;return React.createElement(Grid,{rows,accounts:[{id:'account',currencyCode:'USD'}],codes:[{id:1,code:'GENE',nameEn:'General',cashDirection:'OUT'},{id:2,code:'FEEE',nameEn:'Bank fee',cashDirection:'OUT'}],languageCode:new URLSearchParams(location.search).get('lang'),headerFields:true,documentRemark:true,orgId:7,locked:false,edit:(key,patch)=>setRows(current=>current.map(row=>row.clientKey===key?{...row,...patch}:row)),mutate:fn=>setRows(fn)});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(App))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/bank-fees-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],t=ledgerEntryText[lang];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{}});'}));
  await page.goto(`http://127.0.0.1:${port}/bank-fees-acceptance.html?lang=${lang}`);
  const panel=page.getByTestId('ledger-bank-fees'),fee=panel.getByRole('textbox',{name:t.bankFeeLabel,exact:true});await fee.waitFor();
  assert.equal(await page.locator('tr[data-entry-kind="FEE"]').count(),0);assert.equal(await page.getByRole('button',{name:t.addFee,exact:true}).count(),0);
  assert.equal(await fee.inputValue(),'10');await fee.fill('12.50');assert.equal(await page.evaluate(()=>window.feeRows.filter(row=>row.entryKind==='FEE').length),1);assert.equal(await page.evaluate(()=>window.feeRows[1].amount),'12.50');assert.equal(await page.evaluate(()=>window.feeRows[0].amount),'110');
  await panel.getByRole('button',{name:t.removeFeeLabel,exact:true}).click();assert.equal(await fee.inputValue(),'');assert.equal(await page.evaluate(()=>window.feeRows.length),1);
  await fee.fill('10');const code=panel.getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:false});await code.fill('FEEE');await code.press('Enter');
  assert.deepEqual(await page.evaluate(()=>window.feeRows.map(row=>({kind:row.entryKind,parent:row.parentClientKey,amount:row.amount,code:row.accountingCodeId}))),[{kind:'BANK',parent:undefined,amount:'110',code:1},{kind:'FEE',parent:'bank',amount:'10',code:2}]);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: dedicated bank fee amount/code, existing fee edit/remove, single child creation, unchanged actual amount; ko/en/vi.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
