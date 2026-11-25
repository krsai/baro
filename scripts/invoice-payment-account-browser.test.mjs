import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {invoicePaymentAccountText} from '../frontend/src/constants/invoicePaymentAccount.js';
import {invoiceUi} from '../frontend/src/constants/invoiceUi.js';
const file=path.resolve('frontend/invoice-payment-account-acceptance.html');assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="utf-8"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Editor from '/src/pages/App/invoice/InvoiceEditor';
const lang=new URLSearchParams(location.search).get('lang');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Editor,{orgId:1,orderId:'o1',languageCode:lang,onClose:()=>{},onIssued:()=>window.issued=true}))));
</script>`);
const source={orderId:'o1',orderNumber:'PO-1',sourceUpdatedAt:'2026-10-20',sellerOrgId:1,buyerOrgId:2,seller:{name:'BARO'},buyer:{name:'Customer'},ready:true,currencies:['USD'],sellerBankAccounts:[],styles:[{styleId:10,code:'S1',name:'Shirt',orderedQuantity:10,producedQuantity:10,ready:true,prices:[{pricingBasis:'MANUFACTURING_SERVICE_PRICE',currencyCode:'USD',entries:[{quantity:1,unitPrice:'2',priceId:4}],versionId:3}]}],lines:[{key:'item1:S',itemId:1,styleId:10,styleCode:'S1',description:'Shirt',orderedQuantity:10,quantity:'10',adjustmentReason:'',remark:'',hsCode:'',origin:'',color:'Blue',size:'S'}]};
const accounts=[{id:'default',bankName:'Default Bank',accountNumber:'DEFAULT-001',accountHolder:'BARO',currency:{code:'USD'}},{id:'chosen',bankName:'Selected Bank',accountNumber:'CHOSEN-002',accountHolder:'BARO',swiftCode:'ASCBVNVX',updatedAt:'2026-11-25T00:00:00.000Z',currency:{code:'USD'}}];
accounts.push(...[3,4].map(n=>({id:'extra'+n,bankName:'Extra Bank '+n,accountNumber:'EXTRA-00'+n,accountHolder:'BARO',currency:{code:n===3?'VND':'KRW'}})));
const port=43391,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const name=value=>new RegExp('^'+RegExp.escape(value)+'$','i');
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(file)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  console.log('Checking order payment account',lang,width);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],saves=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  await page.route('**/src/components/PageDialogProvider.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>true,prompt:async()=>"Reason"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/text-acronyms',route=>route.fulfill({headers,json:{revision:1,entries:[]}}));
  await page.route('**/invoices/**',route=>{const request=route.request(),url=new URL(request.url());if(request.method()==='OPTIONS')return route.fulfill({headers,status:204});
   if(url.pathname.includes('order-source'))return route.fulfill({headers,json:source});
   if(url.pathname.endsWith('/payment-accounts')){assert.equal(url.searchParams.get('orgId'),'1');return route.fulfill({headers,json:accounts});}
   if(request.method()==='POST'&&url.pathname.endsWith('/drafts')){saves.push(request.postDataJSON());return route.fulfill({headers,json:{id:'draft',revision:1,clientKey:saves[0].clientKey}});}
   if(request.method()==='POST'&&url.pathname.endsWith('/issue'))return route.fulfill({headers,json:{id:'issued'}});
   throw Error('Unexpected request: '+url.pathname);
  });
  await page.goto(`http://127.0.0.1:${port}/${path.basename(file)}?lang=${lang}`);
  const t=invoicePaymentAccountText[lang];await page.locator('[data-invoice-form-header] .invoice-document-identifiers').waitFor();assert.equal(await page.locator('[data-invoice-form-header] .invoice-document-identifiers .invoice-cell').count(),2);const metadata=await page.locator('.invoice-document-identifiers').boundingBox(),heading=await page.locator('[data-invoice-form-header] h2').boundingBox();if(width>=900)assert.ok(metadata.x>heading.x);assert.equal(await page.locator('.invoice-document-identifiers').getByRole('combobox').count(),0);await page.getByRole('button',{name:name(t.select)}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:name(t.select)}).click();
  await dialog.getByRole('row').filter({hasText:'CHOSEN-002'}).getByRole('checkbox').check();for(const n of [3,4]){const cb=dialog.getByRole('row').filter({hasText:'EXTRA-00'+n}).getByRole('checkbox');try{await cb.check();}catch(error){await page.screenshot({path:'logs/invoice-bank-selection-failure.png',fullPage:true});console.log(await dialog.innerText());throw error;}}assert.equal(await dialog.getByRole('row').filter({hasText:'DEFAULT-001'}).getByRole('checkbox').isDisabled(),true);await dialog.getByRole('button',{name:name(t.apply)}).click();await dialog.waitFor({state:'hidden'});
  const summary=page.getByTestId('invoice-payment-account');for(const value of ['Selected Bank','CHOSEN-002','BARO','USD','ASCBVNVX'])assert.match(await summary.innerText(),new RegExp(value));assert.doesNotMatch(await summary.innerText(),/DEFAULT-001/);
  const cards=summary.locator('[data-invoice-bank-card]');assert.equal(await cards.count(),3);const boxes=await Promise.all([0,1,2].map(i=>cards.nth(i).boundingBox()));if(width>900){assert.ok(boxes.every(box=>Math.abs(box.y-boxes[0].y)<1));assert.ok(boxes[2].x>boxes[1].x&&boxes[1].x>boxes[0].x);}else assert.ok(boxes[2].y>boxes[1].y&&boxes[1].y>boxes[0].y);
  const actions=summary.locator('[data-invoice-bank-actions]'),caption=await actions.locator(':scope > span').boundingBox(),button=await actions.getByRole('button').boundingBox(),header=await actions.boundingBox();assert.ok(Math.abs(button.x+button.width-header.x-header.width)<2);assert.ok(Math.abs(caption.y+caption.height/2-button.y-button.height/2)<2);
  await actions.getByRole('button').click();await dialog.waitFor();await dialog.getByRole('row').filter({hasText:'EXTRA-003'}).getByRole('checkbox').uncheck();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await cards.count(),3);
  await page.emulateMedia({media:'print'});const printed=await Promise.all([0,1,2].map(i=>cards.nth(i).boundingBox()));assert.ok(printed.every(box=>Math.abs(box.y-printed[0].y)<1));await page.emulateMedia({media:'screen'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:name(invoiceUi[lang].issue)}).click();await page.waitForFunction(()=>window.issued===true);
  assert.equal(saves[0].fields.bankAccounts.length,3);assert.deepEqual(saves[0].fields.bankAccounts.map(row=>row.id),['chosen','extra3','extra4']);assert.equal(saves[0].fields.bankAccountId,'chosen');assert.equal(saves[0].fields.bankAccountSnapshot.swiftCode,'ASCBVNVX');assert.match(saves[0].fields.bank,/CHOSEN-002/);assert.doesNotMatch(saves[0].fields.bank,/DEFAULT-001/);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Order invoices: ko/en/vi desktop/mobile explicit bank selection, cancel preservation, labelled SWIFT details and issued payload passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
