import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
const fixture=path.resolve('frontend/business-accounts-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{MemoryRouter,useLocation,useNavigate}from'react-router-dom';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Accounts from'/src/components/EntityBankAccounts.jsx';import Ledger from'/src/pages/App/BankLedger.jsx';import Approval from'/src/components/ExpenseApprovalActions.jsx';import Entry from'/src/pages/App/BankLedgerEntry.jsx';
const p=new URLSearchParams(location.search);function Screen(){window.testNavigate=useNavigate();const loc=useLocation();return loc.pathname==='/bank-ledger/new'?React.createElement(Entry):p.get('screen')==='approval'?React.createElement(Approval,{requestId:1,orgId:1,languageCode:p.get('lang')}):p.get('screen')==='ledger'?React.createElement(Ledger):React.createElement(Accounts,{entityId:1,languageCode:p.get('lang')});}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Screen))));</script></body></html>`);
const port=43254,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/business-accounts-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[],labels=ENTITY_TEXT[lang],money=bankLedgerMessages[lang];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:'ADMIN',orgName:'Company'}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const a={setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},navigateToPath:path=>window.testNavigate(path)};export const useAppActions=()=>a;`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const currencies=[{id:1,code:'VND'},{id:2,code:'USD'},{id:3,code:'KRW'}];let accounts=[1,1,2,3].map((currencyId,index)=>({id:'a'+index,displayName:'Cash '+index,accountKind:'CASH',currencyId,currency:currencies.find(c=>c.id===currencyId),ledgerAccounts:[]}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/entities/1/bank-accounts**',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push(body);accounts=body.ids.map(id=>accounts.find(a=>a.id===id));return r.fulfill({headers,json:{ok:true}});}
   if(r.request().method()==='POST'){const body=r.request().postDataJSON();writes.push(body);accounts.push({id:'a4',...body,currency:currencies.find(c=>c.id===body.currencyId),ledgerAccounts:[]});return r.fulfill({headers,status:201,json:{id:'a4'}});}
   return r.fulfill({headers,json:{accounts,currencies,revision:'r1',canLedger:true}});
  });
  await page.goto(`http://127.0.0.1:${port}/business-accounts-acceptance.html?lang=${lang}`);
  const rows=page.locator('[data-account-id]');await rows.nth(3).waitFor();assert.equal(await page.getByRole('checkbox').count(),0);assert.equal(await page.getByText(labels.default,{exact:true}).count(),0);
  const handle=page.locator('[data-rfd-drag-handle-draggable-id="a0"]');await handle.focus();await page.keyboard.press('Space');await page.waitForTimeout(100);await page.keyboard.press('ArrowDown');await page.waitForTimeout(100);await page.keyboard.press('Space');await page.waitForTimeout(150);
  assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(n=>n.dataset.accountId)),['a1','a0','a2','a3']);assert.equal(writes.length,0);
  await page.getByRole('button',{name:{ko:'순서 저장',en:'Save order',vi:'Lưu thứ tự'}[lang],exact:true}).click();await page.waitForTimeout(200);assert.deepEqual(writes[0].ids,['a1','a0','a2','a3']);
  if(lang==='ko'){
   await page.waitForTimeout(500);
   const from=await page.locator('[data-rfd-drag-handle-draggable-id="a1"]').boundingBox(),to=await page.locator('[data-account-id="a3"]').boundingBox();
   await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2,from.y+from.height/2+8);await page.waitForFunction(()=>document.querySelector('[data-account-id="a1"]')?.style.position==='fixed');await page.mouse.move(from.x+from.width/2,to.y+to.height/2,{steps:20});await page.waitForTimeout(200);await page.mouse.up();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-account-id]')).map(n=>n.dataset.accountId).join(',')==='a0,a2,a3,a1');
   assert.deepEqual(await rows.evaluateAll(nodes=>nodes.map(n=>n.dataset.accountId)),['a0','a2','a3','a1']);
   await page.getByRole('button',{name:'순서 저장',exact:true}).click();await page.waitForTimeout(200);
  }
  await page.getByRole('button',{name:labels.add,exact:true}).click();const dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel(labels.bank,{exact:true}).count(),0);assert.equal(await dialog.getByRole('checkbox').count(),0);
  await dialog.getByLabel(new RegExp({ko:'계좌명',en:'Account name',vi:'Tên tài khoản'}[lang])).fill('VND cash extra');
  assert.equal(await dialog.getByLabel(money.openingDate,{exact:true}).count(),0);assert.equal(await dialog.getByLabel(money.openingBalance).count(),0);
  await dialog.getByRole('button',{name:labels.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes.at(-1).accountKind,'CASH');assert.equal(writes.at(-1).currencyId,1);assert.equal('isDefault' in writes.at(-1),false);assert.equal('isActive' in writes.at(-1),false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.route('**/bank-ledger/accounts?*',r=>r.fulfill({headers,json:{accounts:accounts.map(a=>({...a,id:'entity:'+a.id,currencyCode:a.currency.code,setupRequired:true}))}}));
  await page.goto(`http://127.0.0.1:${port}/business-accounts-acceptance.html?lang=${lang}&screen=ledger`);
  await page.getByLabel(money.account).waitFor();assert.equal(await page.getByRole('button',{name:money.addAccount,exact:true}).count(),0);
  await page.waitForTimeout(200);assert.equal(await page.getByRole('button',{name:money.addEntry,exact:true}).isDisabled(),false);
  const et=ledgerEvidenceText[lang],posts=[];
  assert.equal(await page.getByRole('button',{name:money.refresh,exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:money.members,exact:true}).count(),0);
  await page.route('**/bank-ledger/accounts/entity:*/entries?*',r=>{const body=r.request().postDataJSON();posts.push(body);return r.fulfill({headers,status:201,json:{id:'saved'}});});
  await page.getByRole('button',{name:money.addEntry,exact:true}).click();
  const entryDialog=page.locator('main').filter({has:page.getByLabel(et.type,{exact:true})});await entryDialog.getByLabel(money.amount).first().fill('10');await entryDialog.getByLabel(money.purpose).fill('Receipt');
  assert.equal(await entryDialog.getByLabel(et.reference).getAttribute('required'),'');await entryDialog.getByLabel(et.reference).fill('scan-001.pdf');
  await entryDialog.getByRole('button',{name:money.save,exact:true}).click();await entryDialog.waitFor({state:'hidden'});assert.equal('openingBalance' in posts.at(-1),false);assert.equal(posts.at(-1).evidenceType,'FILE');
  await page.getByRole('button',{name:money.addEntry,exact:true}).click();await entryDialog.getByLabel(et.type,{exact:true}).click();await page.getByRole('option',{name:et.INVOICE,exact:true}).click();assert.equal(await entryDialog.getByLabel(et.invoice).count(),1);assert.equal(await entryDialog.getByLabel(et.fee).count(),1);
  await page.route('**/bank-ledger/evidence/expenses?*',r=>r.fulfill({headers,json:{items:[{id:'cost1',line:1,description:'Approved expense',remaining:'100'}]}}));
  await entryDialog.getByLabel(et.type,{exact:true}).click();await page.getByRole('option',{name:et.EXPENSE,exact:true}).click();await entryDialog.getByLabel(et.request).fill('EXP-000001');await entryDialog.getByRole('button',{name:et.find,exact:true}).click();await entryDialog.getByRole('button',{name:et.add+': #1 Approved expense',exact:false}).click();await entryDialog.getByLabel(et.allocated).fill('50');await entryDialog.getByLabel(et.fee).fill('1');await entryDialog.getByLabel(money.amount).first().fill('51');await entryDialog.getByLabel(money.purpose).fill('Paid expense');await entryDialog.getByRole('button',{name:money.save,exact:true}).click();await entryDialog.waitFor({state:'hidden'});assert.equal(posts.at(-1).expenseItems[0].itemId,'cost1');assert.equal(posts.at(-1).direction,'OUT');
  await page.getByRole('button',{name:money.addEntry,exact:true}).click();await entryDialog.getByLabel(et.type,{exact:true}).click();await page.getByRole('option',{name:et.ADJUSTMENT,exact:true}).click();assert.equal(await entryDialog.getByLabel(et.reference).count(),0);assert.equal(await entryDialog.getByLabel(et.invoice).count(),0);
  await entryDialog.getByRole('button',{name:money.cancel,exact:true}).click();
  let approved=false;await page.route('**/expense-requests/1/approval?*',r=>{if(r.request().method()==='POST')approved=true;return r.fulfill({headers,json:{version:1,steps:[{id:'s1',position:1,employee:{name:'Approver'},approved}],approved,canApprove:!approved}});});
  await page.goto(`http://127.0.0.1:${port}/business-accounts-acceptance.html?lang=${lang}&screen=approval`);await page.getByRole('button',{name:et.approve,exact:true}).click();await page.getByText(et.approval+' '+String.fromCharCode(183)+' '+et.approved,{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Business accounts: ko/en/vi cash registration, same-currency accounts, keyboard ordering and explicit save; ledger opening and required evidence supported, unused buttons removed, approval actions rendered.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
