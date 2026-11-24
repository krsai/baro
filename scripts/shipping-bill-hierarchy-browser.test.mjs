import {shippingText} from '../frontend/src/constants/shippingRequests.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {shippingBillText} from '../frontend/src/constants/shippingBills.js';
import {freightText} from '../frontend/src/constants/freight.js';
import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
import {titleCaseWords} from '../frontend/src/utils/humanTextCase.mjs';
const fixture=path.resolve('frontend/shipping-bill-hierarchy-acceptance.html'),port=43557;
const newDirect=process.argv.includes('--new-direct');
const filter=(name,value)=>!process.argv.some(arg=>arg.startsWith('--'+name+'='))||process.argv.includes('--'+name+'='+value);
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/FreightJobs';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[location.search.includes('newDirect')?'/shipping?form=new':'/shipping']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(fixture)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of ['SEA','AIR','ROAD','EXPRESS'])for(const composition of mode==='EXPRESS'?['DIRECT']:['MASTER_ONLY','MASTER_HOUSE']){
  if(newDirect&&!['MASTER_ONLY','DIRECT'].includes(composition))continue;
  if(!filter('lang',lang)||!filter('width',width)||!filter('mode',mode))continue;
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=shippingBillText[lang],f=freightText[lang],w=shippingWorkbenchText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7,activeOrgType:"SERVICE"});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},markTabChanged(){},clearTabChanged(){}};export const useAppActions=()=>a;'}));
  if(newDirect)await page.route('**/src/components/FreightJobEditor*',r=>r.fulfill({contentType:'application/javascript',body:'import React from "/node_modules/.vite/deps/react.js";export default function Editor({onSave}){return React.createElement("button",{onClick:()=>onSave({clientKey:"direct-new"})},"Register Direct SR");}'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[{acronym:'SR'}]}}));
  const customer={id:11,code:'CUS',name:'CUSTOMER'},supplier={id:12,code:'SUP',name:'SUPPLIER'},headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const job={id:'job1',number:'SR-001',orgId:7,customerId:11,mode:mode==='EXPRESS'?'AIR':mode,service:mode==='EXPRESS'?'EXPRESS':'GENERAL',status:'DRAFT',receiptStatus:composition==='MASTER_HOUSE'?'PENDING':'ACCEPTED',version:1,data:{shipper:'SR SENDER',consignee:'SR BUYER',cargo:'SR CARGO',origin:'HANOI',destination:'BUSAN',customer:customer},bills:[],documents:[]};
  const original=structuredClone(job.data),charges=[{id:'legacy-charge',billId:null,direction:'SALES',description:'EXISTING UNASSIGNED',currencyCode:'USD',amount:'999',version:1,sourceKind:'MANUAL',quantity:null,unitPrice:null}],billWrites=[],chargeWrites=[];let failHouse=true,failCharge=true,accepts=0,listReads=0;
  await page.route('**/freight/**',async route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const p=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(p==='options')json=[customer,supplier];
   else if(p==='transport-jobs'){if(req.method()==='GET')listReads++;json=req.method()==='POST'?job:{rows:[job],total:1};}
   else if(p==='transport-jobs/options')json={forwarder:{id:7,name:'FORWARDER'},employees:[],currencies:[{code:'USD'}]};
   else if(p==='transport-jobs/job1/document-setup'){assert.equal(req.method(),'PUT');const input=req.postDataJSON();assert.equal(input.version,job.version);job.data={...job.data,documentSetup:{composition:input.composition,documentType:input.documentType}};job.version++;json=job;}
   else if(p==='transport-jobs/job1'){if(process.argv.includes('--open-only'))await new Promise(resolve=>setTimeout(resolve,500));json=job;}
   else if(p==='transport-jobs/job1/documents'){const input=req.postDataJSON(),bill=job.bills.find(row=>row.id===input.billId);assert.equal(input.kind,'MASTER_DRAFT');assert.equal(bill.kind,'MASTER');json={id:'master-copy',number:'M-COPY',kind:input.kind,sourceVersion:job.version,snapshot:{layout:'transport-v1',issuer:{name:'FORWARDER'},source:{id:job.id,number:job.number,mode:job.mode,data:{...job.data,...bill.data},bill:{...bill},documentType:job.data.documentSetup.documentType}}};job.documents.push(json);}
   else if(p==='transport-jobs/job1/bills'||p.startsWith('transport-jobs/job1/bills/')){
    assert.ok(['POST','PUT'].includes(req.method()));const body=req.postDataJSON();billWrites.push(body);
    if(body.kind==='HOUSE'&&failHouse){failHouse=false;return route.fulfill({headers,status:409,json:{error:'FREIGHT_CHANGED'}});}
    const old=job.bills.find(row=>row.id===body.id);json={...body,orgId:7,jobId:'job1',version:(old?.version||0)+1};job.bills=job.bills.filter(row=>row.id!==json.id).concat(json);
   }else throw Error('Unexpected freight API '+p);
   return route.fulfill({headers,json});
  });
  await page.route('**/shipping-requests/**',async route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const p=new URL(req.url()).pathname.split('/shipping-requests/')[1];let json;
   if(p==='job1'){const input=req.postDataJSON();assert.equal(input.action,'ACCEPT');assert.equal(input.version,job.version);job.receiptStatus='ACCEPTED';job.version++;accepts++;json={id:job.id,version:job.version};}
   else if(p==='job1/charges'){
    if(req.method()==='POST'){
     const body=req.postDataJSON();chargeWrites.push(body);
     if(failCharge){failCharge=false;return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});}
     const old=charges.find(row=>row.id===body.id);json={...body,version:(old?.version||0)+1};const at=charges.findIndex(row=>row.id===body.id);if(at>=0)charges[at]=json;else charges.push(json);
    }else json={rows:charges,currencies:[{code:'USD'},{code:'VND'}],parties:[customer,supplier]};
   }else if(['presets','parties'].includes(p))json=[];else throw Error('Unexpected shipping API '+p);
   return route.fulfill({headers,json});
  });
  await page.goto(`http://127.0.0.1:${port}/${path.basename(fixture)}${newDirect?'?newDirect':''}`);
  if(newDirect){await page.getByRole('button',{name:'Register Direct SR',exact:true}).click();assert.equal(accepts,0);}
  else{const listRow=page.locator('[data-shipping-row="job1"]');await listRow.waitFor();await page.locator('[data-table-status=loading]').waitFor({state:'hidden'});await listRow.click();assert.equal(await listRow.count(),1);const beforeOpenReads=listReads;await listRow.dblclick();if(process.argv.includes('--open-only')){await page.getByRole('dialog').locator('[data-table-status=loading]').waitFor();assert.equal(await page.locator('table[data-table-layout=fixed] [data-table-status=loading]').count(),0);assert.equal(await listRow.count(),1);}await page.getByRole('dialog').getByText(t.requestTitle+' \u00b7 '+job.number,{exact:true}).waitFor();assert.equal(await listRow.count(),1);assert.equal(listReads,beforeOpenReads);if(process.argv.includes('--open-only')){await page.close();console.log('PASS request opens without background loading or duplicate list fetch',lang,width,mode,composition);continue;}await page.getByRole('button',{name:t.receiveTransport,exact:true}).click();if(composition==='MASTER_HOUSE')for(let i=0;i<100&&accepts===0;i++)await new Promise(r=>setTimeout(r,20));assert.equal(accepts,composition==='MASTER_HOUSE'?1:0);}
  assert.equal(await page.locator('.app-page-header').getByRole('button',{name:shippingText[lang].share,exact:true}).count(),0);
  const optional=['ROAD','EXPRESS'].includes(mode),compositionDialog=page.getByRole('dialog');
  if(optional){
   await compositionDialog.waitFor({state:'hidden'});assert.equal(await compositionDialog.count(),0);
   const direct=page.locator('[data-shipping-charges="shipment"]');await direct.getByRole('button',{name:w.addCharge,exact:true}).waitFor();assert.equal(await compositionDialog.count(),0);assert.equal(await page.getByRole('button',{name:t.newMaster,exact:true}).count(),0);failCharge=false;
   await direct.getByRole('button',{name:w.addCharge,exact:true}).click();
   await direct.getByRole('textbox',{name:titleCaseWords(w.description),exact:true}).fill('DELIVERY');await direct.getByRole('textbox',{name:titleCaseWords(t.unitPrice),exact:true}).fill('20');await direct.getByRole('button',{name:w.save,exact:true}).click();await direct.getByRole('cell',{name:'Delivery',exact:true}).waitFor();
   assert.equal(chargeWrites.at(-1).billId,null);assert.equal(chargeWrites.at(-1).amount,'20.0000');assert.equal(job.data.documentSetup,undefined);assert.equal(billWrites.length,0);failCharge=true;
   if(mode==='EXPRESS'){assert.equal(await page.getByRole('button',{name:t.addOptionalBills,exact:true}).count(),0);assert.deepEqual(errors,[]);await page.close();console.log('PASS express without B/L, direct shipment charge',lang,width);continue;}
   await page.getByRole('button',{name:t.addOptionalBills,exact:true}).click();
  }
  await compositionDialog.getByRole('radio',{name:t[composition],exact:true}).check();await compositionDialog.getByRole('button',{name:t.startBills,exact:true}).click();await compositionDialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:t.newMaster,exact:true}).click();let panel=page.locator('[data-list-detail-content]').first();
  if(process.argv.includes('--layout-only')){const tabs=page.locator('[data-shipping-tabs]'),body=page.getByRole('tabpanel'),form=panel.locator('[data-dialog-detail]');await form.waitFor();const tabBox=await tabs.boundingBox(),bodyBox=await body.boundingBox();assert.ok(Math.abs(bodyBox.y-tabBox.y-tabBox.height)<=2);assert.equal(await form.evaluate(el=>getComputedStyle(el).maxHeight),'none');assert.equal(await panel.locator('.invoice-sheet').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(lang==='ko'&&width===1440&&composition==='MASTER_ONLY')await page.screenshot({path:'logs/shipping-tabs-preview.png',fullPage:true});await page.close();console.log('PASS connected shipping tabs, page form scrolling and viewport fit',lang,width,composition);continue;}

  assert.equal(await panel.getByRole('textbox',{name:f.shipper,exact:true}).inputValue(),'SR SENDER');assert.equal(await panel.getByRole('textbox',{name:f.cargo,exact:true}).inputValue(),titleCaseWords('SR CARGO'));
  await panel.getByRole('textbox',{name:t.number,exact:true}).fill('M-001');await panel.getByRole('textbox',{name:f.shipper,exact:true}).fill('MASTER FORWARDER');
  await panel.getByRole('button',{name:t.save,exact:true}).click();await page.locator('[data-record-row]').filter({hasText:'M-001'}).waitFor();
  assert.equal(job.bills.length,1);assert.deepEqual(Object.fromEntries(Object.keys(original).map(key=>[key,job.data[key]])),original);assert.equal(await page.getByRole('dialog').count(),0);
  if(composition==='MASTER_ONLY'){
   assert.equal(await page.getByRole('button',{name:t.newMaster,exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:t.newHouse,exact:true}).count(),0);
   const masterCharges=panel.locator('[data-shipping-charges]');failCharge=false;await masterCharges.getByRole('button',{name:w.addCharge,exact:true}).click();await masterCharges.getByRole('textbox',{name:titleCaseWords(w.description),exact:true}).fill('Master Freight');await masterCharges.getByRole('textbox',{name:titleCaseWords(t.unitPrice),exact:true}).fill('5');await masterCharges.getByRole('button',{name:w.save,exact:true}).click();await masterCharges.getByRole('cell',{name:'Master Freight',exact:true}).waitFor();assert.equal(chargeWrites.at(-1).billId,job.bills[0].id);failCharge=true;
   await page.getByRole('tab',{name:t.documents,exact:true}).click();await page.getByRole('button',{name:w.create,exact:true}).click();const printDialog=page.getByRole('dialog');await printDialog.locator('iframe').waitFor();assert.match(await printDialog.locator('iframe').getAttribute('srcdoc'),/MASTER (BILL OF LADING|AIR WAYBILL|CONSIGNMENT NOTE)/);await printDialog.getByRole('button',{name:w.close,exact:true}).click();await page.getByRole('tab',{name:t.transportDetails,exact:true}).click();
   await page.getByRole('button',{name:t.composition,exact:true}).click();
   await compositionDialog.getByRole('radio',{name:t.MASTER_ONLY,exact:true}).waitFor();assert.equal(await compositionDialog.getByRole('radio',{name:t.MASTER_ONLY,exact:true}).isChecked(),true);
   await compositionDialog.getByRole('radio',{name:t.MASTER_HOUSE,exact:true}).check();await compositionDialog.getByRole('button',{name:t.startBills,exact:true}).click();await compositionDialog.waitFor({state:'hidden'});
  }
  assert.equal(await panel.getByRole('button',{name:w.addCharge,exact:true}).count(),0,'Master+House has no Master DC input');
  await page.getByRole('button',{name:t.newHouse,exact:true}).click();await panel.getByRole('textbox',{name:t.number,exact:true}).fill('H-001');
  assert.equal(await panel.getByRole('textbox',{name:f.shipper,exact:true}).inputValue(),'SR SENDER','House keeps the SR customer, not Master forwarding parties');
  await panel.getByRole('textbox',{name:f.cargo,exact:true}).fill('HOUSE CARGO');await panel.getByRole('button',{name:t.save,exact:true}).click();await panel.locator('[data-app-notice]').waitFor({state:'attached'});assert.equal(await panel.getByRole('textbox',{name:t.number,exact:true}).inputValue(),'H-001');
  await panel.getByRole('button',{name:t.save,exact:true}).click();await page.locator('[data-record-row]').filter({hasText:'H-001'}).waitFor();assert.equal(job.bills[1].masterId,job.bills[0].id);
  const writesBeforeHouse=chargeWrites.length,charge=panel.locator('table').last();await panel.getByRole('button',{name:w.addCharge,exact:true}).click();
  await panel.getByRole('textbox',{name:t.party,exact:true}).fill('CUS');await panel.getByRole('textbox',{name:t.party,exact:true}).press('Enter');
  await charge.getByRole('textbox',{name:titleCaseWords(w.description),exact:true}).fill('FREIGHT');await charge.getByRole('textbox',{name:titleCaseWords(t.quantity),exact:true}).fill('29');await charge.getByRole('textbox',{name:titleCaseWords(t.unitPrice),exact:true}).fill('10.125');
  assert.equal(await charge.getByRole('textbox',{name:titleCaseWords(w.amount),exact:true}).inputValue(),'293.6250');assert.equal(chargeWrites.length,writesBeforeHouse);
  await charge.getByRole('button',{name:w.save,exact:true}).click();await charge.getByRole('button',{name:w.retry,exact:true}).waitFor();assert.equal(await charge.getByRole('textbox',{name:titleCaseWords(w.description),exact:true}).isDisabled(),true);
  await charge.getByRole('button',{name:w.retry,exact:true}).click();await charge.getByRole('cell',{name:'Freight',exact:false}).waitFor();assert.deepEqual(chargeWrites.at(-2),chargeWrites.at(-1));assert.equal(chargeWrites.at(-1).billId,job.bills[1].id);assert.equal(chargeWrites.at(-1).partyId,11);
  assert.equal(await charge.getByRole('cell',{name:'293.625',exact:true}).count(),1);assert.equal(await charge.getByText('EXISTING UNASSIGNED',{exact:true}).count(),0);
  if(optional)await page.locator('[data-shipping-charges="shipment"]').getByText(composition==='MASTER_ONLY'?/USD.*1,317\.625/:/USD.*1,312\.625/).waitFor();
  // A clean continuation line does not dirty the parent; another bill can open.
  await page.locator('[data-record-row]').filter({hasText:'M-001'}).click();await panel.getByRole('textbox',{name:t.number,exact:true}).waitFor();assert.equal(await panel.getByRole('textbox',{name:t.number,exact:true}).inputValue(),'M-001');
  assert.equal(await panel.getByRole('cell',{name:'Freight',exact:true}).count(),0,'another bill never reuses House AR/AP rows');
  await panel.getByRole('textbox',{name:f.cargo,exact:true}).fill('DO NOT DISCARD');await page.getByRole('tab',{name:t.documents,exact:true}).click();assert.equal(await panel.getByRole('textbox',{name:f.cargo,exact:true}).inputValue(),titleCaseWords('DO NOT DISCARD'));
  assert.equal(charges.find(row=>row.id==='legacy-charge').billId,null);assert.equal(charges.find(row=>row.id==='legacy-charge').amount,'999');assert.deepEqual(Object.fromEntries(Object.keys(original).map(key=>[key,job.data[key]])),original);assert.deepEqual(errors,[]);if(newDirect)assert.equal(accepts,0);
  assert.equal(await page.locator('main').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'all wide input tables scroll inside their panel');
  await page.close();console.log('PASS SR → Master → House, independent B/L data, bill AR/AP, exact amounts, retry, draft preservation',lang,width,mode,composition);
 }
}finally{await browser?.close();vite.kill();if(existsSync(fixture))unlinkSync(fixture);}
