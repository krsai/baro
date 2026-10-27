import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/invoice-editor-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {MemoryRouter} from 'react-router-dom';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Editor from '/src/pages/App/invoice/InvoiceEditor.jsx';import List from '/src/pages/App/invoice/InvoiceList.jsx';import Workspace from '/src/pages/App/invoice/InvoiceWorkspace.jsx';
const mode=new URLSearchParams(location.search).get('mode');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),mode==='workspace'?React.createElement(Workspace,{view:'editor'}):mode==='list'?React.createElement(List,{orgId:1,languageCode:window.testLang}):React.createElement(Editor,{orgId:1,buyerOrgId:2,orderIds:['o1'],languageCode:window.testLang,onClose:()=>window.closedEditor=true,onIssued:()=>window.issuedEditor=true}))));</script></body></html>`);
const party=name=>({name,address:'',country:'VN',taxId:'',email:'',phone:''});
const source={orderId:'o1',orderNumber:'PO-1',sourceUpdatedAt:'2026-10-20',sellerOrgId:1,buyerOrgId:2,seller:party('BARO'),buyer:party('Customer'),ready:true,currencies:['USD'],
 styles:[{styleId:10,code:'S1',name:'Shirt',orderedQuantity:10,producedQuantity:10,ready:true,prices:[{pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',entries:[{quantity:1,unitPrice:'2',priceId:4}],versionId:3}]}],
 lines:[{key:'item1:S',itemId:1,styleId:10,styleCode:'S1',description:'Shirt',orderedQuantity:10,quantity:'10',adjustmentReason:'',remark:'',hsCode:'',origin:'',color:'Blue',size:'S'}]};
source.lines.push({...source.lines[0],key:'item1:M',size:'M',orderedQuantity:5,quantity:'5'});source.styles[0].orderedQuantity=15;source.styles[0].producedQuantity=15;
const port=43221,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/invoice-editor-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const [lang,failure] of [['ko','none'],['en','none'],['vi','none'],['en','issue'],['en','save']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saves=[],issues=[],reads=[];let failed=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/invoices/**',r=>{
   const request=r.request(),url=new URL(request.url());if(request.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname.includes('order-source')){reads.push(url.pathname);return r.fulfill({headers,json:source});}
   if(request.method()==='POST'&&url.pathname.endsWith('/drafts')){
    saves.push(request.postDataJSON());if(failure==='save'&&!failed){failed=true;return r.abort();}return r.fulfill({headers,json:{id:'pending-1',revision:1,clientKey:saves[0].clientKey}});
   }
   if(request.method()==='POST'&&url.pathname.endsWith('/issue')){
    issues.push({path:url.pathname,body:request.postDataJSON()});if(failure==='issue'&&!failed){failed=true;return r.abort();}return r.fulfill({headers,json:{id:'issued-1'}});
   }
   throw Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html`);
  const review=page.getByRole('checkbox');await review.waitFor();
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/초안|draft|bản nháp/i);
  const issue=page.getByRole('button',{name:lang==='ko'?'발행':lang==='vi'?'Phát hành':'Issue',exact:true});assert.equal(await issue.isDisabled(),true);
  const grid=page.locator('fieldset table').first();
  assert.equal(await grid.locator('tbody tr').count(),1);assert.equal(await grid.getByRole('columnheader',{name:'S',exact:true}).count(),1);assert.equal(await grid.getByRole('columnheader',{name:'M',exact:true}).count(),1);
  assert.match(await grid.innerText(),/USD 2.00/);assert.match(await grid.innerText(),/Shirt/);assert.doesNotMatch(await grid.innerText(),/HS \/ Origin/);
  assert.equal(await page.getByRole('textbox',{name:'HS code',exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'Origin',exact:true}).count(),0);
  await page.locator('input[aria-label*="item1:S"]').fill('9');
  await page.locator('textarea[aria-label^="Remark "]').fill('One missing piece');
  await review.check();assert.equal(await issue.isEnabled(),true);
  await page.getByLabel('REMARK',{exact:true}).fill('Reviewed note');assert.equal(await review.isChecked(),false);
  await review.check();
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await issue.click();
  if(failure!=='none'){
   await page.getByRole('alert').filter({hasText:'could not be confirmed'}).waitFor();assert.equal(await page.getByLabel('REMARK',{exact:true}).isDisabled(),true);await issue.click();
  }
  await page.waitForFunction(()=>window.issuedEditor===true);
  assert.equal(saves.length,failure==='save'?2:1);assert.equal(issues.length,failure==='issue'?2:1);
  assert.equal(new Set(saves.map(s=>s.clientKey)).size,1);assert.ok(issues.every(i=>i.path==='/invoices/drafts/pending-1/issue'));
  assert.equal(saves[0].buyerOrgId,2);assert.equal(saves[0].lines[0].quantity,'9');assert.equal(saves[0].lines[1].quantity,'5');assert.ok(saves[0].lines.every(line=>line.remark==='One missing piece'&&line.adjustmentReason==='One missing piece'));assert.equal(saves[0].fields.notes,'Reviewed note');assert.doesNotMatch(saves[0].fields.number,/DRAFT/);
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],queries=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:path=>window.navigation=path,markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/invoices/**',r=>{
   const url=new URL(r.request().url());assert.equal(url.pathname,'/invoices/issued','List must not load drafts');queries.push(Object.fromEntries(url.searchParams));
   return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{hasMore:true,rows:[{id:'i1',invoiceNumber:'INV-001',status:'ISSUED',buyerName:'Customer',currencyCode:'USD',total:'20',receivableAdded:'20',receivedAmount:'0',familyBalanceAmount:'20',familyBalanceKind:'DUE',isCurrentRevision:true,issuedAt:'2026-10-21',orders:[{sourceOrderNumber:'PO-1',installmentNumber:1}]}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html?mode=list`);
  try{await page.getByText('INV-001',{exact:true}).waitFor({timeout:8000});}catch(e){throw new Error(JSON.stringify({errors,queries,body:await page.locator('body').innerText()}));}
  assert.doesNotMatch(await page.locator('body').innerText(),/초안|draft|bản nháp/i);
  assert.equal(await page.locator('tbody button').count(),2,'Rows expose PDF and one action menu');
  const assertSeparateCards=async()=>{
   const layout=await page.locator('[data-search-panel]').evaluate(search=>{
    const results=document.querySelector('[data-search-results]');
    return {siblings:search.parentElement===results.parentElement,
     nested:results.contains(search),gap:results.getBoundingClientRect().top-search.getBoundingClientRect().bottom,
     border:getComputedStyle(search).borderTopWidth,radius:parseFloat(getComputedStyle(search).borderTopLeftRadius)};
   });
   assert.equal(layout.siblings,true);assert.equal(layout.nested,false);
   assert.ok(layout.gap>=20,'Search and results have a visible section gap');
   assert.equal(layout.border,'1px');assert.ok(layout.radius>0,'Search keeps its own rounded card');
  };
  await assertSeparateCards();
  await page.getByRole('button',{name:lang==='ko'?'작업':lang==='vi'?'Thao tác':'Actions',exact:true}).click();
  await page.getByRole('menuitem',{name:lang==='ko'?'개정':lang==='vi'?'Sửa đổi':'Revise',exact:true}).waitFor();
  assert.equal(await page.getByRole('menuitem').count(),6);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:lang==='ko'?'다음':lang==='vi'?'Tiếp':'Next',exact:true}).click();await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('INV-001'));
  await page.getByPlaceholder(lang==='ko'?'청구번호·고객·주문 검색':lang==='vi'?'Tìm số hóa đơn, khách hàng hoặc đơn hàng':'Search invoice, customer or order').fill('PO-1');
  await page.waitForResponse(r=>r.url().includes('search=PO-1'));
  assert.ok(queries.some(q=>q.search==='PO-1'&&q.page==='0'));
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await assertSeparateCards();}
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let allowDiscard=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>allowDiscard?d.accept():d.dismiss());
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/invoices/**',r=>{
   const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*'};
   if(url.pathname.endsWith('/customers'))return r.fulfill({headers,json:{rows:[{id:2,name:'Customer'}]}});
   if(url.pathname.endsWith('/orders'))return r.fulfill({headers,json:{rows:[{orderId:'o1',orderNumber:'PO-1',totalQuantity:10,progressPercent:100},{orderId:'o2',orderNumber:'PO-2',totalQuantity:10,progressPercent:100}],hasMore:false}});
   assert.ok(url.pathname.includes('/order-source/'));assert.equal(url.searchParams.get('buyerOrgId'),'2');
   const second=url.pathname.endsWith('/o2');return r.fulfill({headers,json:{...source,orderId:second?'o2':'o1',orderNumber:second?'PO-2':'PO-1'}});
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html?mode=workspace`);
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('table').count(),0);
  await page.getByRole('combobox').nth(0).click();await page.getByRole('option',{name:'Customer',exact:true}).click();
  const orders=page.getByRole('combobox').nth(1);await orders.click();await page.getByRole('option',{name:/PO-1/}).waitFor();await orders.press('ArrowDown');await orders.press('Enter');await page.keyboard.press('Escape');
  await page.getByLabel('REMARK',{exact:true}).waitFor();await page.getByLabel('REMARK',{exact:true}).fill('Keep this input');
  await orders.click();await page.getByRole('option',{name:/PO-2/}).click();await page.keyboard.press('Escape');
  assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Keep this input','Rejected selection change must preserve entered lines');
  allowDiscard=true;await orders.click();await page.getByRole('option',{name:/PO-2/}).click();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelectorAll('fieldset table').length>0&&[...document.querySelectorAll('fieldset table:first-of-type tbody tr')].some(row=>row.textContent.includes('PO-2')));
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.getByRole('button',{name:lang==='ko'?'청구 내역 입력':lang==='vi'?'Nhập chi tiết hóa đơn':'Enter invoice details',exact:true}).count(),0);
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Invoice editor passed ko/en/vi: compact customer/multi-order selection on the same form, discard protection, responsive layout, direct issue and retry recovery.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
