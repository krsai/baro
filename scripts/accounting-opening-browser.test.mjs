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
  const page=await browser.newPage({viewport:{width,height:1000}}),t=accountingOpeningText[lang],b=ledgerBalanceText[lang],saved=[],errors=[];let failLookup=true;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default function(){}'}));
  await page.route('**/*',async r=>{const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname==='/transaction-codes')return r.fulfill({headers,json:[{id:11,code:'SALE',nameKo:'Sales',nameEn:'Sales',nameVi:'Sales',cashDirection:'BOTH'}]});
   if(url.pathname==='/bank-ledger/accounts')return r.fulfill({headers,json:{accounts:[{id:'a',displayName:'Cash',currencyCode:'USD',currentBalance:'9.00'}]}});
   if(url.pathname==='/bank-ledger/opening'){if(url.searchParams.get('search')==='FAIL'&&failLookup)return r.fulfill({headers,status:503,json:{error:'temporary'}});return r.fulfill({headers,json:{documents:[{side:'AR',id:'old',reference:'OLD-1',party:'VENDOR',counterparty:{kind:'PARTNER',id:3},accountingCodeId:11,currencyCode:'USD',remaining:'100.00'}].filter(row=>!url.searchParams.get('search')||(row.reference+' '+row.party).includes(url.searchParams.get('search'))),parties:[{id:3,kind:'PARTNER',code:'VEND',name:'VENDOR'}],history:[{id:'prior',balanceDate:'2026-11-01',kind:'SETTLED',party:{name:'VENDOR'},invoice:{invoiceNumber:'OLD-DONE'},currencyCode:'USD',amount:'10',matched:'0',remaining:'10',reason:'Previously collected'}],hasMore:false}});}
   if(url.pathname==='/bank-ledger/balance-adjustments'){saved.push(r.request().postDataJSON());return saved.length===1?r.fulfill({headers,status:503,json:{error:'temporary'}}):r.fulfill({headers,json:{entryIds:[]}});}
   return r.fallback();
  });
  await page.goto(`http://127.0.0.1:${port}/accounting-opening-acceptance.html?lang=${lang}`);
  await page.getByLabel(b.date,{exact:true}).fill('2026-11-01');await page.getByLabel(b.actual+' Cash',{exact:true}).fill('11');await page.getByLabel(b.reason,{exact:false}).fill('Cash draft');await page.getByRole('tab',{name:t.arapTab,exact:true}).click();await page.locator('[data-accounting-opening] input').first().waitFor();assert.equal(await page.getByText('OLD-DONE',{exact:true}).count(),0);assert.equal(await page.getByText(t.documents,{exact:true}).count(),0);
  const panel=page.locator('[data-accounting-opening]');assert.equal(await panel.getByRole('button',{name:t.addBalance,exact:true}).count(),0);assert.equal(await panel.locator('table').first().locator('tbody tr[data-opening-input]').count(),1);
  const manual=panel.locator('table').first().locator('tbody tr[data-opening-input]').first(),texts=manual.getByRole('textbox');
  await manual.getByRole('button',{name:t.remove,exact:true}).click();assert.equal(await panel.locator('table').first().locator('tbody tr[data-opening-input]').count(),1);assert.equal(await page.getByRole('button',{name:t.saveAr,exact:true}).isDisabled(),true);
  await texts.nth(0).fill('VEND');await texts.nth(0).press('Enter');await manual.getByText('VENDOR',{exact:true}).waitFor();
  await texts.nth(1).fill('SALE');await texts.nth(1).press('Enter');await manual.getByLabel(t.amount,{exact:true}).fill('50');
  await manual.getByRole('button',{name:t.add,exact:true}).click();const blank=panel.locator('table').first().locator('tbody tr[data-opening-input]').last();await blank.getByRole('button',{name:t.remove,exact:true}).click();assert.equal(await panel.locator('table').first().locator('tbody tr[data-opening-input]').count(),1);
  const bill=manual.getByRole('textbox',{name:t.billNumber,exact:true});
  await bill.fill('OLD');await bill.press('Enter');
  const lookup=page.locator('[data-lookup-dialog]');await lookup.waitFor();await lookup.locator('tbody tr').first().getByRole('button').click();await lookup.waitFor({state:'hidden'});
  assert.equal(await manual.getByLabel(t.amount,{exact:true}).inputValue(),'100.00');
  await manual.getByLabel(t.amount,{exact:true}).fill('50');
  await manual.getByRole('button',{name:t.add,exact:true}).click();
  const other=panel.locator('table').first().locator('tbody tr[data-opening-input]').nth(1),otherTexts=other.getByRole('textbox');
  await otherTexts.nth(0).fill('VEND');await otherTexts.nth(0).press('Enter');await otherTexts.nth(1).fill('SALE');await otherTexts.nth(1).press('Enter');await other.getByLabel(t.amount,{exact:true}).fill('25');
  if(lang==='en'&&width===1440){
   const otherBill=other.getByRole('textbox',{name:t.billNumber,exact:true});
   await otherBill.fill('MISSING');await otherBill.press('Enter');await lookup.waitFor();
   await page.waitForResponse(response=>response.url().includes('search=MISSING'));await page.waitForTimeout(100);
   assert.equal(await lookup.locator('tbody tr button').count(),0);await page.keyboard.press('Escape');
   assert.equal(await other.getByLabel(t.amount,{exact:true}).inputValue(),'25');
   const failed=page.waitForResponse(response=>response.url().includes('search=FAIL'));await otherBill.fill('FAIL');await failed;await otherBill.press('Enter');await lookup.waitFor();await lookup.getByText(t.failed,{exact:true}).waitFor();
   failLookup=false;await Promise.all([page.waitForResponse(response=>response.url().includes('search=FAIL')&&response.ok()),lookup.getByRole('button',{name:b.reload,exact:true}).click()]);await lookup.getByText(t.failed,{exact:true}).waitFor({state:'hidden'});await lookup.getByRole('textbox').focus();await page.keyboard.press('Escape');
   await lookup.waitFor({state:'hidden'});await Promise.all([page.waitForResponse(response=>response.url().includes('search=OLD-1')),otherBill.fill('OLD-1')]);await page.waitForTimeout(100);await otherBill.press('Enter');
   assert.equal(await other.getByLabel(t.amount,{exact:true}).inputValue(),'25');assert.equal(await lookup.isVisible(),false);
   await otherBill.fill('');await otherBill.press('Tab');
  }
  await other.getByRole('button',{name:t.add,exact:true}).click();
  await page.getByLabel(b.reason,{exact:false}).fill('Prior opening');await page.getByRole('tab',{name:t.accountTab,exact:true}).click();assert.equal(await page.getByLabel(b.actual+' Cash',{exact:true}).inputValue(),'11');assert.equal(await page.getByLabel(b.reason,{exact:false}).inputValue(),'Cash draft');await page.getByRole('tab',{name:t.arapTab,exact:true}).click();assert.equal(await page.getByLabel(b.reason,{exact:false}).inputValue(),'Prior opening');assert.equal(await manual.getByLabel(t.amount,{exact:true}).inputValue(),'50');
  await page.getByRole('button',{name:t.saveAr,exact:true}).click();await page.getByText(b.uncertain,{exact:true}).waitFor();
  assert.equal(await page.getByLabel(b.date,{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:b.retry,exact:true}).click();await page.getByRole('button',{name:t.saveAr,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('[data-accounting-opening] table tbody tr[data-opening-input]').length===1&&document.querySelector('[data-accounting-opening] table tbody input[aria-label]')?.value==='');assert.equal(await page.evaluate(()=>window.closedBalance===true),false);
  assert.deepEqual(saved[0],saved[1]);assert.deepEqual(saved[0].accounts,[]);assert.equal(saved[0].openingRows.length,2);assert.equal(saved[0].openingRows[0].amount,'50');assert.equal(saved[0].openingRows[0].source.expectedRemaining,'100.00');assert.equal(saved[0].openingRows[0].source.sourceId,'old');assert.equal(saved[0].openingRows[1].kind,'OPENING');assert.equal(saved[0].openingRows[1].source,undefined);assert.equal(saved[0].openingRows[1].amount,'25');assert.equal(saved[0].balanceDate,'2026-11-01');await page.getByRole('tab',{name:t.accountTab,exact:true}).click();assert.equal(await page.getByLabel(b.actual+' Cash',{exact:true}).inputValue(),'11');assert.equal(await page.getByLabel(b.reason,{exact:false}).inputValue(),'Cash draft');await page.getByRole('button',{name:t.saveAccounts,exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[aria-label]')?.value==='');assert.deepEqual(saved[2].openingRows,[]);assert.equal(saved[2].accounts[0].targetBalance,'11');assert.equal(saved[2].reason,'Cash draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS opening balances ko/en/vi desktop/mobile: exact party/code lookup, bill lookup and editable replacement, manual entry, no settlement list or cash adjustment, immutable unknown-result retry.');
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
