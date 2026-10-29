import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, writeFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';

const fixture = path.resolve('frontend/salary-matrix-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Salary from'/src/pages/App/SalarySystem.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/salary-system']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Salary))));
</script></body></html>`);
const port = 43258;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'], {cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++) { try {if((await fetch(`http://127.0.0.1:${port}/salary-matrix-acceptance.html`)).ok) break;} catch {} await new Promise(r=>setTimeout(r,100)); }
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
  browser = await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']) {
    const page = await browser.newPage({viewport:{width:1600,height:1000}}), errors=[], writes=[];
    page.on('pageerror', e=>errors.push(e.message));
    const mock = (pattern, body) => page.route(pattern, r=>r.fulfill({contentType:'application/javascript',body}));
    await mock('**/src/context/AuthContext.jsx*', 'export const useAuth=()=>({activeOrgId:1});');
    await mock('**/src/context/LanguageContext.jsx*', `export const useLanguage=()=>({languageCode:'${lang}'});`);
    await mock('**/src/context/AppContext.jsx*', 'const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;');
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const payTypes=['GENERAL','OUTPUT_FIXED','OUTPUT'];
    const items=[
      {id:'baseSalary',nameEn:'Base salary',nameKo:'기본급',nameVi:'Lương cơ bản',category:'BASE',payTypes,formula:['GRADE_RATE'],payCycle:'MONTHLY',required:true},
      {id:'lunch',nameEn:'Lunch',nameKo:'점심 수당',nameVi:'Ăn trưa',category:'ALLOWANCE',payTypes,formula:['GRADE_RATE'],payCycle:'MONTHLY'},
      {id:'tenure',nameEn:'Tenure',nameKo:'근속 수당',nameVi:'Thâm niên',category:'ALLOWANCE',payTypes,formula:['GRADE_RATE'],payCycle:'SEMIANNUAL'},
      {id:'incentiveTotal',category:'INCENTIVE',payTypes:['OUTPUT'],formula:['PRODUCTION_ALLOWANCE'],payCycle:'MONTHLY'},
    ];
    const grades=[1,2,3,4].map(id=>({id,code:`CL${id}`,nameEn:`Grade ${id}`,nameKo:`직급 ${id}`,nameVi:`Bậc ${id}`,isActive:true}));
    const rates=payTypes.flatMap(payType=>grades.flatMap(grade=>[['baseSalary',1000],['lunch',200],['tenure',900]].map(([salaryItemCode,amount])=>({payType,gradeId:grade.id,salaryItemCode,amount}))));
    await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Factory',managementStartDate:'2026-04-01'}]}));
    await page.route('**/employee-grades?*',r=>r.fulfill({headers,json:[{grades}]}));
    await page.route('**/salary-system/revision?*',r=>r.fulfill({headers,json:{editRevision:'r1'}}));
    await page.route('**/salary-system?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='PUT')writes.push(r.request().postDataJSON());return r.fulfill({headers,json:{items,rates,currencyCode:'VND',editRevision:'r1',versions:[]}});});
    await page.goto(`http://127.0.0.1:${port}/salary-matrix-acceptance.html`);
    const matrix=page.locator('[data-salary-rate-matrix]');
    const base=matrix.locator('[data-salary-item="baseSalary"]');
    await base.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-salary-item="baseSalary"]')?.innerText.includes('1,000') || document.querySelector('[data-salary-item="baseSalary"]')?.innerText.includes('1.000'));
    assert.equal(await matrix.locator('thead tr').count(),2);
    assert.equal(await matrix.locator('thead tr').nth(1).locator('th').count(),12);
    assert.equal(await base.locator('td').nth(1).evaluate(node=>getComputedStyle(node).fontSize),'13px','use shared body table typography');
    assert.equal(await matrix.locator('thead th').first().evaluate(node=>getComputedStyle(node).backgroundColor),await matrix.locator('thead tr').nth(1).locator('th').first().evaluate(node=>getComputedStyle(node).backgroundColor),'sticky header follows shared header surface');
    assert.ok((await base.boundingBox()).height < 70,'rows stay compact without repeated chips');
    const totals=matrix.locator('[data-salary-total]');
    assert.equal(await totals.count(),2);
    assert.match(await totals.first().innerText(),/1[,.]200/);
    assert.match(await totals.nth(1).innerText(),/900/);
    const editLabel={ko:'수정',en:'Edit',vi:'Sửa'}[lang];
    assert.equal(await matrix.locator('[aria-pressed]').count(),0,'no repeated pay-type chips in overview');
    const lunch=matrix.locator('[data-salary-item="lunch"]');
    const lunchEdit=lunch.getByRole('button',{name:new RegExp(editLabel)});
    assert.equal(await lunchEdit.innerText(),'','item edit uses an icon only');
    assert.equal(await lunchEdit.locator('xpath=ancestor::td[1]').evaluate(node=>node.cellIndex),0,'edit belongs to item-name column');
    await lunchEdit.click();
    const applicability=page.getByRole('dialog').getByRole('checkbox').first();
    await applicability.uncheck();assert.equal(await applicability.isChecked(),false);
    await page.getByRole('dialog').getByRole('button',{name:{ko:'닫기',en:'Close',vi:'Đóng'}[lang],exact:true}).click();
    assert.match(await totals.first().innerText(),/1[,.]000/);
    await base.getByRole('button',{name:new RegExp(editLabel)}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    const rate=dialog.locator('input[inputmode="numeric"]').first();
    await rate.fill('1500');
    await dialog.getByRole('button',{name:{ko:'닫기',en:'Close',vi:'Đóng'}[lang],exact:true}).click();
    assert.match(await base.innerText(),/1[,.]500/);
    assert.match(await totals.first().innerText(),/1[,.]500/);
    assert.equal(writes.length,0,'editing stays local until version save');
    const handle=matrix.locator('[data-salary-item="tenure"] [data-rfd-drag-handle-draggable-id]');
    await handle.focus();await page.keyboard.press('Space');await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');await page.waitForTimeout(100);
    await page.keyboard.press('Space');await page.waitForTimeout(300);
    assert.deepEqual(await matrix.locator('[data-salary-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.salaryItem)),['baseSalary','tenure','lunch','incentiveTotal']);
    await page.getByRole('button',{name:{ko:'저장',en:'Save',vi:'Lưu'}[lang],exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-version-board]')));
    assert.equal(writes.length,1);
    assert.equal(writes[0].expectedRevision,'r1');
    assert.equal(writes[0].createVersion,true);
    assert.deepEqual(writes[0].items.map(row=>row.id),['baseSalary','tenure','lunch','incentiveTotal']);
    assert.equal(writes[0].rates.find(row=>row.payType==='GENERAL' && row.gradeId===1 && row.salaryItemCode==='baseSalary').amount,1500);
    assert.equal(writes[0].rates.some(row=>row.payType==='GENERAL' && row.salaryItemCode==='lunch'),false);
    assert.equal(writes[0].rates.find(row=>row.payType==='OUTPUT' && row.gradeId===1 && row.salaryItemCode==='lunch').amount,200);
    await page.getByRole('dialog').getByRole('button',{name:{ko:'닫기',en:'Close',vi:'Đóng'}[lang],exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await matrix.evaluate(node=>node.scrollWidth>node.clientWidth),true);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Salary matrix passed: ko/en/vi shared table styles, icon-only item actions, applicability checkboxes, grouped grades, period totals, reorder, mobile scroll, and version saves.');
} finally { await browser?.close();server.kill();unlinkSync(fixture); }
