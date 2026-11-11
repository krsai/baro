import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {accountingOpeningText} from '../frontend/src/constants/accountingOpening.js';
import {ledgerBalanceText} from '../frontend/src/constants/ledgerBalance.js';
const file=path.resolve('frontend/accounting-opening-acceptance.html'),entry=file.replace('.html','.jsx');assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Balance from'/src/components/LedgerBalanceDialog';createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Balance orgId={1} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>window.closedBalance=true}/></ThemeProvider>);`);
writeFileSync(file,'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/accounting-opening-acceptance.jsx"></script></body></html>');
const port=43319,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/accounting-opening-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),t=accountingOpeningText[lang],b=ledgerBalanceText[lang],saved=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default function(){}'}));
  await page.route('**/*',async r=>{const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname==='/transaction-codes')return r.fulfill({headers,json:[{id:11,code:'SALE',nameKo:'Sales',nameEn:'Sales',nameVi:'Sales',cashDirection:'BOTH'}]});
   if(url.pathname==='/bank-ledger/accounts')return r.fulfill({headers,json:{accounts:[{id:'a',displayName:'Cash',currencyCode:'USD',currentBalance:'9.00'}]}});
   if(url.pathname==='/bank-ledger/opening')return r.fulfill({headers,json:{documents:[{side:'AR',id:'old',reference:'OLD-1',party:'VENDOR',currencyCode:'USD',remaining:'100.00'}],parties:[{id:3,kind:'PARTNER',code:'VEND',name:'VENDOR'}],history:[],hasMore:false}});
   if(url.pathname==='/bank-ledger/balance-adjustments'){saved.push(r.request().postDataJSON());return saved.length===1?r.fulfill({headers,status:503,json:{error:'temporary'}}):r.fulfill({headers,json:{entryIds:[]}});}
   return r.fallback();
  });
  await page.goto(`http://127.0.0.1:${port}/accounting-opening-acceptance.html?lang=${lang}`);
  await page.getByLabel(b.date,{exact:true}).fill('2026-11-01');await page.getByText('OLD-1',{exact:true}).waitFor();
  const panel=page.locator('[data-accounting-opening]');await panel.getByRole('button',{name:t.add,exact:true}).click();
  const manual=panel.locator('table').first().locator('tbody tr').first(),texts=manual.getByRole('textbox');
  await texts.nth(0).fill('VEND');await texts.nth(0).press('Enter');await manual.getByText('VENDOR',{exact:true}).waitFor();
  await texts.nth(1).fill('SALE');await texts.nth(1).press('Enter');await texts.last().fill('50');
  const source=panel.getByRole('row').filter({has:page.getByText('OLD-1',{exact:true})});await source.getByRole('combobox').click();await page.getByRole('option',{name:t.SETTLED,exact:true}).click();
  await page.getByLabel(b.reason,{exact:false}).fill('Prior opening');
  await page.getByRole('button',{name:b.save,exact:true}).click();await page.getByText(b.uncertain,{exact:true}).waitFor();
  assert.equal(await page.getByLabel(b.date,{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:b.retry,exact:true}).click();await page.waitForFunction(()=>window.closedBalance===true);
  assert.deepEqual(saved[0],saved[1]);assert.deepEqual(saved[0].accounts,[]);assert.equal(saved[0].openingRows.length,2);assert.equal(saved[0].openingRows[0].amount,'50');assert.equal(saved[0].openingRows[1].expectedRemaining,'100.00');assert.equal(saved[0].balanceDate,'2026-11-01');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS opening balances ko/en/vi desktop/mobile: exact party/code lookup, document settlement, no cash adjustment, immutable unknown-result retry.');
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
