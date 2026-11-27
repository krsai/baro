import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingOperationText} from '../frontend/src/constants/shippingOperations.js';
import {shippingBillText} from '../frontend/src/constants/shippingBills.js';
import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
import {titleCaseWords} from '../frontend/src/utils/humanTextCase.mjs';
const html='frontend/shipping-bl-creation-test.html',port=43568;
assert.ok(!existsSync(html));
writeFileSync(html,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import Page from'/src/pages/App/FreightJobs';import'/src/styles/form.css';
const theme=new URLSearchParams(location.search).get('theme');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping/job1']},React.createElement(ThemeProvider,{theme:appThemes[theme]},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/shipping/:jobId',element:React.createElement(Page)})))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-bl-creation-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of ['FCL']){
  if(process.argv.includes('--volume-formula-only')&&mode!=='EXPRESS')continue;
  if(process.argv.includes('--return-locks-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--preview-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--date-sync-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--scope-only')&&(lang!=='ko'||width!==1440||mode!=='LCL'))continue;
  const page=await browser.newPage({viewport:{width,height:1050}}),errors=[],writes=[],billWrites=[],chargeWrites=[],t=shippingOperationText[lang],b=shippingBillText[lang],w=shippingWorkbenchText[lang];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('dialog',d=>d.dismiss());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7,activeOrgType:"SERVICE"});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification(message,severity){window.notices=[...(window.notices||[]),{message,severity}];},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},markTabChanged(){},clearTabChanged(){},navigateToPath(){}};export const useAppActions=()=>a;'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[{acronym:'MBL'},{acronym:'HBL'},{acronym:'AR'},{acronym:'AP'}]}}));
  const customer={id:11,name:'CUSTOMER'},job={id:'job1',number:'JOB-000001',orgId:7,mode:['FCL','LCL'].includes(mode)?'SEA':'AIR',service:mode==='EXPRESS'?'EXPRESS':'GENERAL',receiptStatus:'ACCEPTED',status:'DRAFT',version:1,bills:[],documents:[],data:{customer,shipmentType:mode,shipper:'SENDER\nSender Address',consignee:'BUYER\nBuyer Address',notify:'NOTIFY',origin:'Origin Address',destination:'Destination Address',originPortCode:'VNHPH',destinationPortCode:'KRINC',cargo:'Garment',marks:'PRESERVE MARKS',placeOfReceipt:'PRESERVE RECEIPT',placeOfDelivery:'PRESERVE DELIVERY',incoterms:'CIF',freightTerms:'Prepaid',quantity:'99',cbm:'88',weightKg:'120',unit:'PKG',containers:mode==='FCL'?[{size:'20',type:'DC',count:'1'}]:[],packages:mode==='FCL'?[]:[{quantity:'3',lengthM:'0.1',widthM:'0.2',heightM:'0.3'}]}},original=structuredClone(job.data);
  if(mode==='FCL')job.data.workScope={start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'};
  if(mode==='LCL')job.data.workScope={start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'};
  if(mode==='AIR')job.data.workScope={start:'ORIGIN_DOOR',end:'DESTINATION_TERMINAL'};
  if(mode==='LCL')job.bills=[{id:'shared-master',jobId:'source-job',kind:'MASTER',number:'M-001',data:{}},{id:'own-house',jobId:'job1',kind:'HOUSE',number:'H-001',data:{}}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},charges=[];
  await page.route('**/freight/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(key==='options')json=[customer];else if(key==='transport-jobs/options')json={forwarder:{id:7,name:'DEX LOGIS',address:'Forwarder Address',representative:'Forwarder Representative',phone:'+84 111',email:'ops@example.test'},employees:[],currencies:[{code:'USD'}]};else if(key==='transport-jobs/job1')json=job;
   else if(key==='transport-jobs/job1/bills'){const body=req.postDataJSON();billWrites.push(body);if(billWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,jobId:job.id,orgId:7,version:1};job.bills=[...job.bills.filter(row=>row.id!==json.id),json];}
   else if(key==='transport-jobs/job1/operation-details'){const body=req.postDataJSON();writes.push(body);job.data.workDetails={...job.data.workDetails,...body.fields};job.version++;json=job;}
   else if(key==='transport-jobs/job1/master-bills')json={rows:[...job.bills.filter(row=>row.kind==='MASTER').map(row=>({...row,linked:true})),{id:'shared-master',jobId:'other-job',kind:'MASTER',number:'SHARED-MBL',issuer:'Carrier',linked:false,data:{vessel:'Shared Vessel',shipper:'Other Forwarder'},version:1}]};
   else if(key==='transport-jobs/job1/master-links/shared-master'){job.bills.push({id:'shared-master',jobId:'other-job',kind:'MASTER',number:'SHARED-MBL',issuer:'Carrier',data:{vessel:'Shared Vessel',shipper:'Other Forwarder'},version:1});job.version++;json=job;}
   else throw Error('Unexpected freight API '+key);return route.fulfill({headers,json});});
  await page.route('**/shipping-requests/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/shipping-requests/')[1];let json;
   if(key==='job1/charges'&&req.method()==='POST'){const body=req.postDataJSON();chargeWrites.push(body);if(chargeWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,version:1};charges.push(json);}
   else if(key==='job1/charges')json={rows:charges,currencies:[{code:'USD'}],parties:[customer]};else json=[];return route.fulfill({headers,json});});
  const sourceBefore=structuredClone(job.data);
  await page.goto(`http://127.0.0.1:${port}/shipping-bl-creation-test.html?theme=${width===390?'standard':'compact'}`);
  const form=page.getByTestId('shipping-operations-form');await form.waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.ok((await page.locator('.app-page-header').innerText()).includes(t.title));
  const masterButton=()=>page.getByRole('button',{name:new RegExp('^mBL \\(')}),houseButton=()=>page.getByRole('button',{name:new RegExp('^hBL \\(')});
  await houseButton().click();await page.getByRole('button',{name:t.createMaster,exact:true}).click();let firstHouse=page.getByRole('dialog');await firstHouse.locator('[data-shipping-bl-form]').waitFor();assert.ok((await firstHouse.getByRole('textbox',{name:'Shipper',exact:true}).inputValue()).includes('DEX LOGIS'));await firstHouse.getByRole('button',{name:t.returnDetail,exact:true}).click();await firstHouse.waitFor({state:'hidden'});assert.equal(job.bills.length,0);
  await masterButton().click();await page.getByRole('button',{name:t.oneMaster,exact:true}).click();
  let editor=page.getByRole('dialog');await editor.locator('[data-shipping-bl-form]').waitFor();
  assert.equal(await editor.getByRole('textbox',{name:'Shipper',exact:true}).inputValue(),original.shipper);
  assert.equal(await editor.getByRole('textbox',{name:'Consignee',exact:true}).inputValue(),original.consignee);
  await editor.locator('[name=billNumber]').fill('DIRECT-MBL');await editor.getByRole('button',{name:b.save,exact:true}).click();await editor.getByRole('button',{name:b.retry,exact:true}).waitFor();
  await editor.getByRole('button',{name:b.retry,exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-record-row]')).some(node=>node.textContent.includes('DIRECT-MBL')));assert.deepEqual(billWrites[0],billWrites[1]);
  await editor.getByRole('button',{name:t.returnDetail,exact:true}).click();await editor.waitFor({state:'hidden'});
  await masterButton().click();await page.getByRole('button',{name:t.masterHouse,exact:true}).click();
  editor=page.getByRole('dialog');await editor.locator('[data-shipping-bl-form]').waitFor();
  for(const role of ['Shipper','Consignee','Notify Party']){const value=await editor.getByRole('textbox',{name:role,exact:true}).inputValue();assert.ok(value.includes('DEX LOGIS'));assert.ok(value.includes('Forwarder Address'));assert.ok(!value.includes('Sender Address'));}
  await editor.locator('[name=billNumber]').fill('FORWARDER-MBL');await editor.getByRole('button',{name:b.save,exact:true}).click();
  await editor.getByRole('textbox',{name:'Shipper',exact:true}).and(page.locator('textarea')).filter({visible:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-shipping-bl-form] input[name=billNumber]')?.value==='');
  assert.equal(await editor.getByRole('textbox',{name:'Shipper',exact:true}).inputValue(),original.shipper);
  assert.equal(await editor.getByRole('textbox',{name:'Consignee',exact:true}).inputValue(),original.consignee);
  await editor.locator('[name=billNumber]').fill('REAL-HBL');await editor.getByRole('button',{name:b.save,exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-record-row]')).some(node=>node.textContent.includes('REAL-HBL')));
  const master=job.bills.find(row=>row.number==='FORWARDER-MBL'),house=job.bills.find(row=>row.number==='REAL-HBL');assert.equal(house.masterId,master.id);assert.equal(master.data.shipper.includes('DEX LOGIS'),true);assert.equal(house.data.shipper,original.shipper);
  await editor.getByRole('button',{name:t.returnDetail,exact:true}).click();await editor.waitFor({state:'hidden'});
  await houseButton().click();await page.getByRole('button',{name:t.existingMaster,exact:true}).click();
  editor=page.getByRole('dialog');await editor.getByRole('button',{name:'SHARED-MBL',exact:true}).click();await editor.getByRole('button',{name:t.link,exact:true}).click();
  await page.getByRole('dialog').locator('[data-shipping-bl-form]').waitFor();editor=page.getByRole('dialog');
  assert.equal(await editor.getByRole('textbox',{name:'Shipper',exact:true}).inputValue(),original.shipper);
  await editor.locator('[name=billNumber]').fill('LINKED-HBL');await editor.getByRole('button',{name:b.save,exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-record-row]')).some(node=>node.textContent.includes('LINKED-HBL')));
  assert.equal(job.bills.find(row=>row.number==='LINKED-HBL').masterId,'shared-master');assert.equal(job.bills.find(row=>row.id==='shared-master').data.shipper,'Other Forwarder');
  assert.deepEqual(job.data,sourceBefore);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/shipping-bl-creation-preview.png',fullPage:true});
  console.log('PASS waybill to direct/forwarder Master, actual-party House, shared Master lookup and exact retry',lang,width);await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
