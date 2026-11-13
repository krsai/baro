import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {shippingText} from '../frontend/src/constants/shippingRequests.js';
import {freightText} from '../frontend/src/constants/freight.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
import {freightJobEditorText} from '../frontend/src/constants/freightJobEditor.js';
import {routeScopeText} from '../frontend/src/constants/freightRouteScope.js';
const file=path.resolve('frontend/shipping-requests-acceptance.html'),port=43433;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/ShippingRequests.jsx';window.notices=[];createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-requests-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  let job=null,submits=0,accepts=0,clientKey=null,presets=[],presetAttempts=0,posted=[];const t={...freightText[lang],...shippingText[lang]},ownerText={...jobText[lang],...shippingText[lang]},errors=[];
  const makePage=async service=>{
   const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(18000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});page.on('response',r=>{if(r.status()>=400&&r.url().includes('127.0.0.1'))console.error('LOAD_ERROR',r.status(),new URL(r.url()).pathname);});
   await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:${service?2:1},activeOrgType:'${service?'SERVICE':(lang==='vi'?'BRAND':'MANUFACTURER')}'});`}));
   await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
   await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(message,level)=>window.notices.push({message,level}),setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   await page.route(/\/shipping-requests(?:[/?]|$)/,async r=>{
    const req=r.request(),p=new URL(req.url()).pathname;if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});let json;
    if(p.endsWith('/options'))json={self:{id:1,code:'BARO',name:'BARO'},forwarders:[{id:2,code:'DEXL',name:'DEX'}],customers:[{id:12,code:'BUYER',name:'Buyer'}]};
    else if(p.includes('/presets')){const url=new URL(req.url());if(req.method()==='GET')json=presets.filter(row=>row.customerId===Number(url.searchParams.get('customerId'))&&row.kind===url.searchParams.get('kind'));else if(req.method()==='DELETE'){presets=presets.filter(row=>row.id!==p.split('/').at(-1));json={};}else{const v=req.postDataJSON();presetAttempts++;if(!presets.some(row=>row.id===v.id))presets.push({...v,version:1});if(presetAttempts===1)return r.fulfill({headers,status:500,json:{error:'FAILED_AFTER_COMMIT'}});json=presets.find(row=>row.id===v.id);}}
    else if(p.endsWith('/charges'))json={rows:[],currencies:[{code:'USD',name:'USD'}]};
    else if(req.method()==='GET')json=p.endsWith('/sr-1')?{id:job.id,number:job.number,ownerOrgId:2,company:'DEX',receiptStatus:job.receiptStatus,version:job.version,request:job.requestSnapshot,shared:job.sharedSnapshot,documents:[]}:job?[{id:job.id,number:job.number,company:'DEX',receiptStatus:job.receiptStatus}]:[];
    else if(p.endsWith('/sr-1')){const body=req.postDataJSON();if(body.action==='ACCEPT'){accepts++;assert.equal(body.version,job.version);job={...job,receiptStatus:'ACCEPTED',version:job.version+1};}else if(body.action==='PUBLISH'){job={...job,version:job.version+1,sharedSnapshot:{mode:'SEA',status:'BOOKED',data:{...job.data,eta:'2026-12-01'}}};}else throw Error('Unexpected action');json={id:job.id,version:job.version};}
    else{const v=req.postDataJSON();submits++;posted.push(v);if(clientKey)assert.equal(v.clientKey,clientKey);clientKey=v.clientKey;assert.equal(v.forwarderOrgId,2);assert.equal(v.data.cargo,'Garments');if(submits===1)return r.fulfill({headers,status:409,json:{error:'SHIPPING_CUSTOMER_MAPPING_REQUIRED'}});job={id:'sr-1',number:'SR-001',version:1,receiptStatus:'PENDING',status:'DRAFT',mode:v.mode,requestSnapshot:{mode:v.mode,status:'DRAFT',data:v.data},sharedSnapshot:null,data:{...v.data,customer:{name:'BARO'}},bills:[]};if(submits===2)return r.fulfill({headers,status:500,json:{error:'FAILED_AFTER_COMMIT'}});json={id:job.id};}
    await r.fulfill({headers,json});
   });
   await page.route('**/freight/**',async r=>{
    const req=r.request(),p=new URL(req.url()).pathname;if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});let json;
    if(p==='/freight/options')json=[{id:11,code:'BARO',name:'BARO',address:'Factory'},{id:12,code:'BUYER',name:'Buyer',address:'Warehouse'}];
    else if(p.endsWith('/options'))json={forwarder:{id:2,code:'DEXL',name:'DEX'},employees:[]};
    else if(p.endsWith('/sr-1'))json=job;
    else if(req.method()==='POST'){const v=req.postDataJSON();assert.equal(v.customerId,11);assert.ok(v.data.workScope);job={...v,id:'sr-2',number:'SR-002',receiptStatus:'ACCEPTED',version:1,bills:[],status:'DRAFT'};json=job;}
    else if(p.endsWith('/sr-2'))json=job;
    else json={rows:job?[job]:[],total:job?1:0};
    await r.fulfill({headers,json});
   });return page;
  };
  const customer=await makePage(false);await customer.goto(`http://127.0.0.1:${port}/shipping-requests-acceptance.html`);
  await customer.getByRole('button',{name:t.new,exact:true}).click();const dialog=customer.getByRole('dialog');
  const e=freightJobEditorText[lang],x=shippingEditorText[lang];
  const partner=dialog.getByRole('textbox',{name:e.forwarderCompany,exact:true});await partner.fill('DEXL');await partner.press('Enter');assert.equal(await partner.inputValue(),'DEX');
  assert.equal(await dialog.getByRole('textbox',{name:t.customer,exact:true}).inputValue(),'BARO');assert.equal(await dialog.getByRole('textbox',{name:t.customer,exact:true}).getAttribute('readonly'),'');
  const cnee=customer.getByTestId('freight-party-consignee').getByRole('textbox',{name:e.name,exact:true});await cnee.fill('BUYER');await cnee.press('Enter');assert.equal(await cnee.inputValue(),'Buyer');
  for(const [key,value] of Object.entries({origin:'Hai Phong',destination:'Busan',cargo:'Garments'}))await dialog.getByRole('textbox',{name:e[key]||t[key],exact:true}).fill(value);
  await dialog.getByRole('button',{name:x.presets,exact:true}).first().click();let savedDialog=customer.getByRole('dialog').last();await savedDialog.getByRole('button',{name:x.savePreset,exact:true}).click();await savedDialog.getByText(x.failed,{exact:true}).waitFor();assert.equal(await savedDialog.getByRole('textbox',{name:x.presetName,exact:true}).isDisabled(),true);await savedDialog.getByRole('button',{name:x.retry,exact:true}).click();await savedDialog.getByText('Hai Phong',{exact:true}).first().waitFor();await savedDialog.getByRole('button',{name:x.loadPreset,exact:true}).click();
  assert.equal(presets.length,1);assert.equal(presets[0].customerId,1);await dialog.getByRole('textbox',{name:e.origin,exact:true}).fill('Changed');await dialog.getByRole('button',{name:x.presets,exact:true}).first().click();savedDialog=customer.getByRole('dialog').last();await savedDialog.getByRole('button',{name:x.loadPreset,exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:e.origin,exact:true}).inputValue(),'Hai Phong');await dialog.getByRole('button',{name:x.presets,exact:true}).first().click();savedDialog=customer.getByRole('dialog').last();await savedDialog.getByRole('button',{name:x.deletePreset,exact:true}).click();await savedDialog.getByText(x.presetEmpty,{exact:true}).waitFor();assert.equal(presets.length,0);await savedDialog.locator('.MuiDialogContent-root').focus();await customer.keyboard.press('Escape');await customer.getByRole('dialog').nth(1).waitFor({state:'hidden'});
  await dialog.getByRole('combobox',{name:t.mode,exact:true}).click().catch(async error=>{throw Error(error.message+' TEXT '+await customer.locator('body').innerText());});await customer.getByRole('option',{name:e.LCL,exact:true}).click();
  for(const [key,value] of [['quantity','2'],['lengthM','1.2'],['widthM','0.5'],['heightM','0.3']])await dialog.getByRole('textbox',{name:key==='quantity'?e.quantity:x[key],exact:true}).fill(value);
  await dialog.getByRole('spinbutton',{name:e.weightKg,exact:true}).fill('30');assert.equal(await dialog.getByRole('textbox',{name:e.cbm,exact:true}).inputValue(),'0.360000');
  const save=dialog.getByRole('button',{name:t.save,exact:true});await save.evaluate(b=>{b.click();b.click();});await dialog.getByText(t.mapping).waitFor();assert.equal(submits,1);assert.equal(await dialog.getByRole('textbox',{name:e.cargo,exact:true}).inputValue(),'Garments');
  await save.click();await dialog.getByText(t.failed,{exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:e.cargo,exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:x.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});await customer.getByText(/SR-001/).waitFor();assert.equal(submits,3);assert.deepEqual(posted[1],posted[2]);
  const owner=await makePage(true);await owner.goto(`http://127.0.0.1:${port}/shipping-requests-acceptance.html`);await owner.getByRole('button',{name:'SR-001',exact:true}).click();
  const accept=owner.getByRole('button',{name:ownerText.accept,exact:true});await accept.waitFor();assert.equal(await owner.getByRole('button',{name:ownerText.addMaster,exact:true}).isDisabled(),true);
  await accept.evaluate(b=>{b.click();b.click();});await owner.getByRole('button',{name:ownerText.share,exact:true}).waitFor();assert.equal(accepts,1);assert.equal(job.id,'sr-1');
  await owner.getByRole('button',{name:ownerText.share,exact:true}).click();await owner.waitForFunction(()=>window.notices.length>=2);
  await customer.evaluate(()=>window.dispatchEvent(new Event('focus')));await customer.getByText('2026-12-01').waitFor();assert.equal(await customer.getByRole('button',{name:t.edit,exact:true}).isDisabled(),true);
  await owner.getByRole('button',{name:ownerText.back,exact:true}).click();await owner.getByRole('button',{name:ownerText.new,exact:true}).click();
  const c=owner.getByRole('textbox',{name:ownerText.customer,exact:true});await c.fill('BARO');await c.press('Enter');const consignee=owner.getByTestId('freight-party-consignee').getByRole('textbox',{name:freightJobEditorText[lang].name,exact:true});await consignee.fill('BUYER');await consignee.press('Enter');await owner.getByRole('button',{name:routeScopeText[lang].main,exact:true}).click();
  for(const [key,value] of [['origin','Hai Phong'],['destination','Busan'],['cargo','Garments']])await owner.getByRole('textbox',{name:e[key]||ownerText[key],exact:true}).fill(value);
  const container=owner.locator('[data-container-row]');await container.getByRole('combobox',{name:x.containerSize,exact:true}).click();await owner.getByRole('option',{name:'20',exact:true}).click();await container.getByRole('combobox',{name:x.containerType,exact:true}).click();await owner.getByRole('option',{name:'DC',exact:true}).click();await container.getByRole('textbox',{name:x.count,exact:true}).fill('1');
  await owner.getByRole('button',{name:ownerText.save,exact:true}).click();await owner.getByRole('heading',{name:'SR-002',exact:true}).waitFor();assert.equal(job.receiptStatus,'ACCEPTED');
  for(const page of [owner,customer])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await customer.close();await owner.close();console.log('PASS unified shipping request',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);}
