import {enterRouteAddress} from './helpers/shipping-route-browser.mjs';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';
import {freightJobEditorText} from '../frontend/src/constants/freightJobEditor.js';
import {routeScopeText} from '../frontend/src/constants/freightRouteScope.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
import {shippingText} from '../frontend/src/constants/shippingRequests.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve('frontend/shipping-general-customer-acceptance.html'),port=43439;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/FreightJobs.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-general-customer-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(18000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const x=shippingEditorText[lang],e=freightJobEditorText[lang],r=routeScopeText[lang],t={...jobText[lang],...shippingText[lang]};
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const a={markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  let job=null,posted=[],searches=[];
  await page.route('**/freight/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname.split('/freight/')[1],headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});let json;
   if(p==='options')json=[{id:11,name:'BARO',code:'BARO'}];
   else if(p==='transport-jobs/options')json={forwarder:{id:7,name:'DEX LOGIS'},employees:[]};
   else if(p==='transport-jobs'&&req.method()==='POST'){
    const input=req.postDataJSON();posted.push(input);assert.equal(input.customerId,null);assert.equal(input.service,'EXPRESS');assert.equal(input.mode,'AIR');assert.equal(input.data.customerRole,null);assert.equal(input.data.generalCustomer,true);assert.equal(input.data.actualRequesterName,'Kim Min Su');assert.equal(input.data.actualRequesterPhone,'0901234567');assert.equal(input.data.shipperParty.name,'Actual sender');assert.equal(input.data.consigneeParty.name,'Actual recipient');
    job={...input,id:'general-sr',number:'SR-GENERAL',customerId:20,version:1,bills:[],data:{...input.data,customer:{id:20,name:x.generalCustomer,isShippingGeneralCustomer:true}}};if(posted.length===1)return route.fulfill({headers,status:500,json:{error:'FAILED_AFTER_COMMIT'}});assert.deepEqual(posted[0],posted[1]);json=job;
   }else if(p==='transport-jobs'){
    const q=url.searchParams.get('search')||'';searches.push(q);const rows=job&&[job.number,job.data.actualRequesterName,job.data.actualRequesterPhone].join(' ').includes(q)?[job]:[];json={rows,total:rows.length};
   }else if(p==='transport-jobs/general-sr'&&req.method()==='PUT'){const input=req.postDataJSON();assert.equal(input.customerId,20);assert.equal(input.data.actualRequesterPhone,'0907654321');job={...job,...input,version:2};json=job;}
   else if(p==='transport-jobs/general-sr')json=job;
   else throw Error('Unexpected route '+p);
   return route.fulfill({headers,json});
  });
  await page.route('**/shipping-requests/presets*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  await page.route('**/shipping-requests/general-sr/charges*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{rows:[],currencies:[]}}));
  await page.goto(`http://127.0.0.1:${port}/shipping-general-customer-acceptance.html`);
  await page.getByRole('button',{name:t.new,exact:true}).click();let dialog=page.getByTestId('shipping-editor');
  await dialog.getByRole('combobox',{name:t.mode,exact:true}).click();await page.getByRole('option',{name:e.EXPRESS,exact:true}).click();
  const customer=dialog.getByRole('textbox',{name:t.customer,exact:true});await customer.fill(x.generalCustomer);await customer.press('Enter');await dialog.getByText(x.generalCustomerHint,{exact:true}).waitFor();
  for(const [role,name]of [['shipper','Actual sender'],['consignee','Actual recipient']]){await page.getByTestId('freight-party-'+role).getByRole('button',{name:x.directParty,exact:true}).click();const party=page.getByRole('dialog').last();await party.getByRole('textbox',{name:x.partyName,exact:true}).fill(name);await party.getByRole('button',{name:x.close,exact:true}).click();}
  await dialog.getByRole('button',{name:r.main,exact:true}).click();await enterRouteAddress(page,'ORIGIN_TERMINAL','SGN airport',x);await enterRouteAddress(page,'DESTINATION_TERMINAL','ICN airport',x);
  await dialog.getByRole('textbox',{name:e.cargo,exact:true}).fill('Personal goods');for(const [key,val]of [['quantity','1'],['lengthM','0.3'],['widthM','0.2'],['heightM','0.1']])await dialog.getByRole('textbox',{name:key==='quantity'?e.quantity:x[key],exact:true}).fill(val);await dialog.getByRole('spinbutton',{name:e.weightKg,exact:true}).fill('2');
  const save=dialog.getByRole('button',{name:t.save,exact:true});assert.equal(await save.isDisabled(),true);await dialog.getByRole('textbox',{name:x.actualRequesterName,exact:true}).fill('Kim Min Su');assert.equal(await save.isDisabled(),true);await dialog.getByRole('textbox',{name:x.actualRequesterPhone,exact:true}).fill('0901234567');assert.equal(await save.isEnabled(),true);
  await save.click();await dialog.getByRole('button',{name:x.retry,exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:x.actualRequesterName,exact:true}).inputValue(),'Kim Min Su');assert.equal(await dialog.getByRole('textbox',{name:x.actualRequesterPhone,exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:x.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText('Kim Min Su',{exact:true}).waitFor();await page.getByText('0901234567',{exact:true}).waitFor();
  await page.getByRole('button',{name:t.edit,exact:true}).click();dialog=page.getByTestId('shipping-editor');assert.equal(await dialog.getByRole('textbox',{name:x.actualRequesterName,exact:true}).inputValue(),'Kim Min Su');await dialog.getByRole('textbox',{name:x.actualRequesterPhone,exact:true}).fill('0907654321');await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:t.back,exact:true}).click();await page.getByRole('row').filter({hasText:'Kim Min Su'}).waitFor();const search=page.getByRole('textbox',{name:t.search,exact:true});for(const q of ['Kim Min Su','0907654321']){await search.fill(q);await page.waitForFunction(()=>document.body.innerText.includes('Kim Min Su'));await page.waitForTimeout(250);assert.ok(searches.includes(q));await page.getByRole('row').filter({hasText:q}).waitFor();}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();console.log('PASS express general customer',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);}
