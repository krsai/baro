import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const fixture='frontend/main-layout-badge-acceptance.html';assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Layout from'/src/layouts/MainLayout.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/dashboard']},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Layout)},React.createElement(Route,{path:'/dashboard',element:React.createElement('h1',null,'Dashboard content')}))))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43377','--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43377/'+fixture.split('/').pop())).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let pending=2;page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const profile={entryType:'ORG',orgId:7,orgType:'MANUFACTURER',orgRole:'ADMIN',orgName:'Test company',employeeName:'Admin',employeeId:1};export const useAuth=()=>({activeOrgId:7,activeProfile:profile,accessProfile:profile,isAuthenticated:true,user:{},signOut:()=>{}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions=new Proxy({},{get:()=>()=>{}}),state={sidebarOpen:false,openTabs:[{id:'/dashboard',path:'/dashboard',label:'Dashboard'}],notification:null};export const useAppActions=()=>actions;export const useAppState=()=>state;`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  await page.route('**/src/utils/accessControl*',r=>r.fulfill({contentType:'application/javascript',body:`export const canAccessPath=()=>true;export const resolveFirstAccessiblePath=()=>'/dashboard';`}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/expense-approval-overview?*',r=>r.fulfill({headers,json:{total:pending}}));
  for(const path of ['expense-deletion-requests','change-approval-requests','customers'])await page.route('**/'+path+'?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/org-memberships?*',r=>r.fulfill({headers,json:[{status:'PENDING'}]}));
  await page.route('**/system/onboarding-requests',r=>r.fulfill({headers,json:{pendingCompanyRequests:[]}}));
  await page.goto('http://127.0.0.1:43377/'+fixture.split('/').pop(),{timeout:90000});await page.getByRole('heading',{name:'Dashboard content',exact:true}).waitFor();
  const label={ko:'미처리 결재',en:'Pending approvals',vi:'Chờ duyệt'}[lang];await page.getByLabel(label+': 2',{exact:true}).waitFor({state:'attached'});assert.deepEqual(errors,[]);
  pending=0;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByLabel(label+': 2',{exact:true}).waitFor({state:'detached'});assert.deepEqual(errors,[]);await page.close();console.log('PASS actual MainLayout badges',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
