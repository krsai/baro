import {changeApprovalText,changeApprovalError} from '../frontend/src/constants/changeApprovals.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/cancelled-records-test.html'),jsx=html.replace('.html','.jsx'),port=43471;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/cancelled-records-test.jsx"></script>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import InvoiceList from'/src/pages/App/invoice/InvoiceList.jsx';import Activity from'/src/components/LedgerActivityTable.jsx';import{bankLedgerMessages}from'/src/constants/bankLedgerMessages';import{ledgerEntryText}from'/src/constants/ledgerEntry';
const lang=new URLSearchParams(location.search).get('lang');const sample={direction:'OUT',amount:'400',transactionDate:'2026-11-10',currencyCode:'USD',accountName:'Account A',counterpartyName:'VENDOR',accountingCode:{code:'DOCV',nameEn:'Documents'},settlementLines:[{id:'settlement',amount:'10',kind:'DISCOUNT',accountingCode:{code:'DISC',nameEn:'Discount'}}]};
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><InvoiceList orgId={1} languageCode={lang}/><div id="ledger"><Activity languageCode={lang} rows={[{...sample,id:'active',changePending:true},{...sample,id:'cancelled',voidedAt:'2026-11-11',voidReason:'Cancelled'}]} text={bankLedgerMessages[lang]} labels={ledgerEntryText[lang]} onEdit={()=>{}} onDelete={()=>{}}/></div></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:'+port+'/cancelled-records-test.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.stack);});
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/invoices/issued?*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},json:{rows:['ISSUED','CANCELLED','SUPERSEDED'].map((status,i)=>({id:'inv'+i,status,invoiceNumber:'INV-'+i,issuedAt:'2026-11-11',buyerName:'CUSTOMER',currencyCode:'USD',total:'15956.95',receivedAmount:'0',familyBalanceAmount:'0',issuedByName:'EMPLOYEE',descriptions:['Description'],orders:[]})),hasMore:false}}));
  await page.goto('http://127.0.0.1:'+port+'/cancelled-records-test.html?lang='+lang);await page.getByText('INV-1 / Description',{exact:true}).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,2000));throw e;});
  const invoiceRows=page.locator('[data-search-results] tbody tr');assert.equal(await invoiceRows.count(),3);
  for(let i=0;i<3;i++){
   const row=invoiceRows.nth(i);assert.equal(await row.getAttribute('data-cancelled'),String(i===1));
   for(const selector of ['td:first-child','td:nth-child(2)','td:nth-child(4) p','td:nth-child(6) .MuiTypography-root'])assert.equal(await row.locator(selector).evaluate(el=>getComputedStyle(el).textDecorationLine),i===1?'line-through':'none');
   assert.equal(await row.locator('[data-table-actions] button').evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
  }
  const blockedDelete=page.locator('#ledger [data-table-action="delete"]');assert.equal(await blockedDelete.count(),1);assert.equal(await blockedDelete.isDisabled(),true);assert.equal(await blockedDelete.getAttribute('title'),changeApprovalText[lang].pendingDeletionBlocked);assert.equal(changeApprovalError({message:'CHANGE_UPDATE_PENDING'},changeApprovalText[lang]),changeApprovalText[lang].CHANGE_UPDATE_PENDING);
  const ledgerRows=page.locator('#ledger tbody tr');assert.equal(await ledgerRows.count(),4);
  for(let i=0;i<4;i++)for(const cell of await ledgerRows.nth(i).locator('td:not([data-table-actions])').all())assert.equal(await cell.evaluate(el=>getComputedStyle(el).textDecorationLine),i>=2?'line-through':'none');
  assert.deepEqual(errors,[]);await page.close();console.log('Cancelled record display passed',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(jsx);}
