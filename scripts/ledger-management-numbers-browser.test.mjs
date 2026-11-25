import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerReferenceText} from '../frontend/src/utils/ledgerReferences.mjs';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
const fixture=path.resolve('frontend/ledger-number-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{createAppTheme}from'/src/theme';import References from'/src/components/LedgerReferences.jsx';import Grid from'/src/components/LedgerEntryGrid.jsx';import Activity from'/src/components/LedgerActivityTable.jsx';import{bankLedgerMessages}from'/src/constants/bankLedgerMessages';import{ledgerEntryText}from'/src/constants/ledgerEntry';
const params=new URLSearchParams(location.search),languageCode=params.get('lang'),theme=createAppTheme(params.get('theme'));
const code={id:7,code:'EQPV',nameEn:'Equipment',vatEnabled:true,base:{cashDirection:'BOTH'}},account={id:'a',displayName:'Bank',currencyCode:'VND'},row={id:'entry',clientKey:'entry',entryKind:'BANK',accountId:'a',transactionDate:'2026-11-10',direction:'OUT',amount:'2085000',subtotal:'1930556',vatRate:'8',vatAmount:'154444',accountingCodeId:7,accountingCode:code,evidenceType:'FILE',evidenceNumber:'Receipt.pdf',expenseItems:[],counterparty:{kind:'PARTNER',id:11,name:'Supplier'},managementNumber:'BNK-2026-000001',expenseRequestNumbers:['EXP-2026-000003'],invoiceNumbers:[],evidenceFilename:'Receipt.pdf',currencyCode:'VND',accountName:'Bank',counterpartyName:'Supplier'};
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(References,{row,languageCode}),React.createElement(Activity,{rows:[row],text:bankLedgerMessages[languageCode],labels:ledgerEntryText[languageCode],languageCode,onEdit:()=>{},onEditKey:()=>{}}),React.createElement(Grid,{rows:[row],accounts:[account],codes:[code],parties:[row.counterparty],languageCode,orgId:1,locked:true,headerFields:true,documentRemark:true,edit:()=>{},mutate:()=>{},resetEvidence:()=>{},selectDocument:()=>{},addChild:()=>{}})));
</script></body></html>`);
const port=43284,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-number-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const variant of ['standard','compact'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useAppActions=()=>({showNotification:()=>{}});`}));
  await page.route('**/text-acronyms*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{revision:1,entries:[]}}));
  await page.goto(`http://127.0.0.1:${port}/ledger-number-acceptance.html?lang=${language}&theme=${variant}`);
  const refs=page.locator('[data-ledger-references]').first();await refs.getByText('BNK-2026-000001',{exact:false}).waitFor();
  for(const key of ['number','expense','file'])assert.ok((await refs.textContent()).includes(ledgerReferenceText[language][key]));
  assert.ok((await page.locator('[data-testid="ledger-activity-table"]').textContent()).includes('BNK-2026-000001'));
  const vat=page.getByRole('textbox',{name:ledgerEntryText[language].vatAmount,exact:true});
  assert.equal(await vat.inputValue(),'154,444');assert.equal(await vat.evaluate(el=>getComputedStyle(el).textAlign),'right');
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS ledger identity / evidence / VAT',language,variant,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
