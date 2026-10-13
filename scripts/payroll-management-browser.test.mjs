import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/payroll-management-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Page from '/src/pages/App/payroll/PayrollSettingsDialog.jsx';const noop=()=>{};createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Page,{open:true,orgId:1,languageCode:'ko',onClose:noop,showNotification:noop}))); </script></body></html>`);
const port=43191,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-management-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage(),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const noop=()=>{};export const useAppActions=()=>({setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/payroll/settings?*',route=>{
    const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
    if(req.method()==='PUT'){writes.push(req.postDataJSON());return route.fulfill({headers,json:{}});}
    const month=new URL(req.url()).searchParams.get('month')||'2026-10';
    return route.fulfill({headers,json:{month,revision:'1:1',employees:[{id:1,employeeNo:'BRVN0024',name:'Uyen',status:'ACTIVE',alwaysFullAttendance:true,payrollExcluded:false,payrollManagementVersions:[{id:1,effectiveMonth:'2026-09',alwaysFullAttendance:true,payrollExcluded:false}]}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/payroll-management-acceptance.html`);
  const month=page.getByLabel('적용 월',{exact:true});await month.waitFor();
  await page.waitForFunction(()=>document.querySelector('input[type="month"]')?.value==='2026-10'&&!document.querySelector('input[type="month"]')?.disabled);
  await month.fill('2026-11');
  await page.waitForFunction(()=>document.querySelector('input[type="month"]')?.value==='2026-11'&&!document.querySelector('input[type="month"]')?.disabled);
  await page.getByText('변경 이력',{exact:true}).hover();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').textContent(),/2026-09/);
  const handle=page.locator('[data-rfd-drag-handle-draggable-id="1"]');await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
  const save=page.getByRole('button',{name:'저장',exact:true});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='저장'&&!button.disabled));
  assert.equal(await month.isDisabled(),true);
  await save.click();await page.waitForTimeout(300);
  assert.equal(writes.length,1);assert.deepEqual(writes[0],{effectiveMonth:'2026-11',revision:'1:1',alwaysFullAttendanceEmployeeIds:[],payrollExcludedEmployeeIds:[1]});assert.deepEqual(errors,[]);
  console.log('Payroll management UI passed: effective month, history, keyboard movement, and versioned save payload (mock API only).');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
