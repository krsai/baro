import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';

const fixture='frontend/app-review-acceptance.html',port=43438;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Detail from'/src/pages/App/style/StyleDetail.jsx';import Info from'/src/pages/App/style/styleDetail/StyleInfo.jsx';
const root=createRoot(document.getElementById('root'));window.company=1;window.notices=[];window.render=()=>root.render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/style/1']},new URL(location.href).searchParams.get('mode')==='customers'?React.createElement(Info,{formData:{},handleInputChange:()=>{}}):React.createElement(Routes,null,React.createElement(Route,{path:'/style/:styleId',element:React.createElement(Detail)})))));window.render();</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/app-review-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],customers=[];let reads=0,serverName='Real saved style';
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:window.company,activeOrgType:'MANUFACTURER',activeProfile:{orgName:'BARO'}});"}));
    await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},showNotification:(message,level)=>window.notices.push({message,level})};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:window.reviewLanguage||'${lang}'});`}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    await page.route(/\/styles\/1(?:\?|$)/,r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});reads++;return r.fulfill(reads===1?(lang==='en'?{headers,json:{}}:{headers,status:503,json:{error:'temporary unavailable'}}):{headers,json:{id:1,ownerOrgId:1,customerOrgId:2,styleCode:'REAL-1',name:serverName,customer:'THE SAN',processes:[]}});});
    await page.route(/\/customers(?:\?|$)/,r=>{const org=Number(new URL(r.request().url()).searchParams.get('orgId'));customers.push(org);return r.fulfill({headers,json:[{id:org*10,brandOrgId:org*10,name:'Company '+org+' customer'}]});});
    await page.route('**/attributes?*',r=>r.fulfill({headers,json:{categories:[]}}));
    await page.goto(`http://127.0.0.1:${port}/app-review-acceptance.html`);
    const retry={ko:'다시 조회',en:'Retry',vi:'Thử lại'}[lang];
    await page.getByRole('button',{name:retry,exact:true}).waitFor();
    assert.equal(await page.locator('input[name="name"]').count(),0,'failed load must not produce a dummy editable style');
    const save=page.locator('button.MuiButton-contained').first();assert.equal(await save.isDisabled(),true);
    await page.getByRole('button',{name:retry,exact:true}).click();
    await page.locator('input[name="name"]').waitFor();assert.equal(await page.locator('input[name="name"]').inputValue(),'Real saved style');assert.equal(reads,2);
    serverName='Updated server style';
    const fresh=await page.evaluate(async()=>{const {fetchStyleById}=await import('/src/utils/styleApi.js');return fetchStyleById(1,{orgId:1,forceRefresh:true});});
    assert.equal(fresh.name,serverName,'force refresh must bypass the common API cache as well');
    await page.locator('input[name="name"]').fill('Unsaved style draft');
    await page.evaluate(()=>{window.reviewLanguage='en';window.render();});
    assert.equal(await page.locator('input[name="name"]').inputValue(),'Unsaved style draft','language change must preserve the edit');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.goto(`http://127.0.0.1:${port}/app-review-acceptance.html?mode=customers`);
    await page.waitForResponse(r=>r.url().includes('/customers?orgId=1'));
    await page.evaluate(()=>{window.company=2;window.render();});
    await page.waitForResponse(r=>r.url().includes('/customers?orgId=2'));
    assert.ok(customers.includes(1)&&customers.includes(2),'customer lookup must be scoped to the newly selected company');
    assert.deepEqual(errors,[]);await page.close();console.log('PASS app review: failed-style retry, no dummy form, fresh cache, retained draft, company-scoped lookups',lang,width);
  }
} finally {await browser?.close();server.kill();unlinkSync(fixture);}
