import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/ledger-changes-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import Dashboard from'/src/pages/App/WorkspaceDashboard.jsx';
function App(){const[orgId,setOrg]=React.useState(7),[role,setRole]=React.useState(window.initialRole||'ADMIN');window.setOrg=setOrg;window.setRole=setRole;window.currentOrg=orgId;window.currentRole=role;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Dashboard)));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43271,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-changes-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],queries=[];let orderReads=0;
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2026-10-31T12:00:00+07:00')});
  await page.addInitScript(role=>{window.initialRole=role;},lang==='en'?'ACCOUNTANT':'ADMIN');
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>{const profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:window.currentRole,orgId:window.currentOrg};return {isAuthenticated:true,activeOrgId:window.currentOrg,activeProfile:profile,accessProfile:profile};};"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"const actions={navigateToPath:p=>window.destination=p,showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;export const useAppState=()=>({});"}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  await page.route('**/orders?*',r=>{orderReads++;return r.fulfill({headers,json:[]});});
  for(const endpoint of ['assignment-board-view','org-memberships','customers'])await page.route(`**/${endpoint}?*`,r=>r.fulfill({headers,json:endpoint==='assignment-board-view'?{assignments:[]}:[]}));
  await page.route('**/approval-reviews?*',r=>r.fulfill({headers,json:{rows:[],total:0}}));
  await page.route('**/bank-ledger/changes?*',r=>{queries.push(r.request().url());return r.fulfill({headers,json:{rows:[],total:0}});});
  await page.goto(`http://127.0.0.1:${port}/ledger-changes-acceptance.html`);
  await page.getByRole('heading',{level:1}).waitFor();
  assert.equal(await page.getByTestId('ledger-changes-dashboard').count(),0);assert.equal(queries.length,0);
  await page.evaluate(()=>window.setOrg(8));await page.getByRole('heading',{level:1}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.setRole('OPERATOR'));
  assert.equal(await page.getByTestId('ledger-changes-dashboard').count(),0);assert.equal(queries.length,0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Dashboard passed ko/en/vi: dashboard remains visible, ledger history card and its requests remain absent across company/role changes and mobile.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
