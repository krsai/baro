import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ENTITY_CODE_TEXT} from '../frontend/src/utils/entityCode.mjs';
const fixture=path.resolve('frontend/entity-code-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/organization/OrganizationDetail.jsx';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const port=43360,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/entity-code-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,updateActiveProfile:()=>{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:(message)=>{window.notifications??=[];window.notifications.push(message);},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let entity={id:1,type:'MANUFACTURER',name:'BARO GARMENT',nameKo:'BARO',nameVi:'BARO',code:'BRVN',country:'VN'};
  await page.route('**/organizations/primary*',r=>r.fulfill({headers,json:entity}));
  await page.route('**/employees**',r=>r.fulfill({headers,json:[]}));
  await page.route('**/entities/*/bank-accounts*',r=>r.fulfill({headers,json:{accounts:[],currencies:[]}}));
  await page.route('**/organizations/1*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   const body=r.request().postDataJSON();writes.push(body);
   if(body.code==='TAKEN')return r.fulfill({headers,status:409,json:{error:'PARTNER_CODE_CONFLICT'}});
   entity={...entity,...body,code:body.code||'BAROGA'};return r.fulfill({headers,json:entity});
  });
  await page.goto(`http://127.0.0.1:${port}/entity-code-acceptance.html`);
  const code=page.locator('input[name="code"]'),save=page.getByRole('button',{name:/^(저장|Save|Lưu)$/});await code.waitFor();assert.equal(await code.isEnabled(),true);await code.fill('TAKEN');await save.click();
  await page.waitForFunction(()=>window.notifications?.length);assert.equal(await page.evaluate(()=>window.notifications.at(-1)),ENTITY_CODE_TEXT[lang].conflict);assert.equal(await code.inputValue(),'TAKEN');
  await code.fill('');await save.click();await page.waitForFunction(()=>document.querySelector('input[name="code"]')?.value==='BAROGA');assert.equal(writes.at(-1).code,'');
  await code.fill('NEW-01');await save.click();await page.waitForFunction(()=>window.notifications?.length===3);assert.equal(writes.at(-1).code,'NEW-01');
  await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Own company code ko/en/vi: editable, duplicate preserves input, empty generates saved code, explicit save and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
