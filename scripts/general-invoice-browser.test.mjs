import {invoicePartyText} from '../frontend/src/constants/invoiceParty.js';
import {EXPENSE_LOOKUP_TEXT} from '../frontend/src/constants/expenseLookup.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {generalInvoiceText} from '../frontend/src/constants/generalInvoice.js';
import {invoiceMessages} from '../frontend/src/constants/invoiceMessages.js';
import {invoiceUi} from '../frontend/src/constants/invoiceUi.js';
import {ACCOUNTING_CODE_TEXT} from '../frontend/src/constants/accountingCode.js';
import {INVOICE_BANK_TEXT} from '../frontend/src/constants/invoiceBankConfirmation.js';
import {calculateGeneralInvoiceDraft} from '../frontend/src/utils/generalInvoice.mjs';
const html='frontend/general-invoice-test.html';
writeFileSync(html,'<meta charset="utf-8"><div id="root"></div><script type="module" src="/general-invoice-test.jsx"></script>');
// JSX uses a normal Vite entry so the real workspace and all shared inputs run.
const jsx='frontend/general-invoice-test.jsx';
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Workspace from '/src/pages/App/invoice/InvoiceWorkspace';createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider theme={theme}><CssBaseline/><Workspace view="editor"/></ThemeProvider></MemoryRouter>);`);
const port=43293,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const [lang,width,failure] of [...['ko','en','vi'].flatMap(lang=>[1440,390].map(width=>[lang,width,'none'])),['en',1440,'save'],['en',1440,'issue']]){
  if(process.argv.includes('--customer-only')&&failure!=='none')continue;
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],saves=[],issues=[],sourceReads=[];let failed=false;
  await page.addInitScript(language=>localStorage.setItem('baro_language_override',language),lang);
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1,activeProfile:{orgType:'MANUFACTURER'}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>window.issued=true,showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/src/components/PageDialogProvider.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>true,prompt:async()=>"Correction"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/invoices/**',route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
   if(url.pathname.endsWith('/customers'))return route.fulfill({headers,json:{rows:[{id:2,code:'CUST-001',searchText:'BARO CUST-001',name:process.argv.includes('--customer-only')?'THE SAN':'Customer',businessNumber:'TAX-123',contactName:'Ms. Contact',contactPhone:'0123456789',email:'Public@example.test',address:'Public address'}]}});
   if(url.pathname.endsWith('/general-source')){sourceReads.push(url.pathname);return route.fulfill({headers,json:{buyerOrgId:2,sellerOrgId:1,buyer:{name:'Customer'},seller:{name:'BARO'},sellerBankAccounts:[{id:'bank',bankName:'Own Bank',accountNumber:'VND-001',accountHolder:'BARO',currency:{code:'VND'}}],codes:[{id:1,code:'GENV',nameEn:'General sales',nameKo:'일반 매출',nameVi:'Doanh thu khác',cashDirection:'IN',vatEnabled:true}],currencies:['VND','USD','KRW']}});}
   if(req.method()==='GET'&&url.pathname.endsWith('/orders'))return route.fulfill({headers,json:{rows:[],hasMore:false}});
   if(req.method()==='POST'&&url.pathname.endsWith('/issue')){issues.push(req.postDataJSON());if(failure==='issue'&&!failed){failed=true;return route.abort('failed');}return route.fulfill({headers,json:{id:'issued'}});}
   if(req.method()==='POST'&&url.pathname.endsWith('/drafts')){const body=req.postDataJSON();saves.push(body);assert.equal(body.documentKind,'GENERAL');assert.deepEqual(body.orders,[]);assert.equal(body.basis,null);assert.equal(calculateGeneralInvoiceDraft(body.lines,body.currency).amount,'1375000');if(failure==='save'&&!failed){failed=true;return route.abort('failed');}return route.fulfill({headers,json:{id:'draft',revision:1,clientKey:body.clientKey}});}
   throw new Error('Unexpected invoice request: '+req.method()+' '+url.pathname);
  });
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}`);
  const t=generalInvoiceText[lang],u=invoiceUi[lang];
  await page.getByRole('combobox',{name:new RegExp('^'+t.type)}).click();await page.getByRole('option',{name:t.general,exact:true}).click();
  const customer=page.getByRole('textbox',{name:invoicePartyText[lang].target,exact:true});if(process.argv.includes('--customer-only')){
   await customer.fill('THE');await customer.press('Enter');const partial=page.getByRole('dialog');await partial.waitFor();assert.equal(await partial.getByText('THE SAN',{exact:true}).count(),1);assert.equal(await page.getByTestId('general-invoice-line').count(),0);await page.keyboard.press('Escape');await partial.waitFor({state:'hidden'});await customer.fill('');
   await customer.press('F2');const dialog=page.getByRole('dialog'),lookup=EXPENSE_LOOKUP_TEXT[lang];await dialog.getByText('CUST-001',{exact:true}).click();const details=dialog.getByTestId('payee-details');await details.getByText('0123456789',{exact:true}).waitFor();assert.equal(await details.getByText('TAX-123',{exact:true}).count(),1);assert.equal(await details.getByTestId('payee-accounts').count(),0);
   await dialog.getByRole('textbox',{name:lookup.keyword,exact:true}).fill('BARO');await dialog.getByRole('button',{name:lookup.select,exact:true}).click();await dialog.waitFor({state:'hidden'});
   await page.getByTestId('general-invoice-line').waitFor();assert.equal(await customer.inputValue(),'CUST-001');
   for(const query of ['BARO','CUST-001']){await customer.fill(query);await customer.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);}assert.deepEqual(errors,[]);await page.close();continue;
  }
  await customer.fill('Customer');await customer.press('Enter');
  const row=page.getByTestId('general-invoice-line');await row.waitFor();
  const code=row.getByRole('textbox',{name:ACCOUNTING_CODE_TEXT[lang].code,exact:true});await code.fill('GENV');await code.press('Enter');
  await row.getByRole('textbox',{name:t.description,exact:true}).fill('Polybag agency purchase');
  await row.getByRole('textbox',{name:t.unit,exact:true}).fill('pcs');await row.getByRole('textbox',{name:t.quantity,exact:true}).fill('1000');await row.getByRole('textbox',{name:t.price,exact:true}).fill('1250');await row.getByRole('textbox',{name:t.vat,exact:true}).fill('10');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Only the item table may scroll horizontally');
  await page.getByRole('checkbox',{name:t.review}).check();const issue=page.getByRole('button',{name:u.issue,exact:true});await issue.click();
  const bank=page.getByRole('dialog'),bankText=INVOICE_BANK_TEXT[lang];await bank.getByRole('checkbox').check();await bank.getByRole('button',{name:bankText.confirm,exact:true}).click();
  if(failure!=='none'){await page.getByRole('alert').filter({hasText:t.uncertain}).waitFor();assert.equal(await row.getByRole('textbox',{name:t.description,exact:true}).isDisabled(),true);await issue.click();}
  await page.waitForFunction(()=>window.issued===true);
  assert.equal(sourceReads.length,1);assert.equal(saves[0].fields.bank,'Own Bank / VND-001 / BARO / VND');assert.deepEqual(errors,[]);
  if(failure==='save')assert.deepEqual(saves[0],saves[1]);if(failure==='issue'){assert.equal(saves.length,1);assert.deepEqual(issues[0],issues[1]);}
  if(lang==='ko'&&width===1440&&failure==='none'){
   const content=saves[0],calculation=calculateGeneralInvoiceDraft(content.lines,content.currency);
   const invoice={status:'ISSUED',invoiceNumber:'INV-TEST',snapshot:{version:4,templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',fields:{...content.fields,number:'INV-TEST'},orders:[],currencyCode:content.currency,subtotal:calculation.subtotal,vatAmount:calculation.vatAmount,total:calculation.amount,lines:calculation.lines.map(row=>({...row,lineKey:row.key}))}};
   const pdf=await page.evaluate(async invoice=>{const {buildIssuedInvoicePdfBlob}=await import('/src/utils/issuedInvoicePdf.js');const blob=await buildIssuedInvoicePdfBlob(invoice,'ko');const bytes=new Uint8Array(await blob.arrayBuffer());return {type:blob.type,size:blob.size,header:String.fromCharCode(...bytes.slice(0,5))};},invoice);
   assert.equal(pdf.type,'application/pdf');assert.equal(pdf.header,'%PDF-');assert.ok(pdf.size>1000);
  }
  await page.close();
 }
 console.log(process.argv.includes('--customer-only')?'PASS: invoice customer code column, code search/selection and original buyer ID; ko/en/vi desktop/mobile.':'General invoice workspace: ko/en/vi desktop/mobile, customer without orders, codes/items/VAT, bank confirmation, issue and uncertain save/issue retries passed.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
