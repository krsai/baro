import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {systemShippingPortText} from '../frontend/src/constants/systemShippingPorts.js';
const fixture='frontend/system-shipping-ports-acceptance.html',port=43439;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Layout from'/src/layouts/MainLayout.jsx';import Page from'/src/pages/App/system/SystemShippingPorts.jsx';window.notices=[];createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/system-setting/shipping-ports']},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},React.createElement(Route,{path:'/system-setting/shipping-ports',element:React.createElement(Page)}))))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/system-shipping-ports-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const t=systemShippingPortText[lang],page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const profile={entryType:'SYSTEM',systemRole:'SYSTEM_ADMIN',email:'system@example.test'};export const useAuth=()=>({activeOrgId:null,activeOrgType:null,activeProfile:profile,accessProfile:profile,isAuthenticated:true,user:{email:profile.email},signOut:()=>{}});"}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions=new Proxy({showNotification:(message)=>window.notices.push(message)},{get:(target,key)=>target[key]||(()=>{})});export const useAppActions=()=>actions;export const useAppState=()=>({sidebarOpen:${width>=600},openTabs:[{id:'/system-setting/shipping-ports',path:'/system-setting/shipping-ports',label:'Ports'}]});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  for(const path of ['expense-deletion-requests','change-approval-requests','customers','org-memberships'])await page.route('**/'+path+'?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/system/onboarding-requests',r=>r.fulfill({headers,json:{pendingCompanyRequests:[]}}));
  const rows=[...Array.from({length:51},(_,i)=>({code:'AA'+String(i).padStart(3,'0'),country:'AA',name:'Fixture port '+i,sourceVersion:'2025-1',version:1,isActive:true,deletedAt:null,inUse:false})),{code:'KRPUS',country:'KR',name:'Busan',sourceVersion:'2025-1',version:1,isActive:true,deletedAt:null,inUse:true},{code:'VNHPH',country:'VN',name:'Haiphong',sourceVersion:'2025-1',version:1,isActive:true,deletedAt:null,inUse:false}];
  let failLoad=true,failSave=true,conflict=true,posted=[];const receipts=new Map();
  await page.route(/\/system\/shipping-ports(?:[/?]|$)/,async r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='GET'){
    if(failLoad){failLoad=false;return r.fulfill({headers,status:500,json:{error:'FAILED'}});}
    const q=(url.searchParams.get('q')||'').toLowerCase(),state=url.searchParams.get('state'),page=Number(url.searchParams.get('page')||0),filtered=rows.filter(row=>[row.code,row.name,row.country].join(' ').toLowerCase().includes(q)&&(state==='DELETED'?row.deletedAt:!row.deletedAt&&(state==='ALL'||state==='ACTIVE'&&row.isActive||state==='INACTIVE'&&!row.isActive)));
    return r.fulfill({headers,json:{rows:filtered.slice(page*50,page*50+50),total:filtered.length,page}});
   }
   const body=req.postDataJSON(),row=rows.find(row=>row.code===url.pathname.split('/').at(-1));posted.push(body);
   if(receipts.has(body.clientKey)){assert.deepEqual(receipts.get(body.clientKey).request,body);return r.fulfill({headers,json:receipts.get(body.clientKey).after});}
   if(body.action==='ACTIVATE'&&row.code==='KRPUS'&&conflict){conflict=false;row.version++;return r.fulfill({headers,status:409,json:{error:'SHIPPING_PORT_CHANGED'}});}
   assert.equal(body.version,row.version);row.version++;row.isActive=body.action==='ACTIVATE';row.deletedAt=body.action==='DELETE'?'2026-11-14T00:00:00Z':null;receipts.set(body.clientKey,{request:body,after:{...row}});
   if(failSave){failSave=false;return r.fulfill({headers,status:500,json:{error:'FAILED_AFTER_COMMIT'}});}
   return r.fulfill({headers,json:row});
  });
  await page.goto(`http://127.0.0.1:${port}/system-shipping-ports-acceptance.html`,{timeout:90000});
  if(width>=600){const drawer=page.locator('.MuiDrawer-paper:visible');await drawer.getByText(t.title,{exact:true}).waitFor();const group=await page.evaluate(async lang=>{const {organizeSystemMenu}=await import('/src/utils/systemMenuLayout.mjs');return organizeSystemMenu([{isParent:true,menuGroupKey:'ATTRIBUTE',children:[{path:'/system-setting/shipping-ports'}]}],lang)[0].label;},lang);await drawer.getByText(group,{exact:true}).waitFor();}
  await page.getByText(t.failed,{exact:true}).waitFor();assert.equal(await page.getByText(t.empty,{exact:true}).count(),0);await page.getByRole('button',{name:t.reload,exact:true}).click();await page.locator('[data-port-code="AA000"]').waitFor();
  await page.getByRole('button',{name:t.next,exact:true}).click();await page.locator('[data-port-code="KRPUS"]').waitFor();await page.getByRole('button',{name:t.previous,exact:true}).click();await page.locator('[data-port-code="AA000"]').waitFor();
  const search=page.getByRole('textbox',{name:t.search,exact:true});await search.fill('KRPUS');const used=page.locator('[data-port-code="KRPUS"]');await used.waitFor();assert.equal(await used.getByRole('button',{name:t.remove,exact:true}).isDisabled(),true);
  await used.getByRole('checkbox').click();await page.getByText(t.failed,{exact:true}).waitFor();assert.equal(await search.isDisabled(),true);assert.equal(await search.inputValue(),'KRPUS');await page.getByRole('button',{name:t.retry,exact:true}).click();await page.waitForFunction(()=>window.notices.length===1);assert.deepEqual(posted[0],posted[1]);await used.getByRole('checkbox').waitFor();assert.equal(await used.getByRole('checkbox').isChecked(),false);
  await used.getByRole('checkbox').click();await page.getByText(t.changed,{exact:true}).waitFor();await page.getByRole('button',{name:t.reload,exact:true}).click();await used.waitFor();await used.getByRole('checkbox').click();await page.waitForFunction(()=>window.notices.length===2);
  await search.fill('VNHPH');let unused=page.locator('[data-port-code="VNHPH"]');await unused.waitFor();await unused.getByRole('button',{name:t.remove,exact:true}).click();const confirmation=page.getByRole('dialog');await confirmation.getByText(t.confirmDelete,{exact:true}).waitFor();await confirmation.getByRole('button',{name:lang==='ko'?'확인':lang==='en'?'OK':'Đồng ý',exact:true}).click();await page.getByText(t.empty,{exact:true}).waitFor();
  const state=page.getByRole('combobox',{name:t.state,exact:true});await state.click();await page.getByRole('option',{name:t.DELETED,exact:true}).click();await unused.getByRole('button',{name:t.restore,exact:true}).click();await page.getByText(t.empty,{exact:true}).waitFor();await state.click();await page.getByRole('option',{name:t.INACTIVE,exact:true}).click();await unused.waitFor();assert.equal(await unused.getByRole('checkbox').isChecked(),false);
  assert.equal(await search.inputValue(),'VNHPH');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS SYSTEM port management',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
