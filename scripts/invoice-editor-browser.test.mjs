import {documentNumberText} from '../frontend/src/constants/documentNumber.js';
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
 for(const [lang,failure] of [['ko','layout'],['ko','none'],['en','none'],['vi','none'],['en','issue'],['en','save'],['ko','advance'],['en','advance'],['vi','advance']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saves=[],issues=[],reads=[];let failed=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/invoices/**',r=>{
   const request=r.request(),url=new URL(request.url());if(request.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname.includes('order-source')){reads.push(url.pathname);const incomplete={...source,ready:false,styles:source.styles.map(style=>({...style,ready:false,producedQuantity:5,assignments:[{externalId:'review-plan',completed:false,producedQuantity:5,plannedQuantity:15,factoryName:'HANOI'}]}))};return r.fulfill({headers,json:failure==='layout'?{...incomplete,lines:['L','M','FREE','S','XL','2XL','XS','3XL','4XL'].map(size=>({...source.lines[0],key:`item1:${size}`,size,gender:'M'}))}:failure==='advance'?incomplete:source});}
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
  const numberInput=page.getByLabel(documentNumberText[lang].invoice,{exact:true});assert.equal(await numberInput.inputValue(),'');if(failure==='save')await numberInput.fill('CUSTOM-2026-A');
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/초안|draft|bản nháp/i);
  const issue=page.getByRole('button',{name:lang==='ko'?'발행':lang==='vi'?'Phát hành':'Issue',exact:true});assert.equal(await issue.isDisabled(),true);
  const grid=page.locator('fieldset table').first();
  assert.equal(await grid.getByRole('columnheader',{name:lang==='ko'?'성별':lang==='vi'?'Giới tính':'Gender',exact:true}).count(),1);
  assert.deepEqual((await grid.locator('thead th').allTextContents()).slice(0,6),failure==='layout'?['주문','스타일명','색상','성별','XS','S']:lang==='ko'?['주문','스타일명','색상','성별','S','M']:lang==='vi'?['Đơn hàng','Tên mẫu','Màu sắc','Giới tính','S','M']:['Order','Style name','Color','Gender','S','M']);
  assert.equal(await grid.locator('tbody td').first().evaluate(cell=>getComputedStyle(cell).whiteSpace),'nowrap');
  assert.equal(await grid.locator('thead th').first().evaluate(cell=>getComputedStyle(cell).position),'sticky');
  if(failure==='layout'){
   assert.equal(await grid.locator('tr[data-production-review="true"]').count(),1);
   assert.match(await grid.locator('tbody tr').innerText(),/HANOI.*생산 미완료/);
   let quantityReads=0;
   await page.route('**/assignment-plans/review-plan/quantity-review*',r=>{assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'1');quantityReads++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{plannedQuantity:15,producedQuantity:5,processTotals:[],workRecords:[]}});});
   await grid.getByRole('button',{name:'수량 확인',exact:true}).click();
   await page.getByText('작업기록 합계',{exact:true}).waitFor();assert.equal(quantityReads,1);
   await page.keyboard.press('Escape');await page.getByText('작업기록 합계',{exact:true}).waitFor({state:'hidden'});
   assert.deepEqual((await grid.locator('thead th').allTextContents()).slice(4,13),['XS','S','M','L','XL','2XL','3XL','4XL','FREE']);
   for(const width of [1920,1720,1366,768,390]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const dimensions=await grid.locator('input[inputmode="numeric"]').first().evaluate(input=>({input:input.getBoundingClientRect().width,cell:input.closest('td').getBoundingClientRect().width}));
    assert.ok(dimensions.input<=dimensions.cell&&dimensions.cell>=59&&dimensions.cell<=90,JSON.stringify(dimensions));

   }
   assert.deepEqual(errors,[]);await page.close();continue;
  }
  assert.equal(await grid.locator('tbody tr').count(),1);assert.equal(await grid.getByRole('columnheader',{name:'S',exact:true}).count(),1);assert.equal(await grid.getByRole('columnheader',{name:'M',exact:true}).count(),1);
  assert.match(await grid.innerText(),/USD/);assert.equal(await grid.locator('input[inputmode="decimal"]').inputValue(),'2');await grid.locator('input[inputmode="decimal"]').fill('2.3456');assert.match(await grid.innerText(),/Shirt/);assert.doesNotMatch(await grid.innerText(),/HS \/ Origin/);
  assert.equal(await page.getByRole('textbox',{name:'HS code',exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'Origin',exact:true}).count(),0);
  await page.locator('input[aria-label*="item1:S"]:not([inputmode="decimal"])').fill('9');
  await page.locator('textarea[aria-label^="Remark "]').fill('One missing piece');
  if(failure==='advance'){await page.locator('.MuiAccordionSummary-root').click();await page.locator('input[inputmode="decimal"][aria-label$=" PO-1"]').fill('30');await page.locator('.MuiAccordionSummary-root').click();}
  await review.check();assert.equal(await issue.isEnabled(),true);
  await page.getByLabel('REMARK',{exact:true}).fill('Reviewed note');assert.equal(await review.isChecked(),false);
  await review.check();
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await issue.click();
  if(['issue','save'].includes(failure)){
   await page.getByRole('alert').filter({hasText:'could not be confirmed'}).waitFor();assert.equal(await page.getByLabel('REMARK',{exact:true}).isDisabled(),true);await issue.click();
  }
  await page.waitForFunction(()=>window.issuedEditor===true);
  assert.equal(saves.length,failure==='save'?2:1);assert.equal(issues.length,failure==='issue'?2:1);
  assert.equal(new Set(saves.map(s=>s.clientKey)).size,1);assert.ok(issues.every(i=>i.path==='/invoices/drafts/pending-1/issue'));
  if(failure==='advance')assert.equal(saves[0].percentages.o1,'30');
  assert.ok(saves[0].lines.every(line=>line.unitPriceOverride==='2.3456'));assert.equal(saves[0].buyerOrgId,2);assert.equal(saves[0].lines[0].quantity,'9');assert.equal(saves[0].lines[1].quantity,'5');assert.ok(saves[0].lines.every(line=>line.remark==='One missing piece'&&line.adjustmentReason==='One missing piece'));assert.equal(saves[0].fields.notes,'Reviewed note');assert.equal(saves[0].fields.number,failure==='save'?'CUSTOM-2026-A':'');
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
  assert.equal(await page.locator('tbody button').count(),1,'Rows expose only PDF');
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
  await page.locator('tbody tr').first().dblclick();assert.equal(await page.evaluate(()=>window.navigation),'/invoices/i1');
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
  const orders=page.getByRole('button',{name:/^(청구 대상 주문|Orders to invoice|Đơn hàng cần lập hóa đơn)/});
  const apply=()=>page.getByRole('button',{name:lang==='ko'?'선택 적용':lang==='vi'?'Áp dụng':'Apply selection',exact:true}).click();
  await orders.click();await page.getByRole('dialog').getByRole('button',{name:/PO-1/}).click();await apply();
  await page.getByLabel('REMARK',{exact:true}).waitFor();await page.getByLabel('REMARK',{exact:true}).fill('Keep this input');
  await orders.click();await page.getByRole('dialog').getByRole('button',{name:/PO-2/}).click();await apply();
  assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Keep this input','Rejected selection change must preserve entered lines');
  allowDiscard=true;await apply();
  await page.waitForFunction(()=>document.querySelectorAll('fieldset table').length>0&&[...document.querySelectorAll('fieldset table:first-of-type tbody tr')].some(row=>row.textContent.includes('PO-2')));
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.getByRole('button',{name:lang==='ko'?'청구 내역 입력':lang==='vi'?'Nhập chi tiết hóa đơn':'Enter invoice details',exact:true}).count(),0);
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Invoice editor passed ko/en/vi: compact customer/multi-order selection on the same form, discard protection, responsive layout, direct issue and retry recovery.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
