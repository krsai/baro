import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {freightWorkflowText} from '../frontend/src/constants/freightWorkflow.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
const file=path.resolve('frontend/shipping-overview-acceptance.html'),port=43541;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import '/src/styles/form.css';import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';import {PageNamingProvider} from '/src/context/PageNamingContext';import '/src/styles/table.css';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/ShippingRequests.jsx';
function Named(){const loc=useLocation();return React.createElement(PageNamingProvider,{path:loc.pathname+loc.search},React.createElement(Page));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/shipping',element:React.createElement(Named)}),React.createElement(Route,{path:'/freight',element:React.createElement('div',null,'Customer requests')})))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-overview-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const orgType of ['SERVICE','BRAND']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],w=freightWorkflowText[lang],t=jobText[lang];page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,activeOrgType:'${orgType}'});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(message)=>{window.workflowNotices=[...(window.workflowNotices||[]),message];},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  let job={id:'job1',number:'JOB-001',orgId:7,mode:'AIR',service:'GENERAL',receiptStatus:'ACCEPTED',status:'DRAFT',version:1,data:{customer:{name:'BARO'},origin:'HAN',destination:'ICN'},bills:[]},writes=0,chargeReads=0,fail=false;
  await page.route('**/freight/**',async route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});
   const p=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(p==='options')json=[];
   else if(p==='transport-jobs/options')json={forwarder:{id:7,name:'DEX'},employees:[]};
   else if(p==='transport-jobs/job1/document-setup'){writes++;if(fail)return route.fulfill({headers,status:409,json:{error:'FREIGHT_CHANGED'}});job={...job,version:job.version+1,data:{...job.data,documentSetup:req.postDataJSON()}};json=job;}
   else if(p==='transport-jobs/job1')json=job;
   else if(p==='transport-jobs')json={rows:[job],total:1};
   else throw Error('Unexpected '+p);
   await route.fulfill({headers,json});
  });
  await page.route('**/shipping-requests/job1/charges*',route=>{chargeReads++;return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{rows:[],currencies:[]}});});
  if(orgType==='BRAND')await page.route('**/shipping-requests**',route=>{const url=new URL(route.request().url()),headers={'Access-Control-Allow-Origin':'*'};return route.fulfill({headers,json:url.pathname.endsWith('/options')?{self:{id:7,name:'BRAND'},forwarders:[]}:url.pathname.endsWith('/job1')?{...job,request:{mode:'AIR',status:'DRAFT',data:{origin:'HAN'}},shared:null,documents:[]}:[{...job,company:'DEX'}]});});
  await page.goto(`http://127.0.0.1:${port}/shipping-overview-acceptance.html`);

  const expected=async path=>page.evaluate(async({path,lang})=>{const {resolvePageNaming}=await import('/src/utils/pageNaming.mjs');const {getUiMessage}=await import('/src/constants/uiMessages.js');return resolvePageNaming(path,lang,key=>getUiMessage(key,key,lang)).title;},{path,lang});
  const heading=page.getByRole('heading',{level:1});await heading.waitFor();assert.equal(await heading.textContent(),await expected('/shipping'));
  const row=page.locator('[data-shipping-row="job1"]');await row.waitFor();await page.locator('[data-table-status=loading]').waitFor({state:'hidden'});if(orgType==='BRAND'){
   assert.equal(await row.locator('td').count(),5);await row.locator('td').nth(3).click();await page.waitForFunction(()=>document.querySelector('.app-page-header')?.textContent.includes('JOB-001'));assert.equal(await heading.textContent(),await expected('/shipping?id=job1'));assert.equal(await page.getByRole('button',{name:t.edit,exact:true}).isDisabled(),true);
   await page.locator('.app-page-header').getByRole('button').first().click();await row.waitFor();await page.locator('[data-table-status=loading]').waitFor({state:'hidden'});await row.focus();await row.press(' ');await page.waitForFunction(()=>document.querySelector('.app-page-header')?.textContent.includes('JOB-001'));assert.deepEqual(errors,[]);await page.close();console.log('PASS customer shipping title, row click/Space and receipt edit restriction',lang,width);continue;
  }
  assert.equal(await row.locator('td').count(),7);
  await row.locator('td').nth(4).click();await page.getByRole('tab',{name:w.basic,exact:true}).waitFor();assert.equal(await heading.textContent(),await expected('/shipping?id=job1'));assert.equal(await page.locator('.app-page-header').getByText('JOB-001',{exact:true}).count(),1);assert.equal(await page.locator('.app-page-content').getByText('JOB-001',{exact:true}).count(),0);
  await page.getByRole('button',{name:t.back,exact:true}).click();await row.waitFor();await page.locator('[data-table-status=loading]').waitFor({state:'hidden'});await row.focus();await row.press('Enter');await page.getByRole('tab',{name:w.basic,exact:true}).waitFor();
  await page.getByRole('tab',{name:w.setup,exact:true}).click();await page.getByRole('combobox',{name:w.composition,exact:true}).waitFor();assert.equal(chargeReads,0);assert.equal(writes,0);assert.equal(await page.locator('.app-page-content').getByText('BARO',{exact:true}).count(),0);
  assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS shipping overview title, row click/Enter, compact list, stage isolation',lang,width);
 }
}finally{await browser?.close();vite.kill();unlinkSync(file);}
