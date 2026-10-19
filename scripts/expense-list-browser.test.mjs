import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync,writeFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { EXPENSE_LIST_TEXT } from '../frontend/src/constants/expenseList.js';
import { EXPENSE_REQUEST_TEXT } from '../frontend/src/constants/expenseRequest.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Chrome required');
const fixture=path.resolve('frontend/expense-list-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {CssBaseline} from '@mui/material';import {ThemeProvider} from '@mui/material/styles';import theme from '/src/theme';import Costs from '/src/pages/App/PartnerTransactionCosts.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Costs,{onNewRequest:()=>document.documentElement.dataset.new='true',onOpenHistorical:id=>document.documentElement.dataset.history=String(id)}))));</script></body></html>`);
const port=43203,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-list-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']) {
    const text=EXPENSE_LIST_TEXT[lang],doc=EXPENSE_REQUEST_TEXT[lang],errors=[],page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-10-17T12:00:00+07:00')});
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/ManagementPeriodContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false,factories:[]});'}));
    const headers={'Access-Control-Allow-Origin':'*'},service={id:4,nameKo:'물류',nameEn:'Logistics',nameVi:'Vận chuyển'};
    const rows=[
      {id:'old',sourceKind:'HISTORICAL_WORK_RECORD',partnerOrgId:11,partner:{id:11,name:'Old Vendor'},workLogId:77,transactionDate:'2026-09-20',description:'Legacy work',style:{id:40,name:'Legacy shirt',code:'OLD-40'},styleProcess:{id:50,processName:'Buttonhole'},createdByEmployee:{name:'Former Worker'},quantity:3,unitPrice:'1.2345',amount:'3.7035',currency:'VND'},
      {id:'cost',sourceKind:'COST_REQUEST',partnerOrgId:12,partner:{id:12,name:'New Vendor'},serviceTypeId:4,serviceType:service,transactionDate:'2026-10-17',description:'Transport cost',transactionCode:{code:'TRKV'},quantity:'2',unitPrice:'100',amount:'200',currency:'VND'},
      {id:'document-item',sourceKind:'COST_REQUEST',expenseRequestId:1,partnerOrgId:12,partner:{id:12,name:'New Vendor'},serviceTypeId:4,serviceType:service,transactionDate:'2026-10-17',description:'Document cost',style:{id:42,name:'New shirt',code:'NEW-42'},transactionCode:{code:'TRKV'},quantity:'1',unitPrice:'10.25',amount:'10.25',subtotal:'10.25',vatRate:'0',vatAmount:'0',currency:'USD'},
    ];
    await page.route('**/outsourcing-requests?*',route=>route.fulfill({headers,json:rows}));
    await page.route('**/expense-requests?*',route=>route.fulfill({headers,json:[{id:1,partnerOrgId:12,partner:{id:12,name:'New Vendor'},title:'Document title',requestDate:'2026-10-17',createdByEmployee:{name:'Applicant'},currency:null,subtotal:null,vatAmount:null,amount:null,currencyTotals:[{currency:'USD',subtotal:'10.25',vatAmount:'0',amount:'10.25'},{currency:'VND',subtotal:'200',vatAmount:'0',amount:'200'}],items:[rows[2],rows[1]]}]}));
    await page.goto(`http://127.0.0.1:${port}/expense-list-acceptance.html`);
    await page.getByRole('button',{name:'Legacy work',exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),3);
    assert.equal(await page.locator('.cc-total-amount strong').count(),2);
    assert.deepEqual(await page.locator('.cc-dates .MuiPickersInputBase-root').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height)),[36,36]);
    assert.equal((await page.getByRole('button',{name:'M+',exact:true}).boundingBox()).height,17);
    // Exercise the real HTML table's token bridge, not just an isolated MUI preview.
    assert.equal(await page.locator('th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(248, 250, 252)');
    assert.equal(await page.locator('tbody .MuiChip-root').count(),3);
    await page.evaluate(()=>document.documentElement.style.setProperty('--color-background-dark','#f1f2f3'));
    assert.equal(await page.locator('th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(241, 242, 243)');
    await page.evaluate(()=>document.documentElement.style.removeProperty('--color-background-dark'));
    await page.getByRole('textbox',{name:text.search}).fill('OLD-40');assert.equal(await page.locator('tbody tr').count(),1);
    await page.getByRole('button',{name:'Legacy work',exact:true}).click();await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:text.historical,exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.history),'77');
    await page.getByRole('button',{name:`↺ ${text.reset}`,exact:true}).click();
    await page.getByRole('checkbox',{name:text.selectAll,exact:true}).check();assert.equal(await page.locator('tbody tr.is-selected').count(),3);
    await page.getByRole('tab',{name:text.partnerSummary,exact:true}).click();assert.equal(await page.locator('tbody tr').count(),3);
    await page.getByRole('tab',{name:text.industrySummary,exact:true}).click();assert.equal(await page.locator('tbody tr').count(),3);
    await page.getByRole('tab',{name:text.detail,exact:true}).click();
    await page.locator('.cc-filter-grid select').nth(0).selectOption('12');assert.equal(await page.locator('tbody tr').count(),2);
    await page.locator('.cc-filter-grid select').nth(3).selectOption('USD');assert.equal(await page.locator('tbody tr').count(),1);
    await page.getByRole('button',{name:'Document cost',exact:true}).click();await page.getByRole('dialog').getByText('Document title',{exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:doc.close,exact:true}).click();
    await page.getByRole('button',{name:`↺ ${text.reset}`,exact:true}).click();
    await page.locator('.cc-filter-grid select').nth(2).selectOption('historical');assert.equal(await page.locator('tbody tr').count(),1);
    await page.getByRole('button',{name:`↺ ${text.reset}`,exact:true}).click();
    await page.getByRole('tab',{name:text.documents,exact:true}).click();await page.getByRole('textbox',{name:text.search}).fill('NEW-42');
    assert.equal(await page.locator('.cc-total-amount strong').count(),2);
    await page.locator('.cc-filter-grid select').nth(3).selectOption('USD');
    assert.equal(await page.locator('.cc-total-amount strong').count(),1);
    await page.getByRole('button',{name:'EXP-000001',exact:true}).click();await page.getByRole('dialog').getByText('Document title',{exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:doc.close,exact:true}).click();
    await page.getByRole('button',{name:`↺ ${text.reset}`,exact:true}).click();await page.getByRole('tab',{name:text.detail,exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Live expense UI passed: ko/en/vi, historical search, FK filters, separate currency totals, grouping, selection, real record/document details and mobile layout.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
