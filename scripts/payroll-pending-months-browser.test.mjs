import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {payrollPayableText} from '../frontend/src/constants/payrollPayable.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/payroll-pending-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Page from '/src/pages/App/payroll/PayrollBoard.jsx';window.testReact=React;createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page)));</script></body></html>`);
const port=43190,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-pending-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[];let mutations=0,lockedMode=false;
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:new URLSearchParams(location.search).get("lang")||"ko"});'}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({navigateToPath:noop,showNotification:noop,markTabChanged:noop,clearTabChanged:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/employees?*',route=>route.fulfill({headers,json:[]}));
  await page.route('**/payroll/**',route=>{
    const url=new URL(route.request().url());if(!url.pathname.startsWith('/payroll/'))return route.fallback();if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});
    if(route.request().method()!=='GET'){mutations++;return route.fulfill({headers,status:409,json:{error:'PAYROLL_MANAGEMENT_EXCLUDED'}});}
    if(url.pathname.endsWith('/snapshots'))return route.fulfill({headers,json:[{month:'2026-07',factoryId:1,data:[],isProvisional:!lockedMode,payableDocument:{managementNumber:'PAY-2026-000001'}}]});
    if(url.pathname.endsWith('/calendar'))return route.fulfill({headers,json:{latestCompletedMonthKey:'2026-09',availableMonthKeys:['2026-10','2026-09','2026-08','2026-07','2024-09'],factories:[{id:1,name:'Factory',managementStartDateKey:'2024-01-01'}]}});
    if(url.searchParams.get('month')==='2026-09')return route.fulfill({headers,json:{ready:false,completedMonth:true,hasAttendanceData:false,hasWorkData:true,hasCoverageGaps:true,attendanceRecordedCount:0,attendanceRequiredCount:26,groups:[{workRecordedDayCount:20,expectedWorkingDayCount:26}]}});
    return route.fulfill({headers,json:{ready:true,completedMonth:true,hasAttendanceData:true,hasWorkData:true,needsRecalculation:!lockedMode&&url.searchParams.get('month')==='2026-07',recalculationReasons:!lockedMode&&url.searchParams.get('month')==='2026-07'?['RATE_CHANGED']:[],hasCoverageGaps:true,attendanceRecordedCount:20,attendanceRequiredCount:26,groups:[{workRecordedDayCount:20,expectedWorkingDayCount:26}]}});
  });
  await page.route('**/src/components/DateRangeSelector.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export default function Range({startValue,endValue,onStartChange,onEndChange}){return window.testReact.createElement('div',null,...[['Start date',startValue,onStartChange],['End date',endValue,onEndChange]].map(([label,value,change])=>window.testReact.createElement('input',{key:label,type:'date','aria-label':label,value:value?.format?.('YYYY-MM-DD')||'',onChange:e=>{const v=e.target.value;change({isValid:()=>true,format:()=>v})}})))}` }));
  await page.goto(`http://127.0.0.1:${port}/payroll-pending-acceptance.html`);
  const august=page.locator('tbody tr').filter({hasText:'2026-08'});await august.waitFor();
  await page.locator('[data-search-panel]').getByText('SEARCH',{exact:true}).waitFor();assert.equal(await page.getByLabel('Start date').inputValue(),'2025-10-01');assert.equal(await page.getByLabel('End date').inputValue(),'2026-09-30');
  assert.equal(await page.locator('tbody tr').count(),3);
  assert.equal(await page.locator('tbody tr').filter({hasText:'2026-10'}).count(),0);
  const july=page.locator('tbody tr').filter({hasText:'2026-07'});await july.getByText('PAY-2026-000001',{exact:true}).waitFor();await july.getByText(payrollPayableText.ko.RATE_CHANGED,{exact:true}).waitFor();
  await august.locator('.MuiChip-root').getByText('미계산',{exact:true}).hover();
  assert.equal(await august.getByText(/일부 미기록/).count(),0);
  assert.equal(await page.getByRole('tooltip').count(),0);
  await page.getByLabel('Start date').fill('2026-08-01');await page.getByLabel('End date').fill('2026-08-31');
  assert.equal(await page.locator('tbody tr').count(),1);
  assert.equal(await page.getByRole('button',{name:/급여 계산/}).isEnabled(),true);
  await page.getByLabel('End date').fill('2026-09-30');await page.getByLabel('Start date').fill('2026-09-01');
  await page.locator('tbody tr').getByText('자료 미완료',{exact:true}).hover();
  await page.getByRole('tooltip').waitFor();
  assert.match(await page.getByRole('tooltip').textContent(),/해당 월의.*없습니다/);
  assert.equal(await page.getByRole('button',{name:/급여 계산/}).isDisabled(),true);
  assert.equal(mutations,0);assert.deepEqual(errors,[]);
  lockedMode=true;await page.reload();await july.waitFor();const lockInput=july.locator('input').first();await lockInput.waitFor();page.on('dialog',dialog=>dialog.accept());await lockInput.click();await page.getByRole('alert').getByText(payrollPayableText.ko.PAYROLL_MANAGEMENT_EXCLUDED,{exact:true}).waitFor();assert.equal(await lockInput.isChecked(),true);assert.equal(mutations,1);assert.deepEqual(errors,[]);
  for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:${port}/payroll-pending-acceptance.html?lang=${lang}`);await august.waitFor();const panel=page.locator('[data-search-panel]'),search=panel.locator('input[type="text"]').first(),reset=panel.getByRole('button',{name:lang==='ko'?'초기화':lang==='vi'?'Đặt lại':'Reset',exact:true});
    await search.fill('PAY-2026-000001');assert.equal(await page.locator('tbody tr').count(),1);await july.getByText('PAY-2026-000001',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/급여 계산|Calculate Payroll|Tính lương/}).isDisabled(),true,'hidden calculable months must not be included');
    await search.fill('Factory');assert.equal(await page.locator('tbody tr').count(),3);await search.fill('2026-08');assert.equal(await page.locator('tbody tr').count(),1);assert.equal(await page.getByRole('button',{name:/급여 계산|Calculate Payroll|Tính lương/}).isEnabled(),true);
    await search.fill('no-such-factory');assert.equal(await page.getByRole('button',{name:/급여 계산|Calculate Payroll|Tính lương/}).isDisabled(),true);await reset.click();await august.waitFor();assert.equal(await search.inputValue(),'');assert.equal(await page.getByLabel('Start date').inputValue(),'2025-10-01');
    await page.getByLabel('Start date').fill('2024-09-01');await page.getByLabel('End date').fill('2024-09-30');await page.locator('tbody tr').getByText('2024-09',{exact:true}).waitFor();await reset.click();await august.waitFor();assert.equal(await page.locator('tbody tr').count(),3);assert.deepEqual(errors,[]);
  }
  console.log('Payroll UI passed: shared SEARCH, trailing 12 months, month/factory/reference filters, visible-row batch calculation, reset and older history; ko/en/vi desktop/mobile; existing readiness and lock protection.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
