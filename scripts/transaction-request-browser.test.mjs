import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { EXPENSE_LOOKUP_TEXT } from '../frontend/src/constants/expenseLookup.js';
import { EXPENSE_REQUEST_TEXT } from '../frontend/src/constants/expenseRequest.js';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
if(!executablePath)throw Error('Chrome required');
const fixture=path.resolve('frontend/transaction-request-acceptance.html');
if(existsSync(fixture))throw Error('Fixture already exists');
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Entry from '/src/pages/App/TransactionRequestEntry.jsx';import Costs from '/src/pages/App/PartnerTransactionCosts.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(location.search?Costs:Entry))));</script></body></html>`);
const port=43185,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/transaction-request-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi'])for(const kind of ['LOGISTICS','PROCESS']) {
    const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];let payload;const attempts=[];
    page.setDefaultTimeout(15000);console.log('Checking',lang,kind);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>document.documentElement.dataset.saved="true",showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={id:4,entryMode:kind,orderInput:'OPTIONAL',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:[],isActive:true};
    await page.route('**/business-partners?*',route=>route.fulfill({headers,json:[{id:11,name:kind==='PROCESS'?'QQ':'Trucking Partner',isActive:true,partnerExpenseTypeId:1,serviceTypes:[]}]}));
    await page.route('**/transaction-codes?*',route=>route.fulfill({headers,json:[{id:7,code:kind==='PROCESS'?'BTH':'TRKV',nameKo:'서비스',nameEn:'Service',nameVi:'Dịch vụ',serviceTypeId:4,base:{...service,expenseTypeId:2,expenseType:{id:2,nameKo:"Logistics",nameEn:"Logistics",nameVi:"Logistics"}},serviceType:service,vatEnabled:kind!=='PROCESS'}]}));
    await page.route('**/app-settings?*',route=>route.fulfill({headers,json:{defaultVatRate:'10'}}));
    await page.route('**/orders?*',route=>route.fulfill({headers,json:[{id:'PUBLIC',dbId:30,ownerOrgId:1,orderNumber:'L18-1'}]}));
    await page.route('**/transaction-request-options?*',route=>route.fulfill({headers,json:{styles:[{id:40,name:'Shirt',code:'S40',styleProcesses:[{id:50,processName:'Buttonhole',processCode:'BH'}]}],plans:[{id:60,styleId:40,factoryName:'Factory A',processIds:[50]},{id:61,styleId:40,factoryName:'Factory B',processIds:[50]}]}}));
    await page.route('**/expense-requests?*',route=>{if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});payload=route.request().postDataJSON();attempts.push(payload);if(attempts.length===1&&kind==='LOGISTICS')return route.fulfill({headers,status:503,json:{error:'unavailable'}});return route.fulfill({headers,json:{id:1}});});
    await page.goto(`http://127.0.0.1:${port}/transaction-request-acceptance.html`);
    const l=EXPENSE_REQUEST_TEXT[lang],labels={partner:l.payee,code:l.code,price:l.price,qty:l.quantity,order:l.order,style:l.style,process:l.process,assignment:l.assignment,submit:await page.evaluate(async language=>(await import('/src/constants/uiMessages.js')).getUiMessage('common.save','Save',language),lang)};
    const headerSave=page.getByRole('button',{name:labels.submit,exact:true});
    await headerSave.waitFor();
    assert.equal(await headerSave.count(),1);
    const headerPosition=await headerSave.boundingBox();
    assert.ok(headerPosition.y<120,'Save belongs in the common top header');
    assert.equal(await page.locator('.cc-entry').count(),0,'Entry uses the shared page layout');
    await page.getByLabel(l.title,{exact:false}).fill('Factory expenses');
    const fieldSizes=await page.locator('.MuiOutlinedInput-root:not(.MuiInputBase-multiline), .MuiPickersOutlinedInput-root').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize})));
    assert.ok(fieldSizes.length>=8);
    assert.ok(fieldSizes.every(size=>size.height===36&&size.font==='13px'),JSON.stringify(fieldSizes));
    const outlineSizes=await page.locator('.MuiOutlinedInput-root fieldset, .MuiPickersOutlinedInput-root fieldset').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    assert.ok(Math.max(...outlineSizes)-Math.min(...outlineSizes)<=1,'Visible field borders share the same height: '+JSON.stringify(outlineSizes));
    assert.equal(await page.getByRole('columnheader',{name:l.useDate,exact:true}).count(),0);
    await page.getByRole('textbox',{name:labels.code,exact:false}).fill(kind==='PROCESS'?'BT':'TRK');
    await page.getByRole('textbox',{name:labels.code,exact:false}).press('Enter');
    await page.getByRole('dialog').getByRole('button',{name:EXPENSE_LOOKUP_TEXT[lang].select,exact:true}).click();
    await page.getByRole('textbox',{name:labels.partner,exact:false}).click();await page.getByRole('dialog').getByRole('button',{name:EXPENSE_LOOKUP_TEXT[lang].select,exact:true}).click();
    await page.getByRole('alert').filter({hasText:lang==='ko'?'지급 대상':lang==='en'?'payee':'đối tác'}).waitFor();
    assert.equal(await page.getByLabel('VAT (%)',{exact:true}).isDisabled(),kind==='PROCESS');
    assert.equal(await page.getByLabel('VAT (%)',{exact:true}).inputValue(),kind==='PROCESS'?'0':'10');
    await page.getByLabel(labels.price,{exact:false}).fill('100000');await page.getByLabel(labels.qty,{exact:false}).fill('2');
    if(kind==='LOGISTICS'){await page.getByRole('button',{name:l.detail,exact:true}).click();await page.getByRole('checkbox',{name:labels.order,exact:true}).check();}
    await page.getByRole('combobox',{name:labels.order,exact:false}).click();await page.getByRole('option',{name:'L18-1',exact:true}).click();
    if(kind==='PROCESS') {
      await page.getByRole('combobox',{name:labels.style,exact:false}).click();await page.getByRole('option',{name:'Shirt (S40)'}).click();
      await page.getByRole('combobox',{name:labels.process,exact:false}).click();await page.getByRole('option',{name:'Buttonhole (BH)'}).click();
      assert.equal(await page.getByRole('button',{name:labels.submit,exact:true}).isEnabled(),false);
      await page.getByRole('combobox',{name:labels.assignment,exact:false}).click();await page.getByRole('option',{name:'Factory B · #61'}).click();
    }
    assert.equal(await page.getByRole('dialog').count(),0);
    if(kind==='LOGISTICS') {
      await page.getByRole('button',{name:l.add,exact:true}).click();
      const second=page.getByTestId('expense-line').nth(1);
      await second.getByRole('textbox',{name:labels.code,exact:false}).fill('TRKV');await second.getByRole('textbox',{name:labels.code,exact:false}).press('Tab');
      await second.getByLabel(labels.price,{exact:false}).fill('50000');await second.getByLabel(labels.qty,{exact:false}).fill('1');
      await page.getByRole('button',{name:l.add,exact:true}).click();await page.getByTestId('expense-line').nth(2).getByRole('button',{name:l.remove,exact:true}).click();
      assert.equal(await page.getByTestId('expense-line').count(),2);
      assert.match(await page.getByTestId('expense-totals').textContent(),/275/);
    }
    console.log('Submitting',lang,kind);await page.getByRole('button',{name:labels.submit,exact:true}).click();if(kind==='LOGISTICS'){await page.getByRole('button',{name:l.retry,exact:true}).click();assert.deepEqual(attempts[0],attempts[1]);}await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
    assert.equal(payload.items.length,kind==='LOGISTICS'?2:1);assert.equal(payload.partnerOrgId,11);assert.match(payload.requestDate,/^\d{4}-\d{2}-\d{2}$/);payload=payload.items[0];
    assert.ok(!('transactionDate' in payload));assert.equal(payload.transactionCodeId,7);assert.equal(payload.workOrderId,30);assert.equal(payload.unitPrice,'100000');assert.equal(payload.quantity,'2');
    assert.equal(payload.styleProcessId,kind==='PROCESS'?50:null);assert.equal(payload.assignmentPlanId,kind==='PROCESS'?61:null);
    assert.equal(payload.vatRate,kind==='PROCESS'?'0':'10');assert.ok(!('coverageStartDate'in payload));assert.ok(!('createdByEmployeeId'in payload));assert.deepEqual(errors,[]);
    await page.close();
  }
  const list=await browser.newPage({viewport:{width:1440,height:1000}}),listErrors=[];
  list.on('pageerror',error=>listErrors.push(error.message));
  await list.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await list.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
  const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),headers={'Access-Control-Allow-Origin':'*'};
  const items=[{id:'one',transactionDate:date,description:'Transport',quantity:'2',unitPrice:'100000',subtotal:'200000',vatRate:'10',vatAmount:'20000',amount:'220000',transactionCode:{code:'TRKV'}},{id:'two',transactionDate:date,description:'Packing',quantity:'1',unitPrice:'50000',subtotal:'50000',vatRate:'10',vatAmount:'5000',amount:'55000',transactionCode:{code:'TRKV'}}];
  await list.route('**/expense-requests?*',route=>route.fulfill({headers,json:[{id:1,title:'Factory expenses',requestDate:date,partner:{name:'Trucking Partner'},createdByEmployee:{name:'Applicant'},currency:'VND',subtotal:'250000',vatAmount:'25000',amount:'275000',items}]}));
  await list.route('**/outsourcing-requests?*',route=>route.fulfill({headers,json:[{id:'old',transactionDate:date,description:'Legacy cost',currency:'VND',amount:'100'}]}));
  await list.goto('http://127.0.0.1:'+port+'/transaction-request-acceptance.html?list');
  await list.getByRole('tab',{name:EXPENSE_REQUEST_TEXT.ko.documentList,exact:true}).click();
  await list.getByRole('button',{name:'EXP-000001',exact:true}).click();
  const dialog=list.getByRole('dialog');await dialog.getByText('Packing',{exact:true}).waitFor();
  assert.match(await dialog.innerText(),/275,000/);await dialog.getByRole('button',{name:EXPENSE_REQUEST_TEXT.ko.close,exact:true}).click();
  await list.getByRole('tab',{name:EXPENSE_REQUEST_TEXT.ko.all,exact:true}).click();await list.getByText('Legacy cost',{exact:true}).waitFor();
  assert.deepEqual(listErrors,[]);await list.close();
  console.log('Expense document UI passed: ko/en/vi, multiple rows, add/remove, totals, same-body retry, code defaults and process FK payloads.');
} finally {if(browser)await browser.close();vite.kill();unlinkSync(fixture);}
