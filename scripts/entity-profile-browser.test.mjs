import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/entity-profile-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';
import Board from '/src/pages/App/organization/OrganizationBoard.jsx';import Panel from '/src/pages/App/customer/CustomerBasicInfoPanel.jsx';import Dialog from '/src/components/BusinessPartnerDialog.jsx';import Container from '/src/components/AppPageContainer.jsx';
const screen=new URLSearchParams(location.search).get('screen');
const customer={id:7,entityId:44,industry:'BRAND',name:'THE SAN',code:'TSKR',nameKo:'San',nameVi:'THE SAN',businessNumber:'0123456789',manager:'Contact',countryCode:'+82',phoneNumber:'0123',email:'contact@example.com',address:'Address',country:'KR',defaultSizeSetCode:'ALPHA'};
const element=screen==='organization'?React.createElement(Board):screen==='customer'?React.createElement(Container,{title:'Customer'},React.createElement(Panel,{customerFormData:customer,countryOptions:[{value:'KR',label:'Korea'}],languageCode:'en',onBasicFieldChange:()=>{},onCountryChange:()=>{},t:key=>key})):React.createElement(Dialog,{open:true,partner:{id:44,name:'Vendor',type:'PROCESS_OUTSOURCING'},activeOrgId:1,languageCode:'en',onClose:()=>{}});
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),element)));
</script></body></html>`);
const port=43211,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/entity-profile-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const screen of ['organization','customer','partner'])for(const width of [1440,768,390]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[],bankEntities=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,updateActiveProfile:()=>{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*'};
  await page.route('**/organizations/primary*',r=>r.fulfill({headers,json:{id:1,type:'MANUFACTURER',name:'BARO GARMENT',nameKo:'BARO',nameVi:'BARO',code:'BRVN',country:'VN'}}));
  await page.route('**/employees**',r=>r.fulfill({headers,json:[]}));
  await page.route('**/expense-types*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/outsourcing-service-types*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/entities/*/bank-accounts*',r=>{bankEntities.push(Number(new URL(r.request().url()).pathname.split('/')[2]));return r.fulfill({headers,json:{accounts:[],currencies:[{id:1,code:'VND'}]}});});
  await page.goto(`http://127.0.0.1:${port}/entity-profile-acceptance.html?screen=${screen}`);
  await page.getByRole('heading',{name:'Bank accounts',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[role="progressbar"]'));
  assert.ok(bankEntities.includes(screen==='organization'?1:44));assert.ok(!bankEntities.includes(7),'Customer relationship ID must not be used as entity ID');
  assert.deepEqual(errors,[]);
  if(screen==='organization')assert.equal(await page.locator('h1').count(),1,'Embedded business form must not repeat its page title');
  if(screen!=='partner'){
   const names=page.locator('input[name="name"],input[name="nameKo"],input[name="nameVi"]');
   const boxes=await names.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
   assert.equal(boxes.length,3);assert.ok(boxes.every(box=>box.width>90));
   if(width===1440){assert.ok(Math.abs(boxes[0].y-boxes[2].y)<2);assert.ok(boxes[1].x>boxes[0].x);}
   if(width===390)assert.ok(boxes[1].y>boxes[0].y);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Form must not overflow the viewport');
  await page.close();
 }
 console.log('Shared entity forms passed at desktop, tablet and mobile widths; customer bank lookup uses actual entity FK.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
