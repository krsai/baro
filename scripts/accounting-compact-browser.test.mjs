import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
import {ledgerEntryText} from '../frontend/src/constants/ledgerEntry.js';
import {ledgerWorkspaceText} from '../frontend/src/constants/ledgerWorkspace.js';
import {ledgerFlowText} from '../frontend/src/constants/ledgerFlow.js';
import {accountingCompactText} from '../frontend/src/constants/accountingCompact.js';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
const file=path.resolve('frontend/accounting-compact-test.html'),port=43429;assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/pages/App/BankLedgerEntry.jsx';import Accounts from'/src/components/BusinessAccounts.jsx';import Header from'/src/components/InvoiceFormHeader.jsx';import Activity from'/src/components/LedgerActivityTable.jsx';import{bankLedgerMessages}from'/src/constants/bankLedgerMessages';import{ledgerEntryText}from'/src/constants/ledgerEntry';
const lang=new URLSearchParams(location.search).get('lang'),mode=new URLSearchParams(location.search).get('mode');const sample={id:'x',direction:'OUT',amount:'400',transactionDate:'2026-11-10',currencyCode:'USD',accountName:'Account A',counterpartyName:'VENDOR',allocations:['THCV','CFSV','DOCV','DOCV'].map(code=>({expenseItem:{transactionCode:{code,nameEn:code}}}))};
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter initialEntries={['/bank-ledger/source/edit']}>{mode==='accounts'?<Accounts entityId={1} orgId={1} languageCode={lang}/>:mode==='invoice'?<Header readOnly languageCode={lang} fields={{number:'INV',date:'2026-11-11',seller:{name:'SUPPLIER',phone:'111',email:'seller@example.test'},buyer:{name:'CUSTOMER',phone:'222',email:'buyer@example.test'}}}/>:mode==='list'?<Activity languageCode={lang} rows={[sample]} text={bankLedgerMessages[lang]} labels={ledgerEntryText[lang]} onEdit={()=>{}} onDelete={()=>{}}/>:<Routes><Route path="/bank-ledger/:entryId/edit" element={<Ledger/>}/></Routes>}</MemoryRouter></ThemeProvider>);</script>`);
const sourceFile=file.replace('.html','.jsx');assert.ok(!existsSync(sourceFile));const markup=readFileSync(file,'utf8');writeFileSync(sourceFile,markup.split('<script type="module">')[1].split('</script>')[0]);writeFileSync(file,markup.replace(/<script type="module">[\s\S]*<\/script>/,'<script type="module" src="/accounting-compact-test.jsx"></script>'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/accounting-compact-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  console.log('Accounting compact',lang,width);const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN",activeProfile:{orgType:"SERVICE",orgRole:"ADMIN"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useRequestScopeContext=()=>({active:true,scopeId:"/bank-ledger/source/edit"});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const codes=['THCV','CFSV','DOCV','DOCV','FEEE'].map((code,index)=>({id:index+1,code,nameEn:code,isActive:true,base:{cashDirection:'OUT'}}));
  const items=codes.slice(0,4).map((code,index)=>({id:'cost'+index,itemId:'cost'+index,line:index+1,amount:'100',remaining:'500',label:code.code,description:code.code,accountingCode:code}));
  const source={accountId:'a',transactionDate:'2026-11-10',direction:'OUT',amount:'400',purpose:'Payment',accountingCodeId:1,evidenceType:'EXPENSE',expenseItems:items,counterparty:{kind:'PARTNER',id:11,name:'VENDOR'},document:{id:'expense',version:1,reference:'EXP-001',items,paymentSchedule:[]},settlementLines:[],revision:'rev'};
  const reply=(pattern,json)=>page.route(pattern,r=>r.fulfill({headers,json}));
  await reply('**/bank-ledger/accounts?*',{accounts:[{id:'a',entityAccountId:'master',displayName:'Account A',accountNumber:'123456789',currencyCode:'USD'}]});await reply('**/bank-ledger/counterparties?*',[source.counterparty]);await reply('**/transaction-codes?*',codes);await reply('**/bank-ledger/entries/source?*',source);
  const url=`http://127.0.0.1:${port}/accounting-compact-test.html?lang=${lang}`;await page.goto(url);
  const rows=page.locator('[data-ledger-entry-row]');await rows.nth(3).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,1600));throw e;});assert.equal(await rows.count(),4);assert.equal(await page.locator('[data-ledger-details]').count(),0);
  assert.equal(await rows.first().getByRole('textbox',{name:ledgerFlowText[lang].from,exact:true}).inputValue(),'Account A');
  for(let i=0;i<4;i++)assert.equal(await rows.nth(i).locator('td').nth(3).locator('input').inputValue(),codes[i].code);
  await rows.first().getByRole('textbox',{name:bankLedgerMessages[lang].amount,exact:true}).fill('120');assert.ok((await page.getByTestId('ledger-totals').innerText()).includes('420'));
  await rows.first().getByRole('button',{name:ledgerWorkspaceText[lang].add,exact:true}).click();assert.equal(await rows.count(),5);await rows.last().getByRole('button',{name:ledgerWorkspaceText[lang].remove,exact:true}).click();assert.equal(await rows.count(),4);
  await rows.first().getByRole('button',{name:ledgerEntryText[lang].bankFeeLabel,exact:true}).click();assert.equal(await rows.count(),5);await rows.last().getByRole('textbox',{name:bankLedgerMessages[lang].amount,exact:true}).fill('10');assert.ok((await page.getByTestId('ledger-totals').innerText()).includes('430'));assert.equal(await rows.last().getByRole('button',{name:ledgerWorkspaceText[lang].remove,exact:true}).isEnabled(),true);await rows.last().getByRole('button',{name:ledgerWorkspaceText[lang].remove,exact:true}).click();assert.equal(await rows.count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.goto(url+'&mode=invoice');await page.locator('input[value="CUSTOMER"]').waitFor();const names=await page.locator('.invoice-party input').evaluateAll(nodes=>nodes.map(n=>n.value));assert.equal(names[0],'CUSTOMER');assert.equal(await page.locator('details').count(),0);assert.equal(await page.locator('input[value="buyer@example.test"]').count(),1);assert.equal(await page.locator('.invoice-metadata').count(),0);
  await page.goto(url+'&mode=list');await page.getByText(lang==='ko'?'THCV 외 3건':lang==='en'?'THCV + 3 more':'THCV và 3 mục khác',{exact:true}).first().waitFor();
  if(width===1440){let primary=false;await page.route('**/entities/1/bank-accounts**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='PUT'){primary=r.request().postDataJSON().isDefault;return r.fulfill({headers,json:{ok:true}});}return r.fulfill({headers,json:{canEditAccounts:true,revision:'r',currencies:[{id:1,code:'USD'}],accounts:[{id:'bank',accountKind:'BANK',displayName:'Account A',bankName:'Bank',accountNumber:'123',accountHolder:'BARO',currencyId:1,currency:{id:1,code:'USD'},isDefault:primary}]}});});await page.goto(url+'&mode=accounts');await page.getByRole('button',{name:ENTITY_TEXT[lang].edit,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:accountingCompactText[lang].primary,exact:true}).check();await dialog.getByRole('button',{name:ENTITY_TEXT[lang].save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(primary,true);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: flat allocation edit rows, real cash totals, fee/add controls, account names, recipient-first contacts, compact list and primary accounts; ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);if(existsSync(sourceFile))unlinkSync(sourceFile);}
