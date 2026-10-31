import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerChangesText} from '../frontend/src/constants/ledgerChanges.js';
const fixture=path.resolve('frontend/ledger-changes-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import Dashboard from'/src/pages/App/WorkspaceDashboard.jsx';
function App(){const[orgId,setOrg]=React.useState(7),[role,setRole]=React.useState(window.initialRole||'ADMIN');window.setOrg=setOrg;window.setRole=setRole;window.currentOrg=orgId;window.currentRole=role;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Dashboard)));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43271,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-changes-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],queries=[],t=ledgerChangesText[lang];let fail=false,orderReads=0;
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2026-10-31T12:00:00+07:00')});
  await page.addInitScript(role=>{window.initialRole=role;},lang==='en'?'ACCOUNTANT':'ADMIN');
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:window.currentRole,orgId:window.currentOrg};return {isAuthenticated:true,activeOrgId:window.currentOrg,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const actions={navigateToPath:p=>window.destination=p,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;export const useAppState=()=>({});"}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/orders?*',r=>{orderReads++;return r.fulfill({headers,json:[]});});
  for(const endpoint of ['assignment-board-view','org-memberships','customers'])await page.route(`**/${endpoint}?*`,r=>r.fulfill({headers,json:endpoint==='assignment-board-view'?{assignments:[]}:[]}));
  await page.route('**/expense-approval-overview?*',r=>r.fulfill({headers,json:{rows:[],total:0}}));
  const original={accountId:'account',accountName:'USD cash',currencyCode:'USD',transactionDate:'2020-01-01',direction:'IN',amount:'10.00',accountingCode:'GENE',purpose:'Original',evidenceType:'FILE',evidenceNumber:'old.pdf',bankFee:'0.00',writeOffAmount:'0.00',settlementLines:[],allocations:[]};
  await page.route('**/bank-ledger/changes?*',r=>{
   assert.equal(r.request().method(),'GET');const query=Object.fromEntries(new URL(r.request().url()).searchParams);queries.push(query);
   if(fail)return r.fulfill({headers,status:500,json:{error:'Test read error'}});
   const total=query.orgId==='8'?0:query.action==='ALL'?22:2,offset=Number(query.page)*Number(query.pageSize);
   const rows=Array.from({length:Math.min(Number(query.pageSize),Math.max(0,total-offset))},(_,index)=>{const action=query.action==='ALL'?(index%2?'DELETE':'EDIT'):query.action;return {id:'event-'+(offset+index),action,changedAt:'2026-10-30T01:00:00Z',actor:'reviewer@company.test',reason:action==='DELETE'?'Duplicate':null,before:original,after:action==='EDIT'?{...original,amount:'15.00',purpose:'Updated',evidenceNumber:'new.pdf'}:null,changedFields:action==='EDIT'?['amount','purpose','evidenceNumber']:[]};});
   return r.fulfill({headers,json:{rows,total}});
  });
  await page.goto(`http://127.0.0.1:${port}/ledger-changes-acceptance.html`);
  const card=page.getByTestId('ledger-changes-dashboard');await card.locator('tbody tr').first().waitFor();
  assert.equal(queries[0].start,'2026-10-01');assert.equal(queries[0].end,'2026-10-31');assert.equal(queries[0].orgId,'7');assert.equal(await card.locator('tbody tr').count(),20);assert.ok((await card.boundingBox()).width>1000);
  assert.equal(await card.locator('thead th').nth(4).evaluate(element=>getComputedStyle(element).textAlign),'right');
  await card.locator('tbody tr').first().click();let dialog=page.getByRole('dialog');await dialog.getByText('USD 15.00',{exact:true}).waitFor();await dialog.getByText('USD 10.00',{exact:true}).waitFor();await dialog.getByText('old.pdf',{exact:true}).waitFor();await dialog.getByText('new.pdf',{exact:true}).waitFor();await dialog.getByRole('button',{name:t.close,exact:true}).click();
  await card.getByRole('button',{name:t.next,exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="ledger-changes-dashboard"] tbody')?.rows.length===2);assert.equal(queries.at(-1).page,'1');
  const productionBefore=orderReads;
  await card.getByRole('combobox',{name:t.action,exact:false}).click();await page.getByRole('option',{name:t.DELETE,exact:true}).click();await page.waitForFunction(label=>document.querySelector('[data-testid="ledger-changes-dashboard"] tbody')?.textContent.includes(label),'Duplicate');assert.equal(queries.at(-1).action,'DELETE');assert.equal(queries.at(-1).page,'0');assert.equal(orderReads,productionBefore);
  await card.locator('tbody tr').first().click();dialog=page.getByRole('dialog');await dialog.getByText(t.reason+': Duplicate',{exact:true}).waitFor();assert.equal(await dialog.getByText('USD 15.00',{exact:true}).count(),0);await dialog.getByRole('button',{name:t.close,exact:true}).click();
  fail=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:7,source:'bank-ledger',topics:['bank-ledger']}})));await card.getByText(t.error,{exact:true}).waitFor();fail=false;await card.getByRole('button',{name:t.retry,exact:true}).click();await card.locator('tbody tr').first().waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await card.locator('.MuiTableContainer-root').evaluate(element=>element.scrollWidth>element.clientWidth),true);await card.locator('tbody tr').first().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByRole('dialog').getByRole('button',{name:t.close,exact:true}).click();
  await page.evaluate(()=>window.setOrg(8));await card.getByText(t.empty,{exact:true}).waitFor();assert.equal(await card.getByText('reviewer@company.test',{exact:true}).count(),0);
  const requests=queries.length;await page.evaluate(()=>window.setRole('OPERATOR'));await card.waitFor({state:'detached'});await page.waitForTimeout(100);assert.equal(queries.length,requests);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Ledger history dashboard passed ko/en/vi: permission gates, company clearing, edit/delete comparison, filters, paging, retry, event refresh and mobile overflow.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
