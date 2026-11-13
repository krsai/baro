import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const fixture='frontend/shipping-menu-acceptance.html',port=43434;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Layout from'/src/layouts/MainLayout.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/shipping']},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},React.createElement(Route,{path:'/shipping',element:React.createElement('h1',null,'Shipping content')}))))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-menu-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const type of ['MANUFACTURER','SERVICE','BRAND']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const profile={entryType:'ORG',orgId:7,orgType:'${type}',orgRole:'ADMIN',orgName:'Test company',employeeName:'Admin',employeeId:1};export const useAuth=()=>({activeOrgId:7,activeOrgType:'${type}',activeProfile:profile,accessProfile:profile,isAuthenticated:true,user:{},signOut:()=>{}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const actions=new Proxy({},{get:()=>()=>{}}),state={sidebarOpen:true,openTabs:[{id:'/shipping',path:'/shipping',label:'Transport list'}],notification:null};export const useAppActions=()=>actions;export const useAppState=()=>state;"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  await page.route('**/src/utils/accessControl*',r=>r.fulfill({contentType:'application/javascript',body:"export const canAccessPath=()=>true;export const resolveFirstAccessiblePath=()=>'/shipping';"}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/expense-approval-overview?*',r=>r.fulfill({headers,json:{total:0}}));
  for(const path of ['expense-deletion-requests','change-approval-requests','customers','org-memberships'])await page.route('**/'+path+'?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/system/onboarding-requests',r=>r.fulfill({headers,json:{pendingCompanyRequests:[]}}));
  await page.goto(`http://127.0.0.1:${port}/shipping-menu-acceptance.html`,{timeout:90000});
  const [name,old]=await page.evaluate(async lang=>{const {getUiMessage}=await import('/src/constants/uiMessages.js');return [getUiMessage('menu.transportList','Transport list',lang),getUiMessage('menu.transportExchange','Transport exchange',lang)];},lang);
  const drawer=page.locator('.MuiDrawer-paper:visible');await drawer.getByText(name,{exact:true}).waitFor();assert.equal(await drawer.getByText(name,{exact:true}).count(),1);assert.equal(await drawer.getByText(old,{exact:true}).count(),0);
  await page.setViewportSize({width:390,height:900});await page.locator('.MuiDrawer-paper:visible').getByText(name,{exact:true}).waitFor();assert.equal(await page.locator('.MuiDrawer-paper:visible').getByText(old,{exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS actual shipping menu',lang,type);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
