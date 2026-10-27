import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {bankLedgerMessages} from '../frontend/src/constants/bankLedgerMessages.js';
const fixture=path.resolve('frontend/company-bank-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import theme from'/src/theme';import{AuthProvider,useAuth}from'/src/context/AuthContext.jsx';import CompanyWorkspaceProvider from'/src/components/CompanyWorkspaceProvider.jsx';import{useAppActions,useAppState}from'/src/context/AppContext.jsx';import Login from'/src/pages/Auth/Login.jsx';import Ledger from'/src/pages/App/BankLedger.jsx';
function Shell(){const auth=useAuth(),actions=useAppActions(),state=useAppState();if(auth.loading)return React.createElement('p',null,'Loading');if(auth.hasWorkspaceAccess&&auth.accessProfile?.entryType==='SYSTEM')return React.createElement('h1',null,'SYSTEM workspace');return auth.hasWorkspaceAccess?React.createElement(React.Fragment,null,React.createElement(Button,{onClick:()=>auth.clearWorkspaceSelection()},'Switch test company'),React.createElement(Button,{onClick:()=>actions.openTab({id:'/private',label:'Old company private tab'})},'Remember test tab'),React.createElement('span',null,'tabs:'+state.openTabs.length),React.createElement(Ledger)):React.createElement(Login);}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/login']},React.createElement(AuthProvider,null,React.createElement(CompanyWorkspaceProvider,null,React.createElement(Shell))))));</script></body></html>`);
const port=43248,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/company-bank-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:390,height:900}}),contexts=[];let allowDex=true,allowSystem=false,loginEmail='baro.garment@gmail.com';
  await page.route('**/src/lib/supabaseClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`const session=sessionStorage.getItem('test-oauth')?{access_token:'token',user:{id:'owner',email:sessionStorage.getItem('test-email')||'baro.garment@gmail.com'}}:null;export const isSupabaseConfigured=true;export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}}),signOut:async()=>{},signInWithOAuth:async()=>{sessionStorage.setItem('test-oauth','1');location.reload();return{};}}};`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  await page.route('**/auth/workspaces',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{workspaces:[...(allowSystem?[{key:'system',name:'SYSTEM',type:'SYSTEM',role:'SYSTEM_ADMIN'}]:[]),{key:'org:1',id:1,name:'BARO GARMENT',code:'BARO'},...(allowDex?[{key:'org:2',id:2,name:'DEXS LOGIS',code:'DEXS'}]:[])]}}));
  await page.route('**/auth/context*',r=>{const url=new URL(r.request().url()),system=allowSystem&&!url.searchParams.has('orgId'),id=Number(url.searchParams.get('orgId')||1);contexts.push(system?'system':id);return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:system?{email:loginEmail,entryType:'SYSTEM',systemRole:'SYSTEM_ADMIN'}:{email:loginEmail,entryType:'ORG',orgId:id,orgType:'SERVICE',orgRole:'ADMIN',orgName:id===2?'DEXS LOGIS':'BARO GARMENT',subscription:{status:'TRIAL'}}});});
  await page.route('**/bank-ledger/**',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{accounts:[]}}));
  await page.goto(`http://127.0.0.1:${port}/company-bank-acceptance.html`);
  const baro=page.getByRole('button',{name:'BARO GARMENT',exact:true}),dex=page.getByRole('button',{name:'DEX LOGIS',exact:true});
  await baro.waitFor();assert.equal(await baro.getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'SYSTEM',exact:true}).count(),1);
  await dex.click();assert.equal(await dex.getAttribute('aria-pressed'),'true');assert.equal(await baro.getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(lang==='ko'){
   await page.setViewportSize({width:1440,height:1000});
   await page.screenshot({path:path.join(process.env.TEMP||'/tmp','baro-company-login.png')});
   await page.setViewportSize({width:390,height:900});
  }
  await page.locator('.lineos-google-button').click();
  await page.getByRole('button',{name:'Switch test company',exact:true}).waitFor();
  assert.deepEqual(contexts,[2],'OAuth must enter the selected company without loading BARO context');
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('baro:workspace-selection')).key),'org:2');
  await page.evaluate(()=>sessionStorage.setItem('baro:login-company','BARO'));await page.reload();
  await page.getByRole('button',{name:'Switch test company',exact:true}).waitFor();
  assert.deepEqual(contexts,[2,1]);
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('baro:workspace-selection')).key),'org:1');
  await page.evaluate(()=>{sessionStorage.setItem('baro:login-company','DEX');sessionStorage.setItem('baro:workspace-selection',JSON.stringify({email:'baro.garment@gmail.com',key:'org:1'}));});
  allowDex=false;await page.reload();
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Switch test company',exact:true}).count(),0);
  allowSystem=true;loginEmail='krsailer82@gmail.com';
  await page.evaluate(()=>{sessionStorage.setItem('test-email','krsailer82@gmail.com');sessionStorage.setItem('baro:login-company','SYSTEM');});await page.reload();
  await page.getByRole('heading',{name:'SYSTEM workspace',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('baro:workspace-selection')).key),'system');
  allowSystem=false;loginEmail='baro.garment@gmail.com';
  await page.evaluate(()=>{sessionStorage.setItem('test-email','baro.garment@gmail.com');sessionStorage.setItem('baro:login-company','SYSTEM');});await page.reload();
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'SYSTEM workspace',exact:true}).count(),0);
  await page.close();
 }
 for(const lang of ['ko','en','vi']){
  const t=bankLedgerMessages[lang],page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saves=[],contexts=[];
  let dexRegistered=false,failOnce=true,entry=null,accountSaves=0,wrongContext=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/lib/supabaseClient.js*',r=>r.fulfill({contentType:'application/javascript',body:'const session={access_token:"test-token",user:{id:"owner",email:"owner@example.com"}};export const isSupabaseConfigured=true;export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}}),signOut:async()=>{},signInWithOAuth:async()=>{}}};'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  const companies=()=>[{key:'org:1',id:1,name:'BARO GARMENT',nameKo:'바로가먼트',type:'MANUFACTURER'},...(dexRegistered?[{key:'org:2',id:2,name:'DEXS LOGIS',nameKo:'덱스로지스',type:'SERVICE'}]:[])];
  await page.route('**/auth/workspaces',r=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='POST'){const body=r.request().postDataJSON();assert.equal(body.name,'DEXS LOGIS');assert.equal(body.code,'DEXS');assert.ok(body.clientKey);dexRegistered=true;return r.fulfill({headers,status:201,json:{id:2}});}
   return r.fulfill({headers,json:{canCreateCompany:true,workspaces:companies()}});
  });
  await page.route('**/auth/context*',r=>{
   const url=new URL(r.request().url()),orgId=Number(url.searchParams.get('orgId')||1);contexts.push(orgId);
   return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{email:'owner@example.com',entryType:'ORG',orgId:wrongContext?1:orgId,orgName:orgId===2?'DEXS LOGIS':'BARO GARMENT',orgType:orgId===2?'SERVICE':'MANUFACTURER',orgRole:'ADMIN',subscription:{status:'TRIAL'},accessPolicy:{__schemaVersion:13,SERVICE:{ADMIN:['BANK_LEDGER']},MANUFACTURER:{ADMIN:['BANK_LEDGER','DASHBOARD']}}}});
  });
  const account=orgId=>({id:`account-${orgId}`,orgId,bankName:orgId===2?'DEXS Bank':'BARO Bank',accountNumber:`00${orgId}`,accountHolder:orgId===2?'DEXS LOGIS':'BARO GARMENT',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'100.00',currentBalance:entry&&orgId===2?'105.25':'100.00'});
  await page.route('**/bank-ledger/**',r=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},url=new URL(r.request().url()),orgId=Number(url.searchParams.get('orgId'));
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   assert.ok(orgId===1||orgId===2);
   if(url.pathname.endsWith('/accounts')){
    if(r.request().method()==='POST'){const body=r.request().postDataJSON();assert.equal(orgId,2);assert.equal(body.accountNumber,'003');accountSaves++;return r.fulfill({headers,status:201,json:{...body,id:'new-account',orgId}});}
    return r.fulfill({headers,json:{accounts:[account(orgId)]}});
   }
   assert.ok(url.pathname.includes(`/account-${orgId}/entries`),'Selected account and company must match');
   if(r.request().method()==='POST'){
    const body=r.request().postDataJSON();saves.push(body);
    if(!entry)entry={...body,id:'entry-1',accountId:'account-2',orgId,createdBy:'owner@example.com',balance:'105.25'};
    if(failOnce){failOnce=false;return r.fulfill({headers,status:500,json:{error:'unknown result'}});}
    assert.equal(body.clientKey,entry.clientKey);return r.fulfill({headers,status:201,json:entry});
   }
   return r.fulfill({headers,json:{account:account(orgId),rows:entry&&orgId===2?[entry]:[],currentBalance:account(orgId).currentBalance,totalIn:entry&&orgId===2?'5.25':'0.00',totalOut:'0.00',page:0,hasMore:false}});
  });
  await page.goto(`http://127.0.0.1:${port}/company-bank-acceptance.html`);
  const registerName=lang==='ko'?'물류 회사 등록':lang==='vi'?'Đăng ký công ty logistics':'Register a logistics company';
  await page.getByRole('button',{name:registerName,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:lang==='ko'?'등록':lang==='vi'?'Đăng ký':'Register',exact:true}).click();
  await page.getByRole('button',{name:lang==='ko'?'덱스로지스':'DEXS LOGIS',exact:true}).click();
  await page.getByRole('button',{name:t.addEntry,exact:true}).waitFor();
  assert.ok(contexts.includes(2));assert.doesNotMatch(await page.locator('body').innerText(),/BARO Bank/);
  await page.getByRole('button',{name:t.addAccount,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel(t.bankName).fill('New bank');await dialog.getByLabel(t.accountNumber).fill('003');
  await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(accountSaves,1);
  await page.getByRole('button',{name:t.addEntry,exact:true}).click();
  await dialog.getByLabel(t.amount).fill('5.25');await dialog.getByLabel(t.purpose).fill('Daily deposit');await dialog.getByLabel(t.evidenceNumber).fill('BANK-007');
  await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel(t.amount).isDisabled(),true);
  await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByText('BANK-007',{exact:true}).waitFor();assert.equal(saves.length,2);assert.equal(saves[0].clientKey,saves[1].clientKey);assert.equal(saves[0].amount,'5.25');assert.equal(saves[0].purpose,'Daily deposit');
  await page.reload();await page.getByText('BANK-007',{exact:true}).waitFor();assert.equal(contexts.at(-1),2);
  await page.getByRole('button',{name:'Remember test tab',exact:true}).click();await page.getByText('tabs:1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch test company',exact:true}).click();await page.getByRole('button',{name:lang==='ko'?'바로가먼트':'BARO GARMENT',exact:true}).click();
  await page.getByRole('button',{name:t.addEntry,exact:true}).waitFor();assert.equal(await page.getByText('BANK-007',{exact:true}).count(),0);
  await page.getByText('tabs:0',{exact:true}).waitFor();
  assert.ok(await page.getByLabel(t.account).innerText().then(text=>text.includes('BARO Bank')));
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await page.evaluate(()=>sessionStorage.setItem('baro:workspace-selection',JSON.stringify({email:'owner@example.com',key:'org:999'})));
  await page.reload();await page.getByRole('button',{name:lang==='ko'?'덱스로지스':'DEXS LOGIS',exact:true}).waitFor();
  assert.ok(!contexts.includes(999),'A forged company selection must not issue an access-context lookup for that company');
  wrongContext=true;
  await page.getByRole('button',{name:lang==='ko'?'덱스로지스':'DEXS LOGIS',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:t.addEntry,exact:true}).count(),0,'An access response for a different company must fail closed');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Company banking passed ko/en/vi: SaaS company registration and selection, account input, deposit with evidence, safe retry, selected-company reload and isolation.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
