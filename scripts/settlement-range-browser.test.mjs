import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/settlement-range-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import dayjs from 'dayjs';import {MemoryRouter} from 'react-router-dom';import {createRoot} from 'react-dom/client';import Page from '/src/pages/App/ShipmentReview.jsx';window.testReact=React;window.testDayjs=dayjs;createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));</script></body></html>`);
const port=43224,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/settlement-range-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[],reads=[],writes=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-23T12:00:00+07:00')});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{email:"operator@example.com"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});'}));
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default ()=>{};'}));
  await page.route('**/src/components/DateRangeSelector.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export default function Range({startValue,endValue,onStartChange,onEndChange}){return window.testReact.createElement('div',null,...[['Start date',startValue,onStartChange],['End date',endValue,onEndChange]].map(([label,value,change])=>window.testReact.createElement('input',{key:label,type:'date','aria-label':label,value:value?.format?.('YYYY-MM-DD')||'',onChange:e=>change(window.testDayjs(e.target.value))})))}`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/attributes?*',r=>r.fulfill({headers,json:{colors:[]}}));
  await page.route('**/quantity-settlement?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});const month=new URL(r.request().url()).searchParams.get('month')||r.request().postDataJSON()?.month;
   const payload=r.request().method()==='POST'?r.request().postDataJSON():null;if(payload)writes.push(payload);else reads.push(month);
   return r.fulfill({headers,json:{storageReady:true,locked:month==='2026-09',sourceSummary:{orderCount:1,workLogCount:1},rows:payload?.rows||[{rowId:month,orderId:1,orderNumber:'ORD-'+month,styleId:2,styleCode:'STYLE',orderQuantity:100,targetQuantity:100,confirmedQuantity:80,billableQuantity:80,payrollEligibleQuantity:80,estimatedQuantity:80,status:'ACTIVE'}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/settlement-range-acceptance.html`);const october=page.locator('[data-settlement-month="2026-10"]');await october.locator('tbody input').first().waitFor();await october.locator('tbody input').first().fill('123');
  await page.getByLabel('Start date').fill('2026-09-01');const september=page.locator('[data-settlement-month="2026-09"]');await september.locator('tbody input').first().waitFor();assert.equal(await september.locator('tbody input').first().isDisabled(),true);
  await page.getByLabel('End date').fill('2026-09-30');assert.equal(await october.isVisible(),false);await page.getByLabel('End date').fill('2026-10-31');assert.equal(await october.locator('tbody input').first().inputValue(),'123');
  await october.getByRole('button').first().click({timeout:5000});await page.waitForTimeout(100);
  assert.equal(writes.length,1);assert.equal(writes[0].month,'2026-10');assert.equal(writes[0].rows[0].targetQuantity,123);assert.deepEqual([...new Set(reads)].sort(),['2026-09','2026-10']);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Settlement ranges passed ko/en/vi: multiple months, locked month protection, hidden draft retention and month-scoped saving.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
