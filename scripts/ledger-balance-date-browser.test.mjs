import {accountingOpeningText} from '../frontend/src/constants/accountingOpening.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerBalanceText} from '../frontend/src/constants/ledgerBalance.js';
const fixture=path.resolve('frontend/ledger-balance-date-acceptance.html');
assert.ok(!existsSync(fixture));
const entry=fixture.replace('.html','.jsx');assert.ok(!existsSync(entry));
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Balance from'/src/components/LedgerBalanceDialog';createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Balance orgId={1} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>window.balanceClosed=true}/></ThemeProvider>);`);
writeFileSync(fixture,'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/ledger-balance-date-acceptance.jsx"></script></body></html>');
const port=43311,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-balance-date-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),t=ledgerBalanceText[lang],o=accountingOpeningText[lang],dates=[],saved=[],errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default function(){}'}));
  await page.route('**/bank-ledger/**',r=>{const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname==='/bank-ledger/opening')return r.fulfill({headers,json:{documents:[],parties:[],history:[],hasMore:false}});
   if(r.request().method()==='POST'){saved.push(r.request().postDataJSON());return r.fulfill({headers,json:{entryIds:['adjustment']}});}
   dates.push(url.searchParams.get('balanceDate'));return r.fulfill({headers,json:{accounts:[{id:'a',displayName:'Cash',currencyCode:'USD',currentBalance:url.searchParams.get('balanceDate')==='2026-01-02'?'1.00':'9.00'}]}});
  });
  await page.route('**/transaction-codes**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  await page.goto(`http://127.0.0.1:${port}/ledger-balance-date-acceptance.html?lang=${lang}`);
  await page.getByLabel(t.actual+' Cash',{exact:true}).waitFor();
  await page.getByLabel(t.date,{exact:true}).fill('2026-01-02');
  await page.getByText('$1.00',{exact:true}).waitFor();
  await page.getByLabel(t.actual+' Cash',{exact:true}).fill('100');
  await page.getByLabel(t.reason,{exact:false}).fill('Actual cash at start of day');
  await page.getByRole('button',{name:o.saveAccounts,exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[aria-label]')?.value==='');assert.equal(await page.evaluate(()=>window.balanceClosed===true),false);
  assert.equal(dates.at(-1),'2026-01-02');assert.equal(saved[0].balanceDate,'2026-01-02');assert.equal(saved[0].accounts[0].expectedBalance,'1.00');assert.equal(saved[0].accounts[0].targetBalance,'100');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi dated balance lookup, date-specific book balance and adjustment payload.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);unlinkSync(entry);}
