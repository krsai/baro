const vatRowOnly=process.argv.includes('--vat-row-only');
const orderEntryOnly=process.argv.includes('--order-entry-only');
const reviewOnly=process.argv.includes('--review-only');
import {invoicePaymentAccountText} from '../frontend/src/constants/invoicePaymentAccount.js';
import {invoiceUi} from '../frontend/src/constants/invoiceUi.js';
import {invoicePartyText} from '../frontend/src/constants/invoiceParty.js';
import {cashScheduleText} from '../frontend/src/constants/cashSchedule.js';
import {invoiceMessages} from '../frontend/src/constants/invoiceMessages.js';
const adjustmentOnly=process.argv.includes('--adjustment-only');
const summaryOnly=process.argv.includes('--summary-only');
const compactOnly=process.argv.includes('--compact-only');
const scheduleOnly=process.argv.includes('--schedule-only');
import {INVOICE_BANK_TEXT} from '../frontend/src/constants/invoiceBankConfirmation.js';
const bankReviewOnly=process.argv.includes('--bank-review-only');
import {invoiceDocumentText} from '../frontend/src/constants/invoiceDocument.js';
import {combineInvoiceSources} from '../frontend/src/utils/invoiceDraft.mjs';
import {documentNumberText} from '../frontend/src/constants/documentNumber.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/invoice-editor-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Editor from '/src/pages/App/invoice/InvoiceEditor.jsx';import List from '/src/pages/App/invoice/InvoiceList.jsx';import Workspace from '/src/pages/App/invoice/InvoiceWorkspace.jsx';
const mode=new URLSearchParams(location.search).get('mode');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[mode==='workspace'?'/invoices/new/order/o1':'/invoices/new']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),mode==='workspace'?React.createElement(Routes,null,React.createElement(Route,{path:'/invoices/new/order/:sourceOrderId',element:React.createElement(Workspace,{view:'editor'})})):mode==='list'?React.createElement(List,{orgId:1,languageCode:window.testLang}):React.createElement(Editor,{draftId:new URLSearchParams(location.search).get('draft'),revisionInvoice:window.testInvoice,orgId:1,buyerOrgId:2,orderIds:['o1'],languageCode:window.testLang,onClose:()=>window.closedEditor=true,onIssued:()=>window.issuedEditor=true}))));</script></body></html>`);
const party=name=>({code:name==='BARO'?'BARO':'CUST-001',name,address:'',country:'VN',taxId:'',email:'',phone:''});
const source={orderId:'o1',orderNumber:'PO-1',sourceUpdatedAt:'2026-10-20',sellerOrgId:1,buyerOrgId:2,seller:party('BARO'),buyer:party('Customer'),ready:true,currencies:['USD'],
 styles:[{styleId:10,code:'S1',name:'Shirt',orderedQuantity:10,producedQuantity:10,ready:true,prices:[{pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',entries:[{quantity:1,unitPrice:'2',priceId:4}],versionId:3}]}],
 lines:[{key:'item1:S',itemId:1,styleId:10,styleCode:'S1',description:'Shirt',orderedQuantity:10,quantity:'10',adjustmentReason:'',remark:'',hsCode:'',origin:'',color:'Blue',size:'S'}]};
source.sellerBankAccounts=[{id:1,isDefault:true,bankName:'Company Bank',accountNumber:'USD-001',accountHolder:'BARO',currency:{code:'USD'}},{id:2,isDefault:true,bankName:'Company Bank',accountNumber:'VND-001',accountHolder:'BARO',currency:{code:'VND'}}];
if(summaryOnly){source.sellerBankAccounts.forEach(account=>{account.accountHolder='BARO GARMENT MANUFACTURING COMPANY LIMITED';account.accountNumber='01234567890123456789';});source.sellerBankAccounts.push({id:3,isDefault:true,bankName:'International bank',accountNumber:'98765432109876543210',accountHolder:'BARO GARMENT MANUFACTURING COMPANY LIMITED',currency:{code:'KRW'}});}
if(bankReviewOnly)source.sellerBankAccounts.push({id:3,bankName:'Second bank',accountNumber:'USD-999',accountHolder:'Other holder',currency:{code:'USD'}});
source.lines.push({...source.lines[0],key:'item1:M',size:'M',orderedQuantity:5,quantity:'5'});source.styles[0].orderedQuantity=15;source.styles[0].producedQuantity=15;
const port=43221,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/invoice-editor-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const [lang,failure] of (orderEntryOnly?[]:(vatRowOnly||reviewOnly||adjustmentOnly||summaryOnly||compactOnly)?[['ko','none'],['en','none'],['vi','none']]:scheduleOnly?[['ko','none'],['en','none'],['vi','none']]:bankReviewOnly?[['ko','none'],['en','issue'],['en','save'],['vi','none']]:[['ko','detail'],['en','detail'],['vi','detail'],['en','revision'],['ko','layout'],['ko','none'],['en','none'],['vi','none'],['en','issue'],['en','save'],['ko','advance'],['en','advance'],['vi','advance']])){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saves=[],issues=[],reads=[];let failed=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(({lang,invoice})=>{window.testLang=lang;window.testInvoice=invoice;},{lang,invoice:failure==='detail'?{id:'i1',buyerOrgId:2,invoiceNumber:'INV-001',revisionNumber:1,pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',orders:[{sourceOrderId:'o1',sourceUpdatedAt:source.sourceUpdatedAt,billingPercentage:'100',appliedDeductionAmount:'0'}],snapshot:{fields:{number:'INV-001',date:'2026-10-31',seller:source.seller,buyer:source.buyer,notes:'',bank:'Saved bank USD-001'},lines:combineInvoiceSources([source]).lines.map(row=>({...row,lineKey:row.key,unitPrice:'2'}))}}:null});
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification:message=>(window.testNotices??=[]).push(String(message)),setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  if(failure==='detail')await page.route('**/src/components/PageDialogProvider.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>true,prompt:async()=>"Correction",alert:async()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/text-acronyms',r=>r.fulfill({headers,json:{revision:1,entries:[]}}));
  await page.route('**/invoices/**',r=>{
   const request=r.request(),url=new URL(request.url());if(request.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname.endsWith('/payment-accounts'))return r.fulfill({headers,json:source.sellerBankAccounts.map(account=>({...account,id:String(account.id)}))});
   if(url.pathname.includes('order-source')){reads.push(url.pathname);const incomplete={...source,ready:false,styles:source.styles.map(style=>({...style,ready:false,producedQuantity:5,assignments:[{externalId:'review-plan',completed:false,producedQuantity:5,plannedQuantity:15,factoryName:'HANOI'}]}))};return r.fulfill({headers,json:failure==='layout'?{...incomplete,lines:['L','M','FREE','S','XL','2XL','XS','3XL','4XL'].map(size=>({...source.lines[0],key:`item1:${size}`,size,gender:'M'}))}:failure==='advance'?incomplete:source});}
   if(request.method()==='POST'&&url.pathname.endsWith('/revision-draft')){assert.equal(saves.length,0);assert.ok(request.postDataJSON().reason);return r.fulfill({headers,json:{id:'revision',revision:1,clientKey:request.postDataJSON().clientKey}});}
   if(request.method()==='GET'&&url.pathname.endsWith('/drafts/revision'))return r.fulfill({headers,json:{id:'revision',revision:1,clientKey:'saved-client',buyerOrgId:2,content:{version:2,buyerOrgId:2,basis:'MANUFACTURING_SERVICE_PRICE',currency:'USD',orders:combineInvoiceSources([source]).orders,lines:combineInvoiceSources([source]).lines,percentages:{},settlements:{},fields:{number:'',date:'2026-10-31',seller:source.seller,buyer:source.buyer,notes:'',bank:'',shipTo:'',shipmentDate:'',dueDate:'',incoterm:'',paymentTerms:''}}}});
   if((request.method()==='POST'&&url.pathname.endsWith('/drafts'))||(request.method()==='PUT'&&url.pathname.endsWith('/drafts/revision'))){
    saves.push(request.postDataJSON());if(failure==='save'&&!failed){failed=true;return r.fulfill({headers,status:503,json:{error:'TEST_RESULT_UNCONFIRMED'}});}return r.fulfill({headers,json:{id:'pending-1',revision:1,clientKey:saves[0].clientKey}});
   }
   if(request.method()==='POST'&&url.pathname.endsWith('/issue')){
    issues.push({path:url.pathname,body:request.postDataJSON()});if(failure==='issue'&&!failed){failed=true;return r.fulfill({headers,status:503,json:{error:'TEST_RESULT_UNCONFIRMED'}});}return r.fulfill({headers,json:{id:'issued-1'}});
   }
   throw Error(`Unexpected request: ${request.method()} ${url.pathname}`);
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html${failure==='revision'?'?draft=revision':''}`);
  await page.getByTestId('invoice-payment-account').waitFor();
  if(adjustmentOnly){assert.equal(await page.locator('[data-invoice-bank-card]').count(),1);const heights=await page.locator('.invoice-form-summary').evaluate(el=>[el.querySelector('.invoice-bank-section').getBoundingClientRect().height,el.querySelector('.invoice-summary-details').getBoundingClientRect().height]);assert.ok(Math.abs(heights[0]-heights[1])<2,'Totals and bank panels have equal height');}
  assert.equal(await page.getByRole('checkbox').count(),0);
  await page.getByTestId('invoice-payment-account').getByRole('button').click();const bankPicker=page.getByRole('dialog');await bankPicker.getByRole('row').filter({hasText:bankReviewOnly?'USD-999':summaryOnly?'01234567890123456789':'USD-001'}).first().getByRole('checkbox').check();await bankPicker.getByRole('button',{name:invoicePaymentAccountText[lang].apply,exact:true}).click();await bankPicker.waitFor({state:'hidden'});
  const orderControls=page.locator('[data-invoice-order-controls]');
  assert.equal(await orderControls.locator('input[placeholder="100"]').count(),1,'Billing percentage follows the adjustment');
  assert.equal(await orderControls.evaluate(row=>!!(document.querySelector('[data-invoice-line]').compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Order billing controls follow the items');
  if(vatRowOnly){
   const line=page.locator('[data-invoice-line]').first(),treatment=line.locator('[data-invoice-vat-treatment]').getByRole('combobox'),rate=line.locator('[data-invoice-vat-rate] input');
   assert.equal(await page.locator('fieldset').getByRole('combobox').count(),1,'VAT treatment exists only in the item row');
   assert.equal(await rate.isDisabled(),true);
   const choose=async suffix=>{await treatment.focus();await treatment.press('ArrowDown');await page.getByRole('option',{name:new RegExp('^CMT'+suffix)}).click();};
   await choose('V');await rate.fill('8');assert.match(await page.locator('.invoice-total').innerText(),/32\.40/);
   await choose('E');assert.equal(await rate.inputValue(),'0');assert.equal(await rate.isDisabled(),true);
   await choose('V');await rate.fill('10');assert.match(await page.locator('.invoice-total').innerText(),/33\.00/);
   for(const width of [1366,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await line.locator('[data-invoice-vat-treatment]').count(),1);}
   await page.getByRole('button',{name:invoiceUi[lang].issue,exact:true}).click();await page.waitForFunction(()=>window.issuedEditor===true);
   assert.equal(saves[0].fields.vatTreatment,'V');assert.equal(saves[0].fields.vatRate,'10');assert.deepEqual(errors,[]);await page.close();continue;
  }
  if(adjustmentOnly){
   assert.equal(await page.getByRole('button',{name:invoiceUi[lang].cancel,exact:true}).count(),0);
   const adjustment=page.getByLabel(/\(\+\/-\)/);await adjustment.waitFor();
   assert.equal(await page.locator('[data-invoice-order-controls] input').count(),2);
   assert.ok(await adjustment.evaluate(el=>!!(document.querySelector('[data-invoice-line]').compareDocumentPosition(el.closest('[data-invoice-order-controls]'))&Node.DOCUMENT_POSITION_FOLLOWING)));
   await adjustment.fill('+1.005');
   const issue=page.getByRole('button',{name:invoiceUi[lang].issue,exact:true});assert.equal(await issue.isDisabled(),true);
   await page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')}).fill('Agreed rounding');assert.equal(await issue.isDisabled(),false);
   assert.match(await page.locator('.invoice-total').innerText(),/31\.01/);
   const rate=page.locator('[data-invoice-order-controls] input[placeholder="100"]');await rate.fill('50');assert.match(await page.locator('.invoice-total').innerText(),/16\.01/);await rate.fill('100');
   await adjustment.fill('-0.005');assert.match(await page.locator('.invoice-total').innerText(),/29\.99/);
   assert.equal(await page.locator('.invoice-amount-formula').count(),0);
   for(const width of [390,1366]){await page.setViewportSize({width,height:1000});assert.ok(await adjustment.isVisible());}
   assert.equal(saves.length,0);assert.deepEqual(errors,[]);await page.close();continue;
  }
  if(scheduleOnly)await page.getByLabel(cashScheduleText[lang].collection,{exact:true}).fill('2026-12-20');
  assert.equal(await page.getByLabel(invoiceDocumentText[lang].number,{exact:true}).count(),0,'auto-numbered invoice creation has no number field');
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/초안|draft|bản nháp/i);
  const issue=page.getByRole('button',{name:lang==='ko'?'발행':lang==='vi'?'Phát hành':'Issue',exact:true});assert.equal(await issue.isEnabled(),true);
  if(reviewOnly){for(const width of [1366,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.getByRole('checkbox').count(),0);await page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')}).fill('Updated note');assert.equal(await issue.isEnabled(),true);}assert.deepEqual(errors,[]);await page.close();continue;}
  assert.equal(await page.getByText('S1',{exact:true}).count(),0);
  assert.equal(await page.locator('textarea[aria-label^="Remark "]').count(),0);
  const grid=page.locator('fieldset table').first();
  const numeric=grid.locator('tbody tr[data-invoice-line]').first().locator('input');await numeric.first().focus();await numeric.first().press('Enter');assert.equal(await numeric.nth(1).evaluate(el=>document.activeElement===el),true,'invoice quantity Enter advances to price');
  assert.equal(await grid.locator('thead th').count(),9);
  assert.equal(await grid.getByRole('columnheader',{name:'S',exact:true}).count(),0);
  assert.equal(await grid.locator('thead th').nth(3).evaluate(el=>getComputedStyle(el).textAlign),'right');
  assert.equal(await grid.locator('tbody tr[data-invoice-line]').first().locator('td').nth(1).innerText(),source.orderNumber);
  assert.equal(await grid.locator('tbody tr[data-invoice-line]').first().locator('td').nth(3).innerText(),failure==='layout'?'90':'15');
  assert.equal(await grid.locator('tbody tr[data-invoice-line]').count(),1);
  assert.equal(await page.locator('.invoice-party').count(),2);
  assert.equal(await page.locator('.invoice-party').first().locator('input').first().inputValue(),'Customer');
  assert.equal(await page.locator('.invoice-party').last().locator('input').first().inputValue(),'BARO');
  assert.equal(await page.locator('.invoice-cell').first().evaluate(el=>getComputedStyle(el).display),'flex');
  assert.equal(await grid.locator('td').first().evaluate(el=>getComputedStyle(el).borderRightStyle),'none');
  if(summaryOnly){
   const summary=page.locator('.invoice-summary');await page.locator('input[inputmode="decimal"][aria-label$=" PO-1"]').fill('50');
   assert.match(await summary.locator('.invoice-settlement').innerText(),/30\.00/);assert.match(await summary.locator('.invoice-total').innerText(),/15\.00/);
   assert.equal(await summary.locator('[data-testid=invoice-payment-account] dd').count(),5);
   const treatment=page.getByRole('combobox').filter({hasText:'CMTE'});
   await treatment.click();await page.getByRole('option',{name:/CMTV/}).click();
   await page.locator('[data-invoice-vat-rate] input').fill('10');
   assert.match(await summary.locator('.invoice-total').innerText(),/16\.50/);
   assert.match(await summary.innerText(),/VAT.*1\.50/);
   for(const width of [1920,1720,1366,768,390]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.equal(await summary.locator('[data-testid=invoice-payment-account] dd').first().evaluate(el=>getComputedStyle(el).overflowWrap),'anywhere');
    if(width>=1366){const boxes=await summary.evaluate(el=>{const note=el.querySelector('.invoice-remark').getBoundingClientRect(),details=el.querySelector('.invoice-summary-details').getBoundingClientRect();const bank=el.querySelector('.invoice-bank-section').getBoundingClientRect();return {note:note.bottom,top:details.top,details:details.bottom,bank:bank.bottom,right:details.width,total:el.getBoundingClientRect().width};});assert.ok(boxes.note<boxes.top,JSON.stringify(boxes));assert.ok(Math.abs(boxes.bank-boxes.details)<3,JSON.stringify(boxes));}
   }
   await issue.click();await page.waitForTimeout(300);
   assert.equal(saves.at(-1).fields.vatTreatment,'V');assert.equal(saves.at(-1).fields.vatRate,'10');assert.equal(issues.length,1);
   assert.deepEqual(errors,[]);await page.close();continue;
  }
  if(failure==='layout'){

   assert.equal(await grid.locator('tr[data-production-review="true"]').count(),1);
   assert.match(await grid.locator('tbody tr[data-invoice-line]').innerText(),/HANOI/);
   let quantityReads=0;
   await page.route('**/assignment-plans/review-plan/quantity-review*',r=>{assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'1');quantityReads++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{plannedQuantity:15,producedQuantity:5,processTotals:[],workRecords:[]}});});
   await grid.getByRole('button',{name:'수량 확인',exact:true}).click();
   await page.getByText('작업기록 합계',{exact:true}).waitFor();assert.equal(quantityReads,1);
   await page.keyboard.press('Escape');await page.getByText('작업기록 합계',{exact:true}).waitFor({state:'hidden'});
   for(const width of [1920,1720,1366,768,390]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const dimensions=await grid.locator('tr[data-invoice-line] td:nth-child(6) input[inputmode="decimal"]').nth(0).first().evaluate(input=>({input:input.getBoundingClientRect().width,cell:input.closest('td').getBoundingClientRect().width}));
    assert.ok(dimensions.input<=dimensions.cell&&dimensions.cell>=100,JSON.stringify(dimensions));

   }
   assert.deepEqual(errors,[]);await page.close();continue;
  }
  assert.equal(await grid.locator('tbody tr[data-invoice-line]').count(),1);
  assert.match(await grid.innerText(),/\$/);assert.equal(await grid.locator('tr[data-invoice-line] td:nth-child(6) input[inputmode="decimal"]').nth(0).inputValue(),'2');await grid.locator('tr[data-invoice-line] td:nth-child(6) input[inputmode="decimal"]').nth(0).fill('2.3456');assert.match(await grid.innerText(),/Shirt/);assert.doesNotMatch(await grid.innerText(),/HS \/ Origin/);
  assert.equal(await page.getByRole('textbox',{name:'HS code',exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'Origin',exact:true}).count(),0);
  await grid.locator('tr[data-invoice-line] td:nth-child(5) input[inputmode="decimal"]').nth(0).fill('14');
  await page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')}).fill('One missing piece');
  if(failure==='advance'){const rate=page.locator('input[inputmode="decimal"][aria-label$=" PO-1"]');await rate.fill('30');await rate.press('Tab');}
  assert.equal(await issue.isEnabled(),true);
  await page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')}).fill('Reviewed note');assert.equal(await page.getByRole('checkbox').count(),0);
  
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await issue.click();
  if(['issue','save'].includes(failure)){
   await page.waitForFunction(()=>window.testNotices?.some(message=>message.includes('could not be confirmed')));assert.equal(await page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')}).isDisabled(),true);await issue.click();
  }
  await page.waitForFunction(()=>window.issuedEditor===true);
  if(scheduleOnly)assert.equal(saves[0].fields.expectedCollectionDate,'2026-12-20');
  assert.equal(saves.length,failure==='save'?2:1);assert.equal(issues.length,failure==='issue'?2:1);
  assert.equal(new Set(saves.map(s=>s.clientKey)).size,1);assert.ok(issues.every(i=>i.path==='/invoices/drafts/pending-1/issue'));
  if(failure==='advance')assert.equal(saves[0].percentages.o1,'30');
  assert.ok(saves[0].lines.every(line=>line.unitPriceOverride==='2.3456'));assert.equal(saves[0].buyerOrgId,2);assert.equal(saves[0].lines[0].quantity,'9');assert.equal(saves[0].lines[1].quantity,'5');assert.ok(saves[0].lines.every(line=>line.remark===''));assert.equal(saves[0].lines[0].adjustmentReason,'Reviewed Note');assert.equal(saves[0].fields.notes,'Reviewed Note');if(failure!=='revision'){assert.match(saves[0].fields.bank,bankReviewOnly?/USD-999/:/USD-001/);assert.doesNotMatch(saves[0].fields.bank,/VND-001/);assert.equal(saves[0].fields.bankAccountId,bankReviewOnly?'3':'1');}assert.equal(saves[0].fields.number,failure==='detail'?'INV-001-R2':'');
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const lang of ((vatRowOnly||orderEntryOnly||reviewOnly||adjustmentOnly||summaryOnly||bankReviewOnly||scheduleOnly||compactOnly)?[]:['ko','en','vi'])){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],queries=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:path=>window.navigation=path,markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/invoices/**',r=>{
   const url=new URL(r.request().url());assert.equal(url.pathname,'/invoices/issued','List must not load drafts');queries.push(Object.fromEntries(url.searchParams));
   return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{hasMore:true,rows:[{id:'i1',invoiceNumber:'INV-001',status:'ISSUED',buyerName:'Customer',currencyCode:'USD',total:'20',receivableAdded:'20',receivedAmount:'0',familyBalanceAmount:'20',familyBalanceKind:'DUE',isCurrentRevision:true,issuedAt:'2026-10-21',orders:[{sourceOrderNumber:'PO-1',installmentNumber:1}]}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html?mode=list`);
  try{await page.getByText('INV-001',{exact:true}).waitFor({timeout:8000});}catch(e){throw new Error(JSON.stringify({errors,queries,body:await page.locator('body').innerText()}));}
  assert.doesNotMatch(await page.locator('body').innerText(),/초안|draft|bản nháp/i);
  assert.equal(await page.locator('tbody td').filter({has:page.locator('button')}).count(),3,'Rows expose record open, PDF and protected cancellation');
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
  await page.getByPlaceholder(invoiceUi[lang].search).fill('PO-1');
  await page.waitForResponse(r=>r.url().includes('search=PO-1'));
  assert.ok(queries.some(q=>q.search==='PO-1'&&q.page==='0'));
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await assertSeparateCards();}
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const lang of ((vatRowOnly||reviewOnly||bankReviewOnly||scheduleOnly)?[]:['ko','en','vi'])){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],reads=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>{window.testLang=lang;},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},showNotification:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/invoices/**',r=>{
   const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*'};reads.push(url.pathname);
   if(url.pathname.endsWith('/payment-accounts'))return r.fulfill({headers,json:source.sellerBankAccounts});
   assert.ok(url.pathname.endsWith('/order-source/o1'),'Direct order invoice must bypass customer/order selection');
   return r.fulfill({headers,json:source});
  });
  await page.goto(`http://127.0.0.1:${port}/invoice-editor-acceptance.html?mode=workspace`);
  const remark=page.getByRole('textbox',{name:new RegExp('^'+RegExp.escape(invoiceUi[lang].notes)+'$','i')});await remark.waitFor();
  await remark.fill('Keep this order invoice');
  assert.equal(await page.getByRole('combobox',{name:invoicePartyText[lang].target,exact:true}).count(),0);
  assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(reads.filter(path=>path.endsWith('/order-source/o1')).length,1);
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await remark.inputValue(),'Keep this order invoice');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log(vatRowOnly?'PASS VAT treatment/rate in item rows: ko/en/vi desktop/mobile, tax calculation, exempt reset and issue payload.':orderEntryOnly?'PASS single-order invoice entry: ko/en/vi, independent order route, no customer/order selection, desktop/mobile draft preservation.':reviewOnly?'PASS invoice review checkbox removal: ko/en/vi desktop/mobile, issuance remains enabled after valid field edits.':scheduleOnly?'Collection date: ko/en/vi entry and draft/issue payload passed.':bankReviewOnly?'Invoice bank confirmation and selected account payload passed, including ambiguous issue/save retry recovery.':'Invoice editor passed ko/en/vi: single-order entry from orders, discard protection, responsive layout, direct issue and retry recovery.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
