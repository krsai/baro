import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync,writeFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/management-period-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {MemoryRouter} from 'react-router-dom';import {createRoot} from 'react-dom/client';import dayjs from 'dayjs';import {ManagementPeriodProvider} from '/src/context/ManagementPeriodContext.jsx';import Range from '/src/components/MonthRangeSelector.jsx';import Month from '/src/components/MonthSelector.jsx';import Costs from '/src/pages/App/PartnerTransactionCosts.jsx';
function Screen(){const[start,setStart]=React.useState(dayjs('2026-05-01')),[end,setEnd]=React.useState(dayjs('2026-05-31')),[month,setMonth]=React.useState('2026-05');return location.search?React.createElement(Costs):React.createElement(React.Fragment,null,React.createElement('section',{id:'range'},React.createElement(Range,{monthOnly:false,startValue:start,endValue:end,onStartChange:setStart,onEndChange:setEnd,onShift:n=>{setStart(v=>v.add(n,'month').startOf('month'));setEnd(v=>v.add(n,'month').endOf('month'));}}),React.createElement('output',null,start.format('YYYY-MM-DD')+'/'+end.format('YYYY-MM-DD'))),React.createElement('section',{id:'month'},React.createElement(Month,{value:month,onChange:setMonth,factoryId:11,label:'Month'}),React.createElement('output',null,month)));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ManagementPeriodProvider,null,React.createElement(Screen))));</script></body></html>`);
const port=43195,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/management-period-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/management-period?*',route=>route.fulfill({headers,json:{startDate:'2026-06-01',factories:[{id:10,startDate:'2026-06-01'},{id:11,startDate:'2026-08-01'}]}}));
  await page.goto(`http://127.0.0.1:${port}/management-period-acceptance.html`);
  await page.locator('#range output').filter({hasText:'2026-06-01/2026-06-30'}).waitFor();
  assert.equal(await page.locator('#range').getByRole('button',{name:'시작일을 이전 달 1일로',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('#range').getByRole('button',{name:'M-',exact:true}).isDisabled(),true);
  await page.locator('#range').getByRole('button',{name:'M+',exact:true}).click();
  await page.locator('#range').getByRole('button',{name:'M-',exact:true}).click();
  assert.equal(await page.locator('#range output').textContent(),'2026-06-01/2026-06-30');
  assert.equal(await page.locator('#month output').textContent(),'2026-08');
  assert.equal(await page.locator('#month input').getAttribute('min'),'2026-08');
  assert.equal(await page.locator('#month').getByRole('button',{name:'M-',exact:true}).isDisabled(),true);
  await page.locator('#month input').fill('2026-07');
  assert.equal(await page.locator('#month output').textContent(),'2026-08');
  await page.clock.install({time:new Date('2026-10-16T12:00:00+07:00')});
  await page.route('**/expense-requests?*',route=>route.fulfill({headers,json:[]}));
  await page.route('**/outsourcing-requests?*',route=>route.fulfill({headers,json:[{id:1,transactionDate:'2026-05-31',description:'Old cost',currency:'VND',amount:'1'},{id:2,transactionDate:'2026-06-01',description:'Boundary cost',currency:'VND',amount:'1'}]}));
  await page.goto(`http://127.0.0.1:${port}/management-period-acceptance.html?costs`);
  await page.getByRole('tab',{name:'전체 내역',exact:true}).click();
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'시작일을 이전 달 1일로',exact:true}).click();
  await page.getByText('Boundary cost',{exact:true}).waitFor();
  assert.equal(await page.getByText('Old cost',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'시작일을 이전 달 1일로',exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('Management period UI passed: restored dates clamped, organization and factory floors, previous buttons disabled, manual month blocked and costs stop at the boundary.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
