import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {freightWorkflowText} from '../frontend/src/constants/freightWorkflow.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
const file=path.resolve('frontend/freight-workflow-acceptance.html'),port=43427;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import '/src/styles/form.css';import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/FreightJobs.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/freight?id=job1']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/freight',element:React.createElement(Page)}),React.createElement(Route,{path:'/shipping',element:React.createElement('div',null,'Customer requests')})))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/freight-workflow-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],w=freightWorkflowText[lang],t=jobText[lang];page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:7,activeOrgType:'SERVICE'});"}));
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
  await page.goto(`http://127.0.0.1:${port}/freight-workflow-acceptance.html`);
  await page.getByRole('tab',{name:(shippingWorkbenchText[lang]||shippingWorkbenchText.en).documents,exact:true}).click().catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e;});assert.equal(chargeReads,0);
  const composition=page.getByRole('combobox',{name:w.composition,exact:true});await composition.click().catch(async e=>{console.log('SETUP DEBUG',errors,await page.locator('body').innerText(),await page.locator('[role="combobox"]').evaluateAll(rows=>rows.map(row=>row.outerHTML)));throw e;});await page.getByRole('option',{name:w.MASTER_HOUSE,exact:true}).click();
  fail=true;await page.getByRole('button',{name:w.save,exact:true}).click();await page.waitForFunction(message=>(window.workflowNotices||[]).includes(message),t.conflict);assert.ok((await composition.innerText()).includes(w.MASTER_HOUSE));
  fail=false;await page.getByRole('button',{name:w.save,exact:true}).click();await page.getByRole('button',{name:t.addHouse,exact:true}).waitFor();assert.equal(job.data.documentSetup.documentType,'AIR_WAYBILL');assert.equal(writes,2);
  assert.equal(await page.getByRole('button',{name:t.addHouse,exact:true}).isEnabled(),true);
  await Promise.all([page.waitForResponse(response=>response.url().includes('/shipping-requests/job1/charges')),page.getByRole('tab',{name:(shippingWorkbenchText[lang]||shippingWorkbenchText.en).charges,exact:true}).click()]);await page.getByRole('button',{name:(shippingWorkbenchText[lang]||shippingWorkbenchText.en).addCharge,exact:true}).waitFor();assert.ok(chargeReads>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage();let calls=0;
 await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:7,activeOrgType:'MANUFACTURER'});"}));
 await page.route('**/freight/**',r=>{calls++;return r.abort();});
 await page.goto(`http://127.0.0.1:${port}/freight-workflow-acceptance.html`);await page.getByText('Customer requests',{exact:true}).waitFor();assert.equal(calls,0);await page.close();
 console.log('PASS: forwarder workflow ko/en/vi PC/mobile, failed save preserves selection, setup persistence, charges, customer direct route rejection.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
