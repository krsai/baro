import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {jobText} from '../frontend/src/constants/freightJobs.js';
import {shippingText} from '../frontend/src/constants/shippingRequests.js';
const file=path.resolve('frontend/detail-save-acceptance.html'),port=43548;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/ShippingRequests.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/detail-save-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const orgType of ['SERVICE','BRAND']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t={...jobText[lang],...shippingText[lang]};page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  let discard=false;page.on('dialog',dialog=>discard?dialog.accept():dialog.dismiss());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,activeOrgType:'${orgType}'});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  const self={id:7,name:'CUSTOMER'},other={id:12,name:'CONSIGNEE'},forwarder={id:9,name:'FORWARDER'};
  let job={id:'job1',number:'JOB-001',orgId:9,mode:'ROAD',service:'GENERAL',status:'DRAFT',receiptStatus:orgType==='SERVICE'?'ACCEPTED':'PENDING',customerId:7,version:1,bills:[],data:{customer:self,customerRole:'shipper',shipperId:7,shipperParty:self,consigneeId:12,consigneeParty:other,notifySameAsConsignee:true,origin:'HANOI',destination:'HCMC',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},remark:'ORIGINAL',cargo:'CLOTHES'}};
  let writes=0,fail=true;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const projection=()=>({...job,ownerOrgId:9,request:{mode:job.mode,service:job.service,status:job.status,data:job.data},shared:null,documents:[]});
  await page.route('**/freight/**',async route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});
   const p=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(p==='options')json=[self,other];
   else if(p==='transport-jobs/options')json={forwarder,employees:[]};
   else if(p==='transport-jobs')json={rows:[job],total:1};
   else if(p==='transport-jobs/job1'&&req.method()==='PUT'){
    writes++;const input=req.postDataJSON();assert.equal(input.version,job.version);assert.equal(input.customerId,7);
    if(fail)return route.fulfill({headers,status:409,json:{error:'FREIGHT_CHANGED'}});
    job={...job,...input,version:job.version+1};json=job;
   }else if(p==='transport-jobs/job1')json=job;else throw Error('Unexpected '+p);
   return route.fulfill({headers,json});
  });
  await page.route('**/shipping-requests**',async route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});
   const p=new URL(req.url()).pathname.split('/shipping-requests')[1];let json;
   if(p==='/options')json={self,forwarders:[forwarder],customers:[]};
   else if(['/presets','/parties'].includes(p))json=[];
   else if(p==='/job1'&&req.method()==='POST'){
    writes++;const input=req.postDataJSON();assert.equal(input.action,'EDIT');assert.equal(input.version,job.version);
    if(fail)return route.fulfill({headers,status:409,json:{error:'SHIPPING_CHANGED'}});
    job={...job,mode:input.mode,data:input.data,version:job.version+1};json={id:job.id,version:job.version};
   }else if(p==='/job1')json=projection();else if(!p)json=[{...job,company:'FORWARDER'}];else throw Error('Unexpected '+p);
   return route.fulfill({headers,json});
  });
  await page.goto(`http://127.0.0.1:${port}/detail-save-acceptance.html`);
  await page.locator('[data-shipping-row="job1"]').waitFor();await page.locator('[data-table-status=loading]').waitFor({state:'hidden'});await page.locator('[data-shipping-row="job1"] td').first().click();
  const form=page.getByTestId('shipping-detail-form');await form.waitFor();assert.equal(await page.getByRole('dialog').count(),0);
  const remark=form.locator('textarea').first(),save=form.getByRole('button',{name:t.save,exact:true});
  await remark.fill('MY UNSAVED REMARK');assert.equal(writes,0);
  await page.locator('.app-page-header').getByRole('button').first().click();assert.equal(await remark.inputValue(),'MY UNSAVED REMARK');
  const failed=page.waitForResponse(response=>response.status()===409);await save.click();await failed;
  await page.waitForFunction(label=>[...document.querySelectorAll('[data-testid="shipping-detail-form"] button')].some(button=>!button.disabled&&button.textContent.trim()===label),t.save);
  assert.equal(writes,1);assert.equal(await remark.inputValue(),'MY UNSAVED REMARK');
  fail=false;await save.click();
  await page.waitForFunction(label=>[...document.querySelectorAll('[data-testid="shipping-detail-form"] button')].some(button=>button.disabled&&button.textContent.trim()===label),t.save);
  assert.equal(writes,2);assert.equal(job.data.remark,'MY UNSAVED REMARK');assert.equal(await remark.inputValue(),'MY UNSAVED REMARK');
  await remark.fill('SECOND CHANGE');await save.click();
  await page.waitForFunction(label=>[...document.querySelectorAll('[data-testid="shipping-detail-form"] button')].some(button=>button.disabled&&button.textContent.trim()===label),t.save);
  assert.equal(writes,3);assert.equal(job.data.remark,'SECOND CHANGE');assert.equal(job.version,3);
  await remark.fill('DISCARD THIS');discard=true;await page.locator('.app-page-header').getByRole('button').first().click();await page.locator('[data-shipping-row="job1"]').waitFor();assert.equal(writes,3);assert.equal(job.data.remark,'SECOND CHANGE');assert.deepEqual(errors,[]);
  await page.close();console.log('PASS direct detail editing, no automatic writes, failed save preserves input, repeat save revision, discard',orgType,lang,width);
 }
}finally{await browser?.close();vite.kill();unlinkSync(file);}
