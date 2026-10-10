import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
if (!executablePath) throw Error('Chrome required');
const fixture = path.resolve('frontend/partner-cost-acceptance.html');
if (existsSync(fixture)) throw Error('Temporary fixture already exists');
writeFileSync(fixture, `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client'; import Costs from '/src/pages/App/PartnerTransactionCosts.jsx'; createRoot(document.getElementById('root')).render(React.createElement(Costs, {unified:location.search.includes('unified=1'),onProcessRequest:selection=>{document.documentElement.dataset.partner=String(selection.partner.id);document.documentElement.dataset.service=String(selection.serviceType.id);}}));</script></body></html>`);
const port=43184;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-cost-acceptance.html`)).ok) break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const scenario of ['ko','en','vi','unified']) {
    const lang=scenario==='unified'?'ko':scenario;
    const page=await browser.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={id:4,isActive:true,entryMode:'LOGISTICS',nameKo:'물류',nameEn:'Logistics',nameVi:'Vận chuyển',requiredFields:['transportDate','origin','destination']};
    await page.route('**/business-partners?*',route=>route.fulfill({headers,json:[{id:11,name:'Logistics Partner',isActive:true,serviceTypes:[service]},{id:12,name:'QQ Process Only',isActive:true,serviceTypes:[{...service,id:5,entryMode:'PROCESS'}]}]}));
    await page.route('**/orders?*',route=>route.fulfill({headers,json:[{id:'PUBLIC_ORDER',dbId:30,orderNumber:'ORDER-30'}]}));
    let payload; let costs=[];
    await page.route('**/outsourcing-requests?*',route=>route.fulfill({headers,json:[{id:'work-record-77',sourceKind:'HISTORICAL_WORK_RECORD',workLogId:12,partner:{name:'QQ Process Only'},transactionDate:'2026-09-20',description:'Historical process',amount:'123.45',currency:'VND',details:{},workOrder:{id:30,orderNumber:'ORDER-30'}}]}));
    await page.route('**/partner-transaction-costs?*',route=>{
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(route.request().method()==='POST') {payload=route.request().postDataJSON();costs=[{...payload,id:'saved',partner:{name:'Logistics Partner'},serviceType:service,workOrder:{orderNumber:'ORDER-30'},createdByEmployee:{name:'Operator'}}];return route.fulfill({headers,json:costs[0]});}
      return route.fulfill({headers,json:costs});
    });
    await page.goto(`http://127.0.0.1:${port}/partner-cost-acceptance.html${scenario==='unified'?'?unified=1':''}`);
    if(scenario==='unified') {
      await page.getByRole('cell',{name:'Historical process',exact:true}).waitFor();
      await page.getByRole('button',{name:'외주 이용 신청',exact:true}).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByRole('combobox').nth(0).click();await page.getByRole('option',{name:'QQ Process Only',exact:true}).click();
      await dialog.getByRole('combobox').nth(1).click();await page.getByRole('option').first().click();
      assert.equal(await dialog.getByLabel('금액',{exact:false}).count(),0);
      await dialog.getByRole('button',{name:'공정·작업 수량 입력',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.partner),'12');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.service),'5');
      assert.deepEqual(errors,[]); await page.close(); continue;
    }
    const labels=lang==='ko'?{add:'거래 비용 등록',date:'거래일',description:'거래 내용',amount:'금액',transport:'운송일',origin:'출발지',destination:'도착지',save:'등록'}:lang==='en'?{add:'Add transaction cost',date:'Transaction date',description:'Description',amount:'Amount',transport:'Transport date',origin:'Origin',destination:'Destination',save:'Add'}:{add:'Thêm chi phí giao dịch',date:'Ngày giao dịch',description:'Nội dung giao dịch',amount:'Số tiền',transport:'Ngày vận chuyển',origin:'Nơi đi',destination:'Nơi đến',save:'Thêm'};
    await page.getByRole('button',{name:labels.add,exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox').nth(0).click();
    assert.equal(await page.getByRole('option',{name:'QQ Process Only'}).count(),0);
    await page.getByRole('option',{name:'Logistics Partner',exact:true}).click();
    await dialog.getByRole('combobox').nth(1).click(); await page.getByRole('option').first().click();
    await dialog.getByLabel(labels.date,{exact:false}).fill('2026-10-10');
    await dialog.getByLabel(labels.description,{exact:false}).fill('Delivery to port');
    await dialog.getByLabel(labels.amount,{exact:false}).fill('250000');
    await dialog.getByLabel(labels.transport,{exact:false}).fill('2026-10-10');
    await dialog.getByLabel(labels.origin,{exact:false}).fill('Factory');
    assert.equal(await dialog.getByRole('button',{name:labels.save,exact:true}).isEnabled(),false);
    await dialog.getByLabel(labels.destination,{exact:false}).fill('Port');
    await dialog.getByRole('combobox').last().click(); await page.getByRole('option',{name:'ORDER-30'}).click();
    await dialog.getByRole('button',{name:labels.save,exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.getByRole('cell',{name:'Delivery to port',exact:false}).waitFor();
    assert.equal(payload.workOrderId,30); assert.equal(payload.partnerOrgId,11); assert.equal(payload.serviceTypeId,4);
    assert.equal(payload.details.destination,'Port'); assert.ok(payload.clientKey); assert.ok(!('createdByEmployeeId' in payload));
    assert.deepEqual(errors,[]); await page.close();
  }
  console.log('Transaction cost browser acceptance passed: ko/en/vi, logistics required fields, process exclusion, FK payload and list refresh.');
} finally {if(browser)await browser.close();vite.kill();unlinkSync(fixture);}
