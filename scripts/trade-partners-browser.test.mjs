import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/trade-partners-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {MemoryRouter} from 'react-router-dom';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/TradePartners.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/business-partner']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const port=43215,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/trade-partners-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const restricted of [false,true]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],reads=[];
  page.on('pageerror',e=>errors.push(e.message));
  const profile=restricted?{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'OPERATOR',accessPolicy:{__schemaVersion:11,MANUFACTURER:{OPERATOR:['MATERIAL_SUPPLIER']}}}:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN'};
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({isAuthenticated:true,activeOrgId:1,activeOrgRole:'${profile.orgRole}',accessProfile:${JSON.stringify(profile)}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:(path)=>{window.partnerNavigation=path;},showNotification:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/customers?*',r=>{reads.push('customers');return r.fulfill({headers,json:[{id:7,entityId:44,brandOrgId:44,name:'THE SAN',code:'SAN',country:'KR',manager:'Contact',phoneNumber:'01234',email:'san@example.com'}]});});
  await page.route('**/business-partners?*',r=>{const type=new URL(r.request().url()).searchParams.get('type');reads.push(type);return r.fulfill({headers,json:[{id:type==='MATERIAL_SUPPLIER'?55:66,name:type==='MATERIAL_SUPPLIER'?'Supplier A':'Vendor A',type,isActive:true,hasUsageHistory:true,serviceTypes:[]}]});});
  await page.route('**/business-partners/*/history?*',r=>r.fulfill({headers,json:{records:[{id:1,workDate:'2026-10-20',styleCode:'STYLE',processName:'Buttonhole',quantity:10,unitPrice:100,amount:1000}],costs:[]}}));
  await page.route('**/entities/*/bank-accounts?*',r=>r.fulfill({headers,json:{accounts:[],currencies:[{id:1,code:'VND'}]}}));
  await page.route('**/expense-types*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/outsourcing-service-types?*',r=>r.fulfill({headers,json:[]}));
  await page.goto(`http://127.0.0.1:${port}/trade-partners-acceptance.html`);
  const nav=page.locator('nav'),branches=nav.getByRole('button');
  assert.equal(await page.locator('h1').count(),1);
  await branches.first().waitFor();assert.equal(await branches.count(),restricted?1:3);
  if(restricted){await page.getByText('Supplier A',{exact:true}).waitFor();assert.deepEqual(reads,['MATERIAL_SUPPLIER']);}
  else{
   await page.getByText('THE SAN',{exact:true}).waitFor();assert.deepEqual(reads,['customers']);
   const headers=await page.locator('[data-testid=partner-directory] thead th').allTextContents();
   assert.equal(headers.length,9);
   await page.locator('tbody tr').first().dblclick();assert.equal(await page.evaluate(()=>window.partnerNavigation),'/customer/7','Customer relationship FK must remain intact');
   await branches.nth(1).click();await page.getByText('Vendor A',{exact:true}).waitFor();
   assert.deepEqual(await page.locator('[data-testid=partner-directory] thead th').allTextContents(),headers);
   assert.equal(await page.getByRole('button',{name:lang==='ko'?'\uAC70\uB798\uCC98 \uB4F1\uB85D':lang==='vi'?'Th\u00eam \u0111\u1ed1i t\u00e1c':'Add partner',exact:true}).isEnabled(),true);
   await page.locator('tbody tr').first().getByRole('button',{name:lang==='ko'?'\uB0B4\uC5ED\uBCF4\uAE30':lang==='vi'?'Xem l\u1ecbch s\u1eed':'View history',exact:true}).click();await page.getByText('Buttonhole',{exact:true}).waitFor();await page.keyboard.press('Escape');
   await branches.nth(2).click();await page.getByText('Supplier A',{exact:true}).waitFor();
   assert.deepEqual(await page.locator('[data-testid=partner-directory] thead th').allTextContents(),headers);
   assert.ok(reads.includes('PROCESS_OUTSOURCING'));assert.ok(reads.includes('MATERIAL_SUPPLIER'));
  }
  for(const width of [768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Partner table must scroll within its panel');}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Unified partners passed ko/en/vi: one title, role tree, customer FK navigation, vendor history, supplier view, restricted permissions and responsive panels.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
