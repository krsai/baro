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
      {id:'phone',nameEn:'Phone',nameKo:'통신비',nameVi:'Điện thoại',category:'ALLOWANCE',payTypes,formula:['GRADE_RATE'],payCycle:'MONTHLY'},
      {id:'tenure',nameEn:'Tenure',nameKo:'근속 수당',nameVi:'Thâm niên',category:'ALLOWANCE',payTypes,formula:['GRADE_RATE'],payCycle:'SEMIANNUAL'},
      {id:'custom-night',nameEn:'Overtime',nameKo:'야근 수당',nameVi:'Tăng ca',category:'ALLOWANCE',payTypes,formula:['GRADE_RATE','÷','CONST:26','÷','CONST:8','×','OVERTIME_HOURS','×','CONST:1.5'],payCycle:'MONTHLY'},
      {id:'incentiveTotal',nameEn:'Output incentive',nameKo:'실적 수당',nameVi:'Phụ cấp kết quả',category:'INCENTIVE',payTypes:['OUTPUT'],formula:['PRODUCTION_ALLOWANCE'],payCycle:'MONTHLY'},
    ];
    const grades=[1,2,3,4].map(id=>({id,code:`CL${id}`,nameEn:`Grade ${id}`,nameKo:`직급 ${id}`,nameVi:`Bậc ${id}`,isActive:true}));
    const rates=payTypes.flatMap(payType=>grades.flatMap(grade=>[['baseSalary',1000],['lunch',200],['phone',0],['tenure',900],['custom-night',500]].map(([salaryItemCode,amount])=>({payType,gradeId:grade.id,salaryItemCode,amount}))));
    rates.find(row=>row.payType==='OUTPUT_FIXED' && row.gradeId===4 && row.salaryItemCode==='baseSalary').amount=0;
    rates.splice(rates.findIndex(row=>row.payType==='OUTPUT_FIXED' && row.gradeId===4 && row.salaryItemCode==='lunch'),1);
    await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Factory',managementStartDate:'2026-04-01'}]}));
    await page.route('**/employee-grades?*',r=>r.fulfill({headers,json:[{grades}]}));
    await page.route('**/salary-system/revision?*',r=>r.fulfill({headers,json:{editRevision:'r1'}}));
    await page.route('**/salary-system?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);items.splice(0,items.length,...body.items);}return r.fulfill({headers,json:{items,rates,currencyCode:'VND',editRevision:'r1',versions:[]}});});
    await page.goto(`http://127.0.0.1:${port}/salary-matrix-acceptance.html`);
    const matrix=page.locator('[data-salary-rate-matrix]');
    const base=matrix.locator('[data-salary-item="baseSalary"]');
    await base.waitFor();
    await page.waitForFunction(() => /1[,.]000/.test(document.querySelector('[data-salary-item="baseSalary"] input')?.value || ''));
    assert.equal(await matrix.locator('thead tr').count(),2);
    assert.equal(await matrix.locator('thead tr').nth(1).locator('th').count(),12);
    assert.equal(await base.locator('td').nth(1).evaluate(node=>getComputedStyle(node).fontSize),'13px','use shared body table typography');
    assert.equal(await matrix.locator('thead th').first().evaluate(node=>getComputedStyle(node).backgroundColor),await matrix.locator('thead tr').nth(1).locator('th').first().evaluate(node=>getComputedStyle(node).backgroundColor),'sticky header follows shared header surface');
    assert.ok((await base.boundingBox()).height < 70,'rows stay compact without repeated chips');
    const totals=matrix.locator('[data-salary-total]');
    assert.ok((await matrix.locator('thead tr').nth(1).locator('th').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).textAlign))).every(value=>value==='center'));
    assert.ok((await base.locator('td').filter({hasNot:page.locator('button')}).evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).textAlign))).every(value=>value==='right'));
    assert.equal(await base.locator('input').first().evaluate(node=>getComputedStyle(node).textAlign),'right');
    assert.equal(await matrix.locator('xpath=..').getByText(/^(급여 항목|Salary items|Khoản lương) \u00b7 VND$/).count(),0,'no redundant card header');
    for(const row of [matrix.locator('thead tr').nth(1).locator('th'),base.locator('td').nth(1),totals.locator('td').nth(1)]){
      assert.ok((await row.evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).borderLeftWidth)))).every(width=>width>=1),'grade columns have visible dividers');
    }
    assert.equal(await totals.count(),1,'only monthly payment items have a total');
    assert.deepEqual(await matrix.locator('[data-salary-group="ALLOWANCE"] [data-salary-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.salaryItem)),['lunch','phone']);
    assert.deepEqual(await matrix.locator('[data-salary-group="ADDITIONAL_ALLOWANCE"] [data-salary-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.salaryItem)),['tenure','custom-night']);
    assert.equal(await base.locator('td').nth(8).getByRole('textbox').inputValue(),'','stored zero uses a dash');
    assert.equal(await matrix.locator('[data-salary-item="lunch"] td').nth(8).getByRole('textbox').inputValue(),'','missing rate uses a dash');
    assert.equal(await totals.locator('td').nth(8).innerText(),'—','zero total uses a dash');
    assert.match(await totals.first().innerText(),/1[,.]200/);
    assert.equal(await matrix.locator('[data-salary-item="tenure"]').count(),1,'non-monthly items remain visible');
    assert.doesNotMatch(await totals.innerText(),/900|2[,.]100/,'semiannual rate is excluded');
    const editLabel={ko:'정산 설정',en:'Settlement settings',vi:'Thiết lập quyết toán'}[lang];
    assert.equal(await matrix.locator('[aria-pressed]').count(),0,'no repeated pay-type chips in overview');
    const lunch=matrix.locator('[data-salary-item="lunch"]');
    const lunchEdit=lunch.getByRole('button',{name:new RegExp(editLabel)});
    assert.equal(await lunchEdit.innerText(),'','item edit uses an icon only');
    assert.equal(await lunchEdit.locator('xpath=ancestor::td[1]').evaluate(node=>node.cellIndex),0,'edit belongs to item-name column');
    await lunchEdit.click();
    let dialog=page.getByRole('dialog');
    assert.equal(await dialog.locator('table').count(),0,'settlement settings contain no grade-rate table');
    let applicability=dialog.getByRole('checkbox').first();
    await applicability.uncheck();
    await page.mouse.click(5,5);await dialog.waitFor({state:'hidden'});
    assert.match(await totals.innerText(),/1[,.]200/,'outside click discards draft applicability');
    assert.equal(await lunch.locator('td').nth(1).getByRole('textbox').inputValue(),'200');
    await lunchEdit.click();dialog=page.getByRole('dialog');
    await dialog.getByRole('checkbox').first().uncheck();
    await dialog.getByRole('button',{name:{ko:'확인',en:'Confirm',vi:'Xác nhận'}[lang],exact:true}).click();
    assert.match(await totals.first().innerText(),/1[,.]000/);
    assert.equal(await lunch.locator('td').nth(1).innerText(),'—');
    const rate=base.locator('td').nth(1).getByRole('textbox');
    await rate.fill('1500');await rate.press('Tab');
    assert.match(await rate.inputValue(),/1[,.]500/);
    assert.match(await totals.first().innerText(),/1[,.]500/);
    await base.getByRole('button',{name:new RegExp(editLabel)}).click();
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.match(await rate.inputValue(),/1[,.]500/,'canceling settlement does not discard inline rate edits');
    assert.equal(writes.length,0,'editing stays local until version save');
    const night=matrix.locator('[data-salary-item="custom-night"]');
    await night.getByRole('button',{name:new RegExp(editLabel)}).click();dialog=page.getByRole('dialog');
    const baseLabel={ko:'기본급',en:'Base salary',vi:'Lương cơ bản'}[lang];
    await dialog.getByRole('button',{name:`${baseLabel} · VND`,exact:true}).click();
    assert.equal(await dialog.locator('.MuiChip-root').first().innerText(),baseLabel,'module replaces the first formula chip');
    assert.equal(await dialog.getByRole('combobox',{name:{ko:'계산 기준',en:'Calculation basis',vi:'Cơ sở tính'}[lang],exact:true}).count(),0,'basis is selected directly through formula modules');
    await dialog.getByRole('button',{name:{ko:'확인',en:'Confirm',vi:'Xác nhận'}[lang],exact:true}).click();
    assert.equal(await night.getByRole('textbox').count(),0,'base-salary formulas need no manual allowance inputs');
    assert.ok((await night.innerText()).includes({ko:'자동 계산',en:'Automatic',vi:'Tự động'}[lang]));
    const production=matrix.locator('[data-salary-item="incentiveTotal"]');
    const originalProductionName={ko:'실적 수당',en:'Output incentive',vi:'Phụ cấp kết quả'}[lang];
    assert.match(await production.innerText(),new RegExp(originalProductionName),'loading preserves custom production name');
    await production.getByRole('button',{name:new RegExp(editLabel)}).click();dialog=page.getByRole('dialog');
    assert.equal(await dialog.getByRole('textbox').count(),3,'production item edits names only');
    await dialog.getByRole('textbox').first().fill('Discarded name');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    assert.match(await production.innerText(),new RegExp(originalProductionName));
    await production.getByRole('button',{name:new RegExp(editLabel)}).click();dialog=page.getByRole('dialog');
    for(const input of await dialog.getByRole('textbox').all())await input.fill('');
    const confirmName={ko:'확인',en:'Confirm',vi:'Xác nhận'}[lang];
    assert.equal(await dialog.getByRole('button',{name:confirmName,exact:true}).isDisabled(),true);
    const renamedProduction={ko:'생산 실적 수당',en:'Renamed production',vi:'Phụ cấp năng suất'}[lang];
    await dialog.getByRole('textbox').nth({en:0,ko:1,vi:2}[lang]).fill(renamedProduction);
    await dialog.getByRole('button',{name:confirmName,exact:true}).click();
    assert.match(await production.innerText(),new RegExp(renamedProduction));
    const handle=matrix.locator('[data-salary-item="phone"] [data-rfd-drag-handle-draggable-id]');
    await handle.focus();await page.keyboard.press('Space');await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');await page.waitForTimeout(100);
    await page.keyboard.press('Space');await page.waitForTimeout(300);
    assert.deepEqual(await matrix.locator('[data-salary-item]').evaluateAll(nodes=>nodes.map(node=>node.dataset.salaryItem)),['baseSalary','phone','lunch','tenure','custom-night','incentiveTotal']);
    await page.getByRole('button',{name:{ko:'저장',en:'Save',vi:'Lưu'}[lang],exact:true}).click();
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-version-board]')));
    assert.equal(writes.length,1);
    assert.equal(writes[0].expectedRevision,'r1');
    assert.equal(writes[0].createVersion,true);
    const productionItem=writes[0].items.find(item=>item.id==='incentiveTotal');
    assert.equal(productionItem.nameEn,renamedProduction);assert.deepEqual(productionItem.formula,['PRODUCTION_ALLOWANCE']);assert.deepEqual(productionItem.payTypes,['OUTPUT']);assert.equal(productionItem.required,true);assert.equal(productionItem.capValue,null);
    assert.equal(writes[0].rates.find(row=>row.payType==='OUTPUT_FIXED' && row.gradeId===4 && row.salaryItemCode==='baseSalary').amount,0,'display formatting preserves stored zero');
    assert.deepEqual(writes[0].items.map(row=>row.id),['baseSalary','phone','lunch','tenure','custom-night','incentiveTotal']);
    assert.equal(writes[0].items.find(row=>row.id==='custom-night').category,'ALLOWANCE','display grouping preserves stored category');
    assert.deepEqual(writes[0].items.find(row=>row.id==='custom-night').formula,['BASE_SALARY','÷','CONST:26','÷','CONST:8','×','OVERTIME_HOURS','×','CONST:1.5'],'basis switch preserves the rest of the formula');
    assert.equal(writes[0].rates.find(row=>row.salaryItemCode==='custom-night').amount,500,'excluded display totals preserve additional rates');
    assert.equal(writes[0].rates.find(row=>row.payType==='GENERAL' && row.gradeId===1 && row.salaryItemCode==='baseSalary').amount,1500);
    assert.equal(writes[0].rates.some(row=>row.payType==='GENERAL' && row.salaryItemCode==='lunch'),false);
    assert.equal(writes[0].rates.find(row=>row.payType==='OUTPUT' && row.gradeId===1 && row.salaryItemCode==='lunch').amount,200);
    await page.getByRole('dialog').getByRole('button',{name:{ko:'닫기',en:'Close',vi:'Đóng'}[lang],exact:true}).click();
    assert.match(await production.innerText(),new RegExp(renamedProduction),'name survives save and reload');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await matrix.evaluate(node=>node.scrollWidth>node.clientWidth),true);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Salary matrix passed: ko/en/vi shared table styles, icon-only item actions, applicability checkboxes, grouped grades, period totals, reorder, mobile scroll, and version saves.');
} finally { await browser?.close();server.kill();unlinkSync(fixture); }
