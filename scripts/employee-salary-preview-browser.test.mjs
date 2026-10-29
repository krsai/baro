import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/employee-salary-preview-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/SalarySystem.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/salary-system']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const port=43259,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/employee-salary-preview-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']){
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    const mock=(pattern,body)=>page.route(pattern,r=>r.fulfill({contentType:'application/javascript',body}));
    await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
    await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
    await mock('**/src/context/AppContext.jsx*','const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;');
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const items=['base','lunch','night','tenure','production'].map(code=>({code,nameEn:code,nameKo:code,nameVi:code}));
    const employee={id:1,name:'Active Worker',employeeNo:'E1',grade:{nameEn:'Staff',nameKo:'사원',nameVi:'Nhân viên'},payType:'OUTPUT',tenureEligible:true,scheduledWorkdays:25,regularHours:200,salaryItems:items.map((item,index)=>({code:item.code,amount:[1000000,250000,0,0,1440000][index]})),total:2690000,subtotal:2690000};
    await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Factory'}]}));
    await page.route('**/employee-grades?*',r=>r.fulfill({headers,json:[]}));
    await page.route('**/salary-system/revision?*',r=>r.fulfill({headers,json:{editRevision:'r1'}}));
    await page.route('**/salary-system?*',r=>r.fulfill({headers,json:{items:[],rates:[],versions:[],editRevision:'r1'}}));
    let fail=false,delay=0;
    await page.route('**/salary-system/employee-preview?*',async r=>{
      const url=new URL(r.request().url());requests.push({method:r.request().method(),month:url.searchParams.get('month'),all:url.searchParams.get('includeInactive')});
      if(fail)return r.fulfill({headers,status:500,json:{error:'test error'}});
      const all=url.searchParams.get('includeInactive')==='1';
      const result={month:url.searchParams.get('month'),unassigned:[],factories:[{id:1,name:'Factory',currencyCode:'VND',versionNumber:3,items,standards:[{payType:'OUTPUT',workWeekdays:[1,2,3,4,5,6],standardClockIn:'08:00',standardClockOut:'17:00',breakMinutes:60,scheduledWorkdays:25,regularHours:200}],employees:[employee,...(all?[{...employee,id:2,name:'Former Worker'}]:[])]}]};
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      await r.fulfill({headers,json:result}).catch(()=>{});
    });
    await page.goto(`http://127.0.0.1:${port}/employee-salary-preview-acceptance.html`);
    await page.getByRole('button',{name:{ko:'직원별 예상 급여',en:'Employee salary estimate',vi:'Lương dự kiến theo nhân viên'}[lang],exact:true}).click();
    const dialog=page.getByRole('dialog');const row=dialog.locator('[data-preview-employee="1"]');await row.waitFor();
    assert.match(await row.locator('[data-preview-item="production"]').innerText(),/1[,.]440[,.]000/);
    assert.equal(await row.locator('[data-preview-item="night"]').innerText(),'—');
    assert.equal(await row.locator('[data-preview-item="tenure"]').innerText(),'—');
    assert.match(await dialog.locator('[data-preview-standard="OUTPUT"]').innerText(),/08:00–17:00/);
    assert.equal(await dialog.locator('[data-preview-employee="2"]').count(),0);
    await dialog.getByRole('checkbox').check();await dialog.locator('[data-preview-employee="2"]').waitFor();
    assert.equal(requests.at(-1).all,'1');
    await dialog.locator('input[type="month"]').fill('2026-06');await row.waitFor();
    await page.waitForFunction(()=>document.querySelector('input[type="month"]')?.value==='2026-06');
    assert.ok(requests.some(request=>request.month==='2026-06'));
    fail=true;await dialog.getByRole('checkbox').uncheck();
    const retry=dialog.getByRole('button',{name:{ko:'다시 시도',en:'Try again',vi:'Thử lại'}[lang]});await retry.waitFor();
    assert.equal(await row.count(),0,'failed request clears stale salary amounts');
    fail=false;await retry.click();await row.waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await dialog.locator('.MuiTableContainer-root').evaluate(node=>node.scrollWidth>node.clientWidth),true);
    assert.ok(requests.every(request=>request.method==='GET'),'preview never writes payroll or settings');
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Employee salary preview browser passed: ko/en/vi open from settings, all/current filter, month, itemized production/overtime/tenure, error retry, mobile scroll and read-only requests.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
