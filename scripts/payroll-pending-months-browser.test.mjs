import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/payroll-pending-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Page from '/src/pages/App/payroll/PayrollBoard.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));</script></body></html>`);
const port=43190,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-pending-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[];let mutations=0;
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({navigateToPath:noop,showNotification:noop,markTabChanged:noop,clearTabChanged:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/employees?*',route=>route.fulfill({headers,json:[]}));
  await page.route('**/payroll/**',route=>{
    const url=new URL(route.request().url());if(!url.pathname.startsWith('/payroll/'))return route.fallback();if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});
    if(route.request().method()!=='GET')mutations++;
    if(url.pathname.endsWith('/snapshots'))return route.fulfill({headers,json:[{month:'2026-07',factoryId:1,data:[],isProvisional:true}]});
    if(url.pathname.endsWith('/calendar'))return route.fulfill({headers,json:{latestCompletedMonthKey:'2026-09',availableMonthKeys:['2026-10','2026-09','2026-08','2026-07'],factories:[{id:1,name:'Factory',managementStartDateKey:'2026-04-01'}]}});
    if(url.searchParams.get('month')==='2026-09')return route.fulfill({headers,json:{ready:false,completedMonth:true,hasAttendanceData:false,hasWorkData:true,hasCoverageGaps:true,attendanceRecordedCount:0,attendanceRequiredCount:26,groups:[{workRecordedDayCount:20,expectedWorkingDayCount:26}]}});
    return route.fulfill({headers,json:{ready:true,completedMonth:true,hasAttendanceData:true,hasWorkData:true,hasCoverageGaps:true,attendanceRecordedCount:20,attendanceRequiredCount:26,groups:[{workRecordedDayCount:20,expectedWorkingDayCount:26}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/payroll-pending-acceptance.html`);
  const august=page.locator('tbody tr').filter({hasText:'2026-08'});await august.waitFor();
  assert.equal(await page.locator('tbody tr').count(),3);
  assert.equal(await page.locator('tbody tr').filter({hasText:'2026-10'}).count(),0);
  await august.locator('.MuiChip-root').getByText('미계산',{exact:true}).hover();
  assert.equal(await august.getByText(/일부 미기록/).count(),0);
  assert.equal(await page.getByRole('tooltip').count(),0);
  await page.getByRole('combobox',{name:'계산 월'}).click();await page.getByRole('option',{name:'2026-08',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),1);
  assert.equal(await page.getByRole('button',{name:/급여 계산/}).isEnabled(),true);
  await page.getByRole('combobox',{name:'계산 월'}).click();await page.getByRole('option',{name:'2026-09',exact:true}).click();
  await page.locator('tbody tr').getByText('자료 미완료',{exact:true}).hover();
  await page.getByRole('tooltip').waitFor();
  assert.match(await page.getByRole('tooltip').textContent(),/해당 월의.*없습니다/);
  assert.equal(await page.getByRole('button',{name:/급여 계산/}).isDisabled(),true);
  assert.equal(mutations,0);assert.deepEqual(errors,[]);
  console.log('Payroll UI passed: partial August can calculate; September without attendance remains blocked; current month excluded; no payroll mutations.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
