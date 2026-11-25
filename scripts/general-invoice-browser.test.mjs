import {invoicePaymentAccountText} from '../frontend/src/constants/invoicePaymentAccount.js';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
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
const roleName=value=>new RegExp('^'+RegExp.escape(String(value))+'$','i');
const fixtureName=process.argv.includes('--service')?'general-invoice-service-test':'general-invoice-test';
const html=`frontend/${fixtureName}.html`,jsx=`frontend/${fixtureName}.jsx`;
writeFileSync(html,`<meta charset="utf-8"><div id="root"></div><script type="module" src="/${fixtureName}.jsx"></script>`);
// JSX uses a normal Vite entry so the real workspace and all shared inputs run.
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Workspace from '/src/pages/App/invoice/InvoiceWorkspace';createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider theme={theme}><CssBaseline/><Workspace view="editor"/></ThemeProvider></MemoryRouter>);`);
const port=process.argv.includes('--service')?43497:43293,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const [lang,width,failure] of [...['ko','en','vi'].flatMap(lang=>[1440,390].map(width=>[lang,width,'none'])),['en',1440,'save'],['en',1440,'issue']]){
  if((process.argv.includes('--customer-only')||process.argv.includes('--layout-only')||process.argv.includes('--codes-only')||process.argv.includes('--selection-only'))&&failure!=='none')continue;
  if(process.argv.includes('--service')&&lang!=='en')continue;
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],saves=[],issues=[],sourceReads=[];let failed=false;
  console.log('Checking general invoice',lang,width,failure,process.argv.includes('--material-only')?'material':'standard');
  await page.addInitScript(language=>localStorage.setItem('baro_language_override',language),lang);
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:1,activeProfile:{orgType:'${process.argv.includes('--service')?'SERVICE':'MANUFACTURER'}'}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>window.issued=true,showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/src/components/PageDialogProvider.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const usePageDialogs=()=>({confirm:async()=>true,prompt:async()=>"Correction"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/text-acronyms',route=>route.fulfill({headers,json:{revision:1,entries:[]}}));
  await page.route('**/invoices/**',route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
   if(url.pathname.endsWith('/payment-accounts'))return route.fulfill({headers,json:[{id:'default-bank',bankName:'Default Bank',accountNumber:'DEFAULT-001',accountHolder:'BARO',currency:{code:'VND'}},{id:'selected-bank',bankName:'Selected Bank',accountNumber:'CHOSEN-002',accountHolder:'BARO',swiftCode:'ASCBVNVX',updatedAt:'2026-11-25T00:00:00.000Z',currency:{code:'USD'}}]});
   if(url.pathname.endsWith('/customers'))return route.fulfill({headers,json:{rows:[{id:2,code:'CUST-001',searchText:'BARO CUST-001',name:process.argv.includes('--customer-only')?'THE SAN':'Customer',businessNumber:'TAX-123',contactName:'Ms. Contact',contactPhone:'0123456789',email:'Public@example.test',address:'Public address'}]}});
   if(url.pathname.endsWith('/general-source')){sourceReads.push(url.pathname);return route.fulfill({headers,json:{buyerOrgId:2,sellerOrgId:1,buyer:{code:'INTERNAL-BUYER',name:'Customer'},seller:{code:'INTERNAL-SELLER',name:'BARO'},sellerBankAccounts:[{id:'bank',isDefault:true,bankName:'Own Bank',accountNumber:'VND-001',accountHolder:'BARO',currency:{code:'VND'}}],codes:[{id:1,code:'GENV',nameEn:'General sales',nameKo:'일반 매출',nameVi:'Doanh thu khác',cashDirection:'IN',vatEnabled:true},{id:2,code:'PBGV',nameEn:'Poly Bag',nameKo:'폴리백',nameVi:'Túi poly',cashDirection:'OUT',vatEnabled:true,...(process.argv.includes('--material-only')?{baseId:20,base:{materialSettings:{enabled:true}}}:{})},{id:4,code:'PBGZ',nameEn:'Poly Bag',nameKo:'\uD3F4\uB9AC\uBC31',nameVi:'Tui poly',cashDirection:'OUT',vatEnabled:false},{id:5,code:'PBGE',nameEn:'Poly Bag',nameKo:'\uD3F4\uB9AC\uBC31',nameVi:'Tui poly',cashDirection:'OUT',vatEnabled:false},{id:3,code:'TRKV',nameEn:'Inland transport',nameKo:'내륙운송료',nameVi:'Vận tải nội địa',cashDirection:'OUT',vatEnabled:true}],units:[{id:9,nameEn:'Pcs',nameKo:'\uAC1C',nameVi:'C\u00e1i',isActive:true}],currencies:['VND','USD','KRW']}});}
   if(req.method()==='GET'&&url.pathname.endsWith('/orders'))return route.fulfill({headers,json:{rows:[],hasMore:false}});
   if(req.method()==='POST'&&url.pathname.endsWith('/issue')){issues.push(req.postDataJSON());if(failure==='issue'&&!failed){failed=true;return route.abort('failed');}return route.fulfill({headers,json:{id:'issued'}});}
   if(req.method()==='POST'&&url.pathname.endsWith('/drafts')){const body=req.postDataJSON();saves.push(body);assert.equal(body.documentKind,'GENERAL');assert.deepEqual(body.orders,[]);assert.equal(body.basis,null);assert.equal(calculateGeneralInvoiceDraft(body.lines,body.currency).amount,'1375000');if(failure==='save'&&!failed){failed=true;return route.abort('failed');}return route.fulfill({headers,json:{id:'draft',revision:1,clientKey:body.clientKey}});}
   throw new Error('Unexpected invoice request: '+req.method()+' '+url.pathname);
  });
  await page.route('**/material-items/options?*',route=>route.fulfill({headers,json:[{id:'material-master',baseId:20,unitId:9,variantId:'material-variant',variantRevision:2,data:{nameEn:'Poly Bag Material',nameKo:'Poly Bag Material',nameVi:'Poly Bag Material',details:{length:30,width:40,height:0.08},unit:{id:9,nameEn:'Pcs',nameKo:'\uAC1C',nameVi:'C\u00e1i'},variantId:'material-variant',variantRevision:2}}]}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}`);
  const t=generalInvoiceText[lang],u=invoiceUi[lang];
  await page.getByRole('combobox',{name:new RegExp('^'+t.type,'i')}).click();await page.getByRole('option',{name:new RegExp('^'+t.general+'$','i')}).click();
  const customer=page.getByRole('textbox',{name:roleName(invoicePartyText[lang].target)});if(process.argv.includes('--customer-only')){
   await customer.fill('THE');await customer.press('Enter');const partial=page.getByRole('dialog');await partial.waitFor();assert.equal(await partial.getByText('THE SAN',{exact:true}).count(),1);assert.equal(await page.getByTestId('general-invoice-line').count(),0);await page.keyboard.press('Escape');await partial.waitFor({state:'hidden'});await customer.fill('');
   await customer.press('F2');const dialog=page.getByRole('dialog'),lookup=EXPENSE_LOOKUP_TEXT[lang];await dialog.getByText('CUST-001',{exact:true}).click();const details=dialog.getByTestId('payee-details');await details.getByText('0123456789',{exact:true}).waitFor();assert.equal(await details.getByText('TAX-123',{exact:true}).count(),1);assert.equal(await details.getByTestId('payee-accounts').count(),0);
   await dialog.getByRole('textbox',{name:lookup.keyword,exact:true}).fill('BARO');await dialog.getByRole('button',{name:lookup.select,exact:true}).click();await dialog.waitFor({state:'hidden'});
   await page.getByTestId('general-invoice-line').waitFor();assert.equal(await customer.inputValue(),'CUST-001');
   for(const query of ['BARO','CUST-001']){await customer.fill(query);await customer.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);}assert.deepEqual(errors,[]);await page.close();continue;
  }
  await customer.fill('Customer');await customer.press('Enter');
  const row=page.getByTestId('general-invoice-line');await row.waitFor();
  if(process.argv.includes('--layout-only')||process.argv.includes('--codes-only')){
   const header=page.locator('[data-invoice-form-header="editing"]'),metadata=page.locator('[data-invoice-entry-metadata]'),currency=metadata.getByRole('combobox',{name:roleName(t.currency)});
   await currency.waitFor();assert.equal(await header.locator('.invoice-document-identifiers').count(),0);const settingsBox=await page.locator('[data-invoice-entry-settings]').boundingBox(),documentBox=await header.boundingBox();assert.ok(settingsBox.y+settingsBox.height<=documentBox.y+1,'Settings precede the document');assert.equal(await metadata.getByRole('combobox').count(),1,'Currency belongs to entry settings');
   if(lang==='ko'&&width===1440){await currency.click();await page.getByRole('option',{name:'USD',exact:true}).click();assert.match(await currency.textContent(),/USD/);await currency.click();await page.getByRole('option',{name:'VND',exact:true}).click();}
   const controls=await header.locator('.MuiInputBase-root').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
   assert.ok(controls.every(height=>Math.abs(height-36)<1),'Header inputs share the 36px control height');
   if(width>=900){
    const positions=await metadata.locator('.MuiInputBase-root').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().y)));assert.equal(new Set(positions).size,1,'Number, date and currency align');
    const parties=header.locator('.invoice-party');const left=await parties.nth(0).boundingBox(),right=await parties.nth(1).boundingBox();assert.equal(Math.round(left.y),Math.round(right.y));
    for(const party of await parties.all()){const address=await party.locator('.invoice-party-address').boundingBox(),panel=await party.boundingBox();assert.ok(address.width>panel.width-2,'Address uses the full party width');}
   }
   const lineControls=await row.locator('.MuiInputBase-root').evaluateAll(nodes=>nodes.map(node=>({y:Math.round(node.getBoundingClientRect().y),height:Math.round(node.getBoundingClientRect().height)})));
   assert.equal(new Set(lineControls.map(control=>control.y)).size,1,'Item inputs align vertically');assert.ok(lineControls.every(control=>control.height===36));
   assert.equal(await row.locator('.MuiInputLabel-root').count(),0,'Table headings provide item labels');
   assert.equal(await header.getByText('INTERNAL-BUYER',{exact:true}).count(),0);assert.equal(await header.locator('input[value="INTERNAL-BUYER"],input[value="INTERNAL-SELLER"]').count(),0);
   for(const party of await header.locator('.invoice-party').all())assert.deepEqual(await party.locator('.invoice-party-row').evaluateAll(rows=>rows.map(row=>row.querySelectorAll('.invoice-cell').length)),[2,1,3],'Company name/tax ID, address, contact/phone/email use three declared rows');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Only the item table scrolls horizontally');
  }
  const code=row.getByRole('textbox',{name:roleName(ACCOUNTING_CODE_TEXT[lang].code)});
  if(process.argv.includes('--codes-only')){
   for(const [query,expected]of [['POL','PBGV'],['TRK','TRKV'],['폴리백','PBGV']]){await code.fill(query);await code.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();const candidate=dialog.getByRole('row').filter({has:page.getByRole('cell',{name:expected,exact:true})});await candidate.getByRole('button').click();await dialog.waitFor({state:'hidden'});assert.equal(await code.inputValue(),expected);}
  }else if(process.argv.includes('--material-only')){
   await code.fill('PBGV');await code.press('Enter');
   const materialDialog=page.getByRole('dialog');await materialDialog.waitFor();
   await materialDialog.getByRole('row').filter({hasText:'Poly Bag Material'}).getByRole('button').click();await materialDialog.waitFor({state:'hidden'});
   assert.equal(await row.getByRole('textbox',{name:roleName(t.description)}).inputValue(),'Poly Bag Material / 30 × 40 × 0.08 Mm');
   const materialButton=row.getByRole('button',{name:materialItemText[lang].select,exact:true});
   assert.equal(await materialButton.innerText(),'','Material selection uses an icon without repeating the description');
   const positions=await row.locator('.MuiInputBase-root').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().y)));
   assert.equal(new Set(positions).size,1,'Material selection keeps item inputs in one aligned row');
   await materialButton.click();await materialDialog.waitFor();await page.keyboard.press('Escape');await materialDialog.waitFor({state:'hidden'});
   assert.equal(await row.getByRole('textbox',{name:roleName(t.description)}).inputValue(),'Poly Bag Material / 30 × 40 × 0.08 Mm');
   assert.equal(await row.getByRole('textbox',{name:roleName(t.unit)}).inputValue(),({ko:'\uAC1C',en:'Pcs',vi:'C\u00e1i'})[lang]);
  }else{await code.fill('GENV');await code.press('Enter');assert.match(await row.getByRole('textbox',{name:roleName(t.description)}).inputValue(),roleName(({ko:'\uC77C\uBC18 \uB9E4\uCD9C',en:'General sales',vi:'Doanh thu kh\u00e1c'})[lang]));}
  const quantity=row.getByRole('textbox',{name:roleName(t.quantity)});await quantity.click();await page.waitForFunction(()=>{const input=document.activeElement;return input?.value==='1'&&input.selectionStart===0&&input.selectionEnd===1;});await page.keyboard.type('2');assert.equal(await quantity.inputValue(),'2');
  await row.getByRole('textbox',{name:roleName(t.description)}).fill('Polybag agency purchase');
  if(!process.argv.includes('--material-only')){await row.getByRole('combobox',{name:roleName(t.unit)}).click();await page.getByRole('option',{name:({ko:'\uAC1C',en:'Pcs',vi:'C\u00e1i'})[lang],exact:true}).click();}await row.getByRole('textbox',{name:roleName(t.quantity)}).fill('1000');await row.getByRole('textbox',{name:roleName(t.price)}).fill('1250');await row.getByRole('textbox',{name:roleName(t.vat)}).fill('10');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Only the item table may scroll horizontally');
  const paymentText=invoicePaymentAccountText[lang];await page.getByRole('button',{name:roleName(paymentText.select)}).click();const bankDialog=page.getByRole('dialog');await bankDialog.waitFor();await bankDialog.getByRole('row').filter({hasText:'CHOSEN-002'}).getByRole('button').click();await bankDialog.waitFor({state:'hidden'});assert.match(await page.getByTestId('invoice-payment-account').innerText(),/ASCBVNVX/);
  await page.getByRole('checkbox',{name:roleName(t.review)}).check();const issue=page.getByRole('button',{name:roleName(u.issue)});await issue.click();

  if(failure!=='none'){await page.getByRole('alert').filter({hasText:t.uncertain}).waitFor();assert.equal(await row.getByRole('textbox',{name:roleName(t.description)}).isDisabled(),true);await issue.click();}
  await page.waitForFunction(()=>window.issued===true).catch(async error=>{console.error({lang,width,failure,saves:saves.length,issues:issues.length,errors,alerts:await page.getByRole('alert').allTextContents(),dialogs:await page.getByRole('dialog').allTextContents(),reviewed:await page.getByRole('checkbox',{name:t.review}).isChecked(),issueDisabled:await issue.isDisabled()});throw error;});
  assert.equal(sourceReads.length,1);assert.equal(saves[0].fields.bankAccountId,'selected-bank');assert.match(saves[0].fields.bank,/CHOSEN-002/);assert.doesNotMatch(saves[0].fields.bank,/DEFAULT-001/);assert.equal(saves[0].fields.bankAccountSnapshot.swiftCode,'ASCBVNVX');assert.deepEqual(errors,[]);
  if(process.argv.includes('--codes-only'))assert.equal(saves[0].lines[0].transactionCodeId,2,'OUT-direction polybag code retains its actual company FK through issuance');
  assert.equal(saves[0].lines[0].unitId,9);if(process.argv.includes('--material-only')){assert.equal(saves[0].lines[0].materialItemId,'material-master');assert.equal(saves[0].lines[0].materialVariantId,'material-variant');assert.equal(saves[0].lines[0].materialVariantRevision,2);}
  if(failure==='save')assert.deepEqual(saves[0],saves[1]);if(failure==='issue'){assert.equal(saves.length,1);assert.deepEqual(issues[0],issues[1]);}
  if(lang==='ko'&&width===1440&&failure==='none'){
   const content=saves[0],calculation=calculateGeneralInvoiceDraft(content.lines,content.currency);
   const invoice={status:'ISSUED',invoiceNumber:'INV-TEST',snapshot:{version:4,templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',fields:{...content.fields,number:'INV-TEST'},orders:[],currencyCode:content.currency,subtotal:calculation.subtotal,vatAmount:calculation.vatAmount,total:calculation.amount,lines:calculation.lines.map(row=>({...row,lineKey:row.key}))}};
   const pdf=await page.evaluate(async invoice=>{const {buildIssuedInvoicePdfBlob}=await import('/src/utils/issuedInvoicePdf.js');const blob=await buildIssuedInvoicePdfBlob(invoice,'ko');const bytes=new Uint8Array(await blob.arrayBuffer());return {type:blob.type,size:blob.size,header:String.fromCharCode(...bytes.slice(0,5))};},invoice);
   assert.equal(pdf.type,'application/pdf');assert.equal(pdf.header,'%PDF-');assert.ok(pdf.size>1000);
  }
  await page.close();
 }
 console.log(process.argv.includes('--selection-only')?'PASS: material name/specification, reselect/cancel, unit/FK and issuance; ko/en/vi desktop/mobile.':process.argv.includes('--codes-only')?'PASS: three-row company details without internal codes, POL/Poly Bag/Korean and transport code selection, scoped FK through VAT/issue/PDF; '+(process.argv.includes('--service')?'SERVICE en desktop/mobile':'MANUFACTURER ko/en/vi desktop/mobile'):process.argv.includes('--layout-only')?'PASS: invoice currency metadata, 36px controls, party/address alignment, item input alignment, codes/VAT/issue and PDF; ko/en/vi desktop/mobile.':process.argv.includes('--customer-only')?'PASS: invoice customer code column, code search/selection and original buyer ID; ko/en/vi desktop/mobile.':'General invoice workspace: ko/en/vi desktop/mobile, customer without orders, codes/items/VAT, bank confirmation, issue and uncertain save/issue retries passed.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
