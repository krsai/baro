import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {existsSync,writeFileSync,unlinkSync} from 'node:fs';import path from 'node:path';import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/range-pages-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import dayjs from 'dayjs';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Work from '/src/pages/App/work/WorkList.jsx';import Analysis from '/src/pages/App/work/WorkMonthlyBoard.jsx';import Attendance from '/src/pages/App/attendance/AttendanceList.jsx';window.testReact=React;window.testDayjs=dayjs;const Page={work:Work,analysis:Analysis,attendance:Attendance}[location.search.slice(1)];createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));</script></body></html>`);
const port=43225,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/range-pages-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const kind of ['work','analysis','attendance']){
  let recordedMonths=['2026-09','2026-10'];const page=await browser.newPage(),reads=[],errors=[];page.setDefaultNavigationTimeout(90000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-23T12:00:00+07:00')});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeFactoryId:1,activeOrgRole:"ADMIN",user:{id:1},accessProfile:{entryType:"ORG",orgType:"MANUFACTURER",orgRole:"ADMIN"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({showNotification:noop,navigateToPath:p=>window.lastNavigation=p,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop});'}));
  await page.route('**/src/hooks/useWorkspaceRefreshOnEvent*',r=>r.fulfill({contentType:'application/javascript',body:'export default ()=>{};'}));
  await page.route('**/src/hooks/useHolidayCalendar*',r=>r.fulfill({contentType:'application/javascript',body:'const holidaySet=new Set(),holidayKeys=[];export default ()=>({holidaySet,holidayKeys});'}));
  await page.route('**/src/components/DateRangeSelector.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export default function Range({startValue,endValue,onStartChange,onEndChange}){return window.testReact.createElement('div',null,...[['Start date',startValue,onStartChange],['End date',endValue,onEndChange]].map(([label,value,change])=>window.testReact.createElement('input',{key:label,type:'date','aria-label':label,value:value?window.testDayjs(value).format('YYYY-MM-DD'):'',onChange:e=>change(window.testDayjs(e.target.value))})))}`}));
  const headers={'Access-Control-Allow-Origin':'*'};
  const employee={id:10,name:'Worker A',roleCode:'WORKER_SEWING',joinedAt:'2026-01-01',factoryId:1,status:'ACTIVE'};
  await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Hanoi',managementStartDate:'2026-04-01'}]}));await page.route('**/employees?*',r=>r.fulfill({headers,json:[employee]}));
  await page.route('**/attendance-entries?*',r=>{const url=new URL(r.request().url());if(url.searchParams.has('monthsOnly'))return r.fulfill({headers,json:recordedMonths});reads.push({path:'attendance',from:url.searchParams.get('dateFrom'),to:url.searchParams.get('dateTo')});return r.fulfill({headers,json:[]})});
  await page.route('**/work-logs?*',r=>{const url=new URL(r.request().url());if(url.searchParams.has('monthsOnly'))return r.fulfill({headers,json:recordedMonths});const from=url.searchParams.get('dateFrom'),to=url.searchParams.get('dateTo');reads.push({path:'work',from,to});return r.fulfill({headers,json:['2026-09-15','2026-10-20'].filter(date=>date>=from&&date<=to).map((date,id)=>({id,workDate:date,displayDate:date,factoryId:1,factoryName:'Hanoi',recordKind:'EMPLOYEE',records:[{workerId:10,workerName:'Worker A',ctSeconds:30,quantity:10}]}))})});
  await page.goto(`http://127.0.0.1:${port}/range-pages-acceptance.html?${kind}`);await page.getByLabel('Start date').waitFor();await page.getByLabel('Start date').fill('2026-09-15');await page.getByLabel('End date').fill('2026-10-20');
  await page.waitForFunction(()=>document.querySelector('input[aria-label="End date"]')?.value==='2026-10-20');await page.waitForTimeout(300);
  const target=kind==='attendance'?'attendance':'work';assert.ok(reads.some(r=>r.path===target&&r.from==='2026-09-15'&&r.to==='2026-10-20'),JSON.stringify({kind,reads,errors}));
  if(kind==='analysis'){const labels=await page.getByText('2026-09',{exact:true}).count();assert.ok(labels>0);const september=page.locator('tbody tr').filter({has:page.getByText('2026-09',{exact:true})});await september.dblclick();assert.match(await page.evaluate(()=>window.lastNavigation),/production-analysis\/2026-09\/1\/10/);}
  if(kind!=='analysis'){
    recordedMonths=[];await page.reload();await page.waitForTimeout(500);
    // An empty catalogue no longer erases or narrows the selected period.
    assert.equal(await page.getByLabel('End date').inputValue(),kind==='work'?'2026-10-20':'2026-10-31');
    assert.ok(reads.some(r=>r.path===target&&r.to?.startsWith('2026-10')));
  }
  assert.deepEqual(errors,[],kind);await page.close();
 }
 console.log('Work, production analysis and attendance range pages passed: exact day parameters across months and month-correct detail navigation.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
