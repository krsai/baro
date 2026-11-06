import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {accountOverviewText} from '../frontend/src/constants/accountOverview.js';
import {balanceChartScale} from '../frontend/src/utils/balanceChartScale.mjs';
assert.deepEqual(balanceChartScale([16465275]).ticks,[0,5000000,10000000,15000000,20000000]);
for(const values of [[0],[-170,45],[.05,.4],[-20000000]]){
 const scale=balanceChartScale(values);assert.ok(scale.low<=Math.min(...values));assert.ok(scale.high>=Math.max(...values));assert.ok(scale.ticks.every(Number.isInteger));
}
const fixture=path.resolve('frontend/account-overview-layout-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Report from'/src/pages/App/AccountOverview.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Report)));</script></body></html>`);
const port=43289,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/account-overview-layout-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},acceptDownloads:true}),errors=[];page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));const t=accountOverviewText[lang];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const auth={activeOrgId:1};export const useAuth=()=>auth;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},showNotification:message=>{window.toast=message;}});'}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const buildQueryString=q=>'?'+new URLSearchParams(q);export const requestJSON=async url=>{window.calls=(window.calls||0)+1;if(url.includes('exchange-rates'))return {date:'2026-11-05',rates:{VND:1},stale:false};const account={id:'a',name:'Main account',currencyCode:'VND',yesterdayIn:'16465275',yesterdayOut:'0',beginningBalance:'0',totalIn:'16465275',totalOut:'0',change:'16465275',currentBalance:'16465275'};return {asOf:'2026-11-05',yesterday:'2026-11-04',monthStart:'2026-11-01',historyStart:'2026-10-07',accounts:[account],currencyTotals:[account],transactions:[{id:'tx',accountName:account.name,counterparty:'BARO',purpose:'Detail only',direction:'IN',currencyCode:'VND',amount:'16465275',settlementLines:[]}],outstandingTotals:[],receivables:[],payables:[],history:[{date:'2026-11-04',accounts:[{accountId:'a',balance:'16465275'}]},{date:'2026-11-05',accounts:[{accountId:'a',balance:'16465275'}]}]};};`}));
  await page.goto(`http://127.0.0.1:${port}/account-overview-layout-acceptance.html`);
  await page.getByTestId('all-account-balance').waitFor();
  assert.equal(await page.getByRole('button',{name:t.reload,exact:true}).count(),0);
  assert.equal(await page.getByText('Detail only',{exact:true}).count(),0);
  const total=page.getByText(t.totalBalance+' / VND',{exact:true});assert.equal(await total.evaluate(e=>e.tagName),'H6');
  assert.equal(await page.getByText(t.yesterday,{exact:false}).count(),0);assert.equal(await page.getByText(t.opening,{exact:true}).count(),0);
  const graph=await page.getByText(t.chart,{exact:true}).first().boundingBox(),movements=await page.getByText(t.balances,{exact:false}).first().boundingBox();assert.ok(graph.y<movements.y);
  await page.locator('#overview-account').click();await page.getByRole('option',{name:'Main account',exact:true}).click();
  const previousCalls=await page.evaluate(()=>window.calls);await page.getByRole('button',{name:t.previousMonth,exact:true}).click();await page.waitForFunction(before=>window.calls>before,previousCalls);assert.equal(await page.getByLabel(t.month,{exact:true}).inputValue(),'2026-10');
  const table=page.locator('table').first();const cells=table.locator('thead th');const incoming=await cells.nth(3).boundingBox(),outgoing=await cells.nth(4).boundingBox();assert.ok(Math.abs(incoming.width-outgoing.width)<2);
  await page.getByRole('button',{name:t.details,exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByText('Detail only',{exact:true}).count(),0);
  await page.getByRole('button',{name:t.close,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const before=await page.evaluate(()=>window.calls);await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.waitForFunction(before=>window.calls>before,before);
  if(lang==='ko'&&width===1440){const download=page.waitForEvent('download');await page.getByRole('button',{name:t.capture,exact:true}).click();const saved=await download;assert.equal(saved.suggestedFilename(),'account-overview-2026-11-05.png');assert.equal(await saved.failure(),null);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile overview, fixed amount columns, details modal, automatic refresh and image download.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
