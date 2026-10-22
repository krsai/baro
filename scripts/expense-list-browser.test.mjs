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
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Costs,{onNewRequest:()=>document.documentElement.dataset.new='true',onOpenRequest:(kind,id)=>document.documentElement.dataset.destination=kind+':'+id}))));</script></body></html>`);
const port=43203,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-list-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']) {
    const text=EXPENSE_LIST_TEXT[lang],doc=EXPENSE_REQUEST_TEXT[lang],errors=[],page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(/Encountered two children with the same key/.test(message.text()))errors.push(message.text());});
    await page.clock.install({time:new Date('2026-10-17T12:00:00+07:00')});
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/ManagementPeriodContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false,factories:[]});'}));
    const headers={'Access-Control-Allow-Origin':'*'},service={id:4,nameKo:'물류',nameEn:'Logistics',nameVi:'Vận chuyển'};
    const rows=[
      {id:'old',sourceKind:'HISTORICAL_WORK_RECORD',partnerOrgId:11,partner:{id:11,name:'Old Vendor'},workLogId:77,outsourcedWorkRecordId:78,transactionDate:'2026-09-20',description:'Legacy work',style:{id:40,name:'Legacy shirt',code:'OLD-40'},styleProcess:{id:50,processName:'Buttonhole'},createdByEmployee:{name:'Former Worker'},quantity:3,unitPrice:'1.2345',amount:'3.7035',currency:'VND'},
      {id:'cost',sourceKind:'COST_REQUEST',partnerOrgId:12,partner:{id:12,name:'New Vendor'},serviceTypeId:5,serviceType:{...service,id:5,nameKo:'봉제',nameEn:'Sewing',nameVi:'May'},transactionDate:'2026-10-17',description:'Transport cost',transactionCode:{code:'TRKV',base:{expenseType:{id:7,nameKo:'물류 서비스',nameEn:'Logistics service',nameVi:'Dịch vụ vận chuyển'}}},quantity:'2',unitPrice:'100',amount:'200',currency:'VND'},
      {id:'document-item',sourceKind:'COST_REQUEST',expenseRequestId:1,expenseRequest:{id:1,remark:'Delivery note'},partnerOrgId:12,partner:{id:12,name:'New Vendor'},serviceTypeId:4,serviceType:service,transactionDate:'2026-10-17',description:'Document cost',style:{id:42,name:'New shirt',code:'NEW-42'},transactionCode:{code:'TRKV',base:{expenseType:{id:7,nameKo:'물류 서비스',nameEn:'Logistics service',nameVi:'Dịch vụ vận chuyển'}}},quantity:'1',unitPrice:'10.25',amount:'10.25',subtotal:'10.25',vatRate:'0',vatAmount:'0',currency:'USD'},
    ];
    await page.route('**/outsourcing-requests?*',route=>route.fulfill({headers,json:rows}));
    await page.route('**/expense-requests?*',route=>route.fulfill({headers,json:[{id:1,partnerOrgId:12,partner:{id:12,name:'New Vendor'},title:'Document title',remark:'Delivery note',requestDate:'2026-10-17',createdByEmployee:{name:'Applicant'},currency:null,subtotal:null,vatAmount:null,amount:null,currencyTotals:[{currency:'USD',subtotal:'10.25',vatAmount:'0',amount:'10.25'},{currency:'VND',subtotal:'200',vatAmount:'0',amount:'200'}],items:[rows[2],rows[1]]}]}));
    await page.goto(`http://127.0.0.1:${port}/expense-list-acceptance.html`);
    await page.locator('[data-expense-row="cost"]').waitFor();assert.equal(await page.locator('tbody tr').count(),2);
    assert.equal(await page.locator('.cc-kicker').count(),0);
    assert.equal(await page.locator('.cc-primary.MuiButton-containedPrimary').count(),1);
    assert.notEqual(await page.locator('.cc-primary').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('.cc-results > .cc-results-summary').count(),1);
    assert.equal(await page.locator('.cc-results-summary .cc-total-amount').count(),1);
    assert.equal(await page.locator('.cc-grid-tools').count(),0);
    assert.equal(await page.getByRole('checkbox',{name:text.dense,exact:true}).count(),0);
    assert.equal(await page.locator('.cc-table-scroll.is-dense').count(),1);
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'20px');
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontWeight),'600');
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(52, 64, 84)');
    const dates=()=>page.locator('[data-search-controls] input').evaluateAll(els=>els.map(el=>el.value));
    const left=page.locator('[data-search-controls] [data-testid="ChevronLeftIcon"]').locator('..');
    const right=page.locator('[data-search-controls] [data-testid="ChevronRightIcon"]').locator('..');
    const resetToAll=async()=>{await page.getByRole('button',{name:text.reset,exact:true}).click();await left.click();};
    assert.deepEqual(await dates(),['2026-10-01','2026-10-31']);
    await left.click();assert.deepEqual(await dates(),['2026-09-01','2026-10-31']);
    await page.getByRole('button',{name:'M+',exact:true}).click();assert.deepEqual(await dates(),['2026-11-01','2026-11-30']);
    await left.click();assert.deepEqual(await dates(),['2026-10-01','2026-11-30']);
    await page.getByRole('button',{name:'M-',exact:true}).click();assert.deepEqual(await dates(),['2026-09-01','2026-09-30']);
    await right.click();assert.deepEqual(await dates(),['2026-09-01','2026-10-31']);
    await page.getByRole('button',{name:text.reset,exact:true}).click();assert.deepEqual(await dates(),['2026-10-01','2026-10-31']);
    for(let i=0;i<6;i++) await page.getByRole('button',{name:'M-',exact:true}).click();
    assert.deepEqual(await dates(),['2026-04-01','2026-04-30']);
    assert.equal(await page.getByRole('button',{name:'M-',exact:true}).isDisabled(),true);
    assert.equal(await left.isDisabled(),true);
    await page.getByRole('button',{name:text.reset,exact:true}).click();
    await left.click();assert.equal(await page.locator('tbody tr').count(),3);
    const headings=await page.locator('thead th').allTextContents();
    assert.equal(headings.length,13);
    assert.doesNotMatch(await page.locator('tbody').innerText(),/Legacy work|Transport cost|Document cost|Document title/);
    assert.equal(await page.locator('[data-expense-row="document-item"] td').nth(7).textContent(),'Delivery note');
    assert.equal(await page.locator('[data-expense-row="cost"] td').nth(3).textContent(),{ko:'물류 서비스',en:'Logistics service',vi:'Dịch vụ vận chuyển'}[lang]);
    assert.equal(await page.locator('[data-expense-row="old"] td').nth(3).textContent(),text.unclassified);
    assert.equal(headings.includes(text.style),false);
    assert.equal(await page.locator('tbody .cc-code').count(),0);
    assert.equal(headings[3],text.category);assert.equal(headings[4],text.industry);assert.equal(headings[6],text.order);assert.equal(headings[7],text.remark);
    assert.equal(await page.locator('[data-search-filters] select').nth(0).locator('option').first().textContent(),text.allIndustries);
    assert.equal(await page.locator('[data-search-filters] select').nth(1).locator('option').first().textContent(),text.allPartners);
    const historicalRow=page.locator('[data-expense-row="old"]');
    await historicalRow.locator('td').nth(2).dblclick();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.destination),'legacy:78');
    assert.equal(await page.getByRole('dialog').count(),0);
    await page.evaluate(()=>delete document.documentElement.dataset.destination);
    await page.locator('[data-expense-row="old"] button[aria-label]').dblclick();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.destination),'legacy:78');
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.locator('.cc-total-amount strong').count(),2);
    assert.deepEqual(await page.locator('[data-search-controls] .MuiPickersInputBase-root').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height)),[36,36]);
    assert.equal((await page.getByRole('button',{name:'M+',exact:true}).boundingBox()).height,17);
    assert.equal(await page.getByRole('button',{name:'M+',exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'11px');
    for(const selector of ['.cc-primary','[data-search-panel] input[type="text"]','[data-search-filters] select','tbody td']) {
      assert.equal(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontSize),'13px',selector+' uses global text size');
    }
    assert.equal((await page.locator('[data-search-controls] [data-testid="ChevronLeftIcon"]').boundingBox()).width,16);
    // Exercise the real HTML table's token bridge, not just an isolated MUI preview.
    assert.equal(await page.locator('th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(248, 250, 252)');
    assert.equal(await page.locator('tbody .MuiChip-root').count(),3);
    await page.evaluate(()=>document.documentElement.style.setProperty('--color-background-dark','#f1f2f3'));
    assert.equal(await page.locator('th').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(241, 242, 243)');
    await page.evaluate(()=>document.documentElement.style.removeProperty('--color-background-dark'));
    await page.getByRole('textbox',{name:text.search}).fill('OLD-40');assert.equal(await page.locator('tbody tr').count(),1);
    await page.locator('[data-expense-row="old"] button[aria-label]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.destination),'legacy:78');
    await resetToAll();
    await page.getByRole('checkbox',{name:text.selectAll,exact:true}).check();assert.equal(await page.locator('tbody tr.is-selected').count(),3);
    await page.getByRole('tab',{name:text.partnerSummary,exact:true}).click();assert.equal(await page.locator('tbody tr').count(),3);
    await page.getByRole('tab',{name:text.industrySummary,exact:true}).click();assert.equal(await page.locator('tbody tr').count(),3);
    await page.getByRole('tab',{name:text.detail,exact:true}).click();
    await page.locator('[data-search-filters] select').nth(1).selectOption('12');assert.equal(await page.locator('tbody tr').count(),2);
    await page.locator('[data-search-filters] select').nth(3).selectOption('USD');assert.equal(await page.locator('tbody tr').count(),1);
    await page.locator('[data-expense-row="document-item"] button[aria-label]').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.destination),'request:1');
    await resetToAll();
    await page.locator('[data-search-filters] select').nth(2).selectOption('historical');assert.equal(await page.locator('tbody tr').count(),1);
    await resetToAll();
    await page.getByRole('tab',{name:text.documents,exact:true}).click();
    assert.equal(await page.locator('tbody tr').first().locator('td').nth(3).textContent(),{ko:'물류 외 1개',en:'Logistics and 1 more',vi:'Vận chuyển và 1 mục khác'}[lang]);
    assert.equal(await page.locator('tbody tr').first().locator('td').nth(3).locator('span').getAttribute('title'),{ko:'물류, 봉제',en:'Logistics, Sewing',vi:'Vận chuyển, May'}[lang]);
    await page.getByRole('textbox',{name:text.search}).fill('NEW-42');
    assert.equal(await page.locator('.cc-total-amount strong').count(),2);
    await page.locator('[data-search-filters] select').nth(3).selectOption('USD');
    assert.equal(await page.locator('.cc-total-amount strong').count(),1);
    assert.equal(await page.getByText(/^EXP-/).count(),0);await page.locator('.cc-table-scroll tbody button[aria-label]').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.destination),'request:1');
    await resetToAll();await page.getByRole('tab',{name:text.detail,exact:true}).click();
    // Repeated view changes must replace headers, including Korean document
    // columns whose translated labels are identical. Verify actual geometry.
    for(let cycle=0;cycle<4;cycle++) {
      for(const [name,count] of [[text.documents,9],[text.detail,13],[text.partnerSummary,5],[text.industrySummary,5],[text.detail,13]]) {
        await page.getByRole('tab',{name,exact:true}).click();
        assert.equal(await page.locator('thead th').count(),count,`${lang} ${name} cycle ${cycle}: no leftover headers`);
        const geometry=await page.locator('.cc-table-scroll table').evaluate(table=>{
          const alignment=cell=>{
            const style=getComputedStyle(cell);
            return [style.paddingLeft,style.paddingRight,style.paddingTop,style.paddingBottom,style.textAlign.replace('start','left')].join(':');
          };
          const headers=Array.from(table.tHead.rows[0].cells,cell=>({x:cell.getBoundingClientRect().x,width:cell.getBoundingClientRect().width,alignment:alignment(cell)}));
          return Array.from(table.tBodies[0].rows).filter(row=>row.cells.length>1).map(row=>Array.from(row.cells,(cell,index)=>{
            const box=cell.getBoundingClientRect();return Math.abs(box.x-headers[index].x)<1 && Math.abs(box.width-headers[index].width)<1 && alignment(cell)===headers[index].alignment;
          }).every(Boolean));
        });
        assert.ok(geometry.length && geometry.every(Boolean),`${lang} ${name}: header/body columns align`);
      }
      await page.locator('.compact-costs').evaluate(async element=>{
        element.style.display='none';await new Promise(requestAnimationFrame);
        element.style.removeProperty('display');await new Promise(requestAnimationFrame);
      });
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Live expense UI passed: ko/en/vi, historical search, FK filters, separate currency totals, grouping, selection, real record/document details and mobile layout.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
