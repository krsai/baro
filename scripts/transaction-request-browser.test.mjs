import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
if(!executablePath)throw Error('Chrome required');
const fixture=path.resolve('frontend/transaction-request-acceptance.html');
if(existsSync(fixture))throw Error('Fixture already exists');
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import Entry from '/src/pages/App/TransactionRequestEntry.jsx';createRoot(document.getElementById('root')).render(React.createElement(Entry));</script></body></html>`);
const port=43185,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/transaction-request-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi'])for(const kind of ['LOGISTICS','PROCESS']) {
    const page=await browser.newPage(),errors=[];let payload;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>document.documentElement.dataset.saved="true",showNotification:()=>{}});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={id:4,entryMode:kind,orderInput:'OPTIONAL',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:[],isActive:true};
    await page.route('**/business-partners?*',route=>route.fulfill({headers,json:[{id:11,name:kind==='PROCESS'?'QQ':'Trucking Partner',isActive:true,partnerExpenseTypeId:1,serviceTypes:[]}]}));
    await page.route('**/transaction-codes?*',route=>route.fulfill({headers,json:[{id:7,code:kind==='PROCESS'?'BTH':'TRKV',nameKo:'서비스',nameEn:'Service',nameVi:'Dịch vụ',serviceTypeId:4,base:{...service,expenseTypeId:2,expenseType:{id:2,nameKo:"Logistics",nameEn:"Logistics",nameVi:"Logistics"}},serviceType:service,vatEnabled:kind!=='PROCESS'}]}));
    await page.route('**/app-settings?*',route=>route.fulfill({headers,json:{defaultVatRate:'10'}}));
    await page.route('**/orders?*',route=>route.fulfill({headers,json:[{id:'PUBLIC',dbId:30,ownerOrgId:1,orderNumber:'L18-1'}]}));
    await page.route('**/transaction-request-options?*',route=>route.fulfill({headers,json:{styles:[{id:40,name:'Shirt',code:'S40',styleProcesses:[{id:50,processName:'Buttonhole',processCode:'BH'}]}],plans:[{id:60,styleId:40,factoryName:'Factory A',processIds:[50]},{id:61,styleId:40,factoryName:'Factory B',processIds:[50]}]}}));
    await page.route('**/outsourcing-requests?*',route=>{if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});payload=route.request().postDataJSON();return route.fulfill({headers,json:{id:'saved'}});});
    await page.goto(`http://127.0.0.1:${port}/transaction-request-acceptance.html`);
    const labels=lang==='ko'?{partner:'업체',code:'내역 코드',price:'단가',qty:'수량',order:'주문',style:'스타일',process:'공정',assignment:'생산 배정',submit:'신청 등록'}:lang==='en'?{partner:'Partner',code:'Transaction code',price:'Unit price',qty:'Quantity',order:'Order',style:'Style',process:'Process',assignment:'Production assignment',submit:'Register request'}:{partner:'Đối tác',code:'Mã nội dung',price:'Đơn giá',qty:'Số lượng',order:'Đơn hàng',style:'Mẫu',process:'Công đoạn',assignment:'Phân công sản xuất',submit:'Ghi nhận đề nghị'};

    assert.match(await page.locator('input[type="date"]').inputValue(),/^\d{4}-\d{2}-\d{2}$/);
    await page.getByRole('combobox',{name:labels.code,exact:false}).fill(kind==='PROCESS'?'BTH':'TRKV');
    await page.getByRole('combobox',{name:labels.code,exact:false}).press('Tab');
    await page.getByRole('combobox',{name:labels.partner,exact:false}).click();await page.getByRole('option').first().click();
    await page.getByRole('alert').filter({hasText:lang==='ko'?'지급 대상':lang==='en'?'payee':'đối tác'}).waitFor();
    assert.equal(await page.getByLabel('VAT (%)',{exact:true}).isDisabled(),kind==='PROCESS');
    assert.equal(await page.getByLabel('VAT (%)',{exact:true}).inputValue(),kind==='PROCESS'?'0':'10');
    await page.getByLabel(labels.price,{exact:false}).fill('100000');await page.getByLabel(labels.qty,{exact:false}).fill('2');
    if(kind==='LOGISTICS')await page.getByRole('checkbox',{name:labels.order,exact:true}).check();
    await page.getByRole('combobox',{name:labels.order,exact:false}).click();await page.getByRole('option',{name:'L18-1',exact:true}).click();
    if(kind==='PROCESS') {
      await page.getByRole('combobox',{name:labels.style,exact:false}).click();await page.getByRole('option',{name:'Shirt (S40)'}).click();
      await page.getByRole('combobox',{name:labels.process,exact:false}).click();await page.getByRole('option',{name:'Buttonhole (BH)'}).click();
      assert.equal(await page.getByRole('button',{name:labels.submit,exact:true}).isEnabled(),false);
      await page.getByRole('combobox',{name:labels.assignment,exact:false}).click();await page.getByRole('option',{name:'Factory B · #61'}).click();
    }
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.getByRole('button',{name:labels.submit,exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
    assert.equal(payload.transactionCodeId,7);assert.equal(payload.workOrderId,30);assert.equal(payload.unitPrice,'100000');assert.equal(payload.quantity,'2');
    assert.equal(payload.styleProcessId,kind==='PROCESS'?50:null);assert.equal(payload.assignmentPlanId,kind==='PROCESS'?61:null);
    assert.equal(payload.vatRate,kind==='PROCESS'?'0':'10');assert.ok(!('coverageStartDate'in payload));assert.ok(!('createdByEmployeeId'in payload));assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Unified request page browser acceptance passed: ko/en/vi, TRKV VAT defaults, today, optional order, mandatory process/assignment and FK payloads.');
} finally {if(browser)await browser.close();vite.kill();unlinkSync(fixture);}
