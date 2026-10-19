import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { EXPENSE_REQUEST_TEXT } from '../frontend/src/constants/expenseRequest.js';
import { EXPENSE_LOOKUP_TEXT } from '../frontend/src/constants/expenseLookup.js';
import { expenseCodeDescription } from '../frontend/src/utils/expenseCodePresentation.mjs';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/expense-editor-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Entry from '/src/pages/App/TransactionRequestEntry.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/outsourcing-record/edit/legacy/78']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/outsourcing-record/edit/:sourceKind/:sourceId',element:React.createElement(Entry)})))));</script></body></html>`);
const port=43209,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-editor-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi'])for(const locked of [false,true]) {
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[];let submitted;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(r.url().includes('/work-logs'))requests.push(r.url());});
    await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,accessProfile:{orgName:"BARO",employeeName:"Current editor"}});'}));
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false});'}));
    await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>document.documentElement.dataset.saved="true",showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={isActive:true,entryMode:'GENERAL',requiredFields:[],expenseTypeId:1,serviceTypeId:4};
    const mocks={ 'business-partners':[{id:11,name:'Selected vendor',isActive:true,partnerExpenseTypeId:1,serviceTypes:[{id:44,systemDefaultId:4}]}],
      'transaction-codes':[{id:7,code:'BTHE',nameKo:'Buttonhole',nameEn:'Buttonhole',nameVi:'Buttonhole',isActive:true,vatEnabled:false,serviceTypeId:4,base:service}],
      'orders':[], 'app-settings':{defaultVatRate:'10'} };
    for(const [endpoint,json] of Object.entries(mocks))await page.route(`**/${endpoint}?*`,r=>r.fulfill({headers,json}));
    await page.route('**/expense-request-editor/legacy/78?*',r=>{
      if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
      if(r.request().method()==='PUT'){submitted=r.request().postDataJSON();return r.fulfill({headers,json:{requestId:1}});}
      return r.fulfill({headers,json:{title:'Original request',requestDate:'2026-07-31',partnerOrgId:11,partner:{id:11,name:'Selected vendor'},createdByEmployee:{id:21,name:'Original author'},revision:'server-revision',readOnly:locked,
        items:[{sourceRecordId:78,itemId:null,transactionCodeId:'',currency:'VND',quantity:'170',unitPrice:'3000',vatRate:'0',description:'Original buttonhole expense',details:{},workOrderId:30,styleId:40,styleProcessId:50,assignmentPlanId:60,productionLinked:true,productionLocked:false,enabled:{order:true,style:true,process:true},
          preservedReferences:{order:{id:30,orderNumber:'L17-1'},style:{id:40,name:'Shirt',code:'AM02058',styleProcesses:[{id:50,processName:'Buttonhole',processCode:'BH'}]},plan:{id:60,styleId:40,processIds:[50]}}}]}});
    });
    await page.goto(`http://127.0.0.1:${port}/expense-editor-acceptance.html`);
    const l=EXPENSE_REQUEST_TEXT[lang],lookup=EXPENSE_LOOKUP_TEXT[lang];
    await page.getByLabel(l.title,{exact:false}).waitFor();
    await page.waitForFunction(()=>document.querySelector('input')?.value==='Original request');
    assert.equal(await page.getByTestId('expense-line').count(),1);
    assert.equal(await page.getByLabel(l.price,{exact:false}).inputValue(),'3,000');
    assert.equal(await page.getByLabel(l.quantity,{exact:false}).inputValue(),'170');
    assert.match(await page.getByTestId('expense-author-context').innerText(),/Original author/);
    assert.equal(await page.getByRole('button',{name:l.remove,exact:true}).isDisabled(),true);
    if(locked){assert.equal(await page.getByLabel(l.title,{exact:false}).isDisabled(),true);assert.equal(await page.getByTestId('expense-line').getByLabel(l.price,{exact:false}).isDisabled(),true);}
    else {
      const code=page.getByTestId('expense-line').getByRole('textbox',{name:l.code,exact:false});
      await code.locator('..').getByRole('button').click();
      const keyword=page.getByRole('dialog').getByLabel(lookup.keyword,{exact:false});
      await keyword.fill('Buttonhole');
      assert.equal(await page.getByRole('dialog').locator('tbody tr').count(),1);
      assert.match(await page.getByRole('dialog').locator('tbody').innerText(),/BTHE/);
      await keyword.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
      assert.equal(await keyword.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
      await page.getByRole('dialog').getByRole('button',{name:lookup.select,exact:true}).click();
      await code.fill('BTHE');await code.press('Enter');
      // A unique exact code resolves directly; no legacy work group is requested.
      if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:lookup.select,exact:true}).click();
      assert.equal(await page.getByLabel(l.description,{exact:false}).inputValue(),expenseCodeDescription(mocks['transaction-codes'][0],lang));
      assert.equal(await page.locator('.MuiAlert-standardWarning').count(),0,'Shared source FK must not produce an industry warning');
      await page.getByLabel(l.title,{exact:false}).fill('Updated request');
      await page.getByLabel(l.price,{exact:false}).fill('5000');
      assert.equal(await page.getByLabel(l.price,{exact:false}).inputValue(),'5,000');
      const save=page.locator('button.MuiButton-contained').first();
      await save.click();await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
      assert.equal(submitted.title,'Updated request');assert.equal(submitted.revision,'server-revision');
      assert.equal(submitted.items[0].sourceRecordId,78);assert.equal(submitted.items[0].assignmentPlanId,60);assert.equal(submitted.items[0].unitPrice,'5000');
      assert.equal(submitted.items[0].description,expenseCodeDescription(mocks['transaction-codes'][0],lang));
    }
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Expense edit form passed: ko/en/vi, selected source values, immutable production FKs, PUT edits, original author and final-lock read-only.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
