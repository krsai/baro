import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingOperationText} from '../frontend/src/constants/shippingOperations.js';
import {shippingBillText} from '../frontend/src/constants/shippingBills.js';
import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
import {titleCaseWords} from '../frontend/src/utils/humanTextCase.mjs';
const html='frontend/shipping-work-layout-test.html',port=43563;
assert.ok(!existsSync(html));
writeFileSync(html,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import Page from'/src/pages/App/FreightJobs';import'/src/styles/form.css';
const theme=new URLSearchParams(location.search).get('theme');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping/job1']},React.createElement(ThemeProvider,{theme:appThemes[theme]},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/shipping/:jobId',element:React.createElement(Page)})))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-work-layout-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of ['FCL','LCL','AIR','EXPRESS']){
  if(process.argv.includes('--volume-formula-only')&&mode!=='EXPRESS')continue;
  if(process.argv.includes('--return-locks-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--preview-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--date-sync-only')&&(lang!=='ko'||width!==1440||mode!=='FCL'))continue;
  if(process.argv.includes('--scope-only')&&(lang!=='ko'||width!==1440||mode!=='LCL'))continue;
  if((process.argv.includes('--route-colors-only')||process.argv.includes('--reject-footer-only'))&&mode!=='FCL')continue;
  const page=await browser.newPage({viewport:{width,height:1050},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[],writes=[],billWrites=[],chargeWrites=[],t=shippingOperationText[lang],b=shippingBillText[lang],w=shippingWorkbenchText[lang];
  if(process.argv.includes('--route-colors-only'))await page.clock.install({time:new Date('2026-11-27T05:00:00Z')});
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
  if(process.argv.includes('--route-colors-only'))Object.assign(job.data,{plannedDate:'2026-11-26',etd:'2026-11-27',routeDateDESTINATION_TERMINAL:'2026-11-28',routeDateDESTINATION_DOOR:''});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},charges=[];
  await page.route('**/freight/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(key==='options')json=[customer];else if(key==='transport-jobs/options')json={forwarder:{id:7,name:'DEX LOGIS'},employees:[],currencies:[{code:'USD'}]};else if(key==='transport-jobs/job1')json=job;
   else if(key==='transport-jobs/job1/bills'){const body=req.postDataJSON();billWrites.push(body);if(billWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,jobId:job.id,orgId:7,version:1};job.bills=[json];}
   else if(key==='transport-jobs/job1/operation-details'){const body=req.postDataJSON();writes.push(body);job.data.workDetails={...job.data.workDetails,...body.fields};job.version++;json=job;}
   else throw Error('Unexpected freight API '+key);return route.fulfill({headers,json});});
  await page.route('**/shipping-requests/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/shipping-requests/')[1];let json;
   if(key==='job1/charges'&&req.method()==='POST'){const body=req.postDataJSON();chargeWrites.push(body);if(chargeWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,version:1};charges.push(json);}
   else if(key==='job1/charges')json={rows:charges,currencies:[{code:'USD'}],parties:[customer]};else json=[];return route.fulfill({headers,json});});
  await page.goto(`http://127.0.0.1:${port}/shipping-work-layout-test.html?theme=${width===390?'standard':'compact'}`);
  const form=page.getByTestId('shipping-operations-form');await form.waitFor();
  if(process.argv.includes('--reject-footer-only'))await page.addStyleTag({content:'#root{height:100vh;overflow:auto;}'});
  if(process.argv.includes('--route-colors-only')){
   const sourceBefore=structuredClone(job.data),summary=form.locator('[data-shipping-work-summary] > div'),assignee=await form.locator('[data-shipping-work-assignee]').boundingBox();
   const customer=await summary.nth(0).boundingBox(),sr=await summary.nth(1).boundingBox();assert.ok(Math.abs(customer.y-sr.y)<1);assert.ok(sr.x>=customer.x+customer.width);assert.ok(assignee.y>=Math.max(customer.y+customer.height,sr.y+sr.height));
   const markers=form.locator('[data-route-complete]'),passed=()=>markers.evaluateAll(nodes=>nodes.map(node=>node.dataset.routeComplete==='true'));
   assert.deepEqual(await passed(),[true,false,false,false]);
   const terminal=form.locator('[data-shipping-route-step="ORIGIN_TERMINAL"]'),circle=terminal.locator('[data-route-complete] > div'),beforeColor=await circle.evaluate(node=>getComputedStyle(node).backgroundColor);
   await terminal.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));await terminal.getByRole('button').click();await page.clock.runFor(500);await page.locator('.MuiPickersDay-root').filter({hasText:/^25$/}).first().click();
   await page.waitForFunction(()=>document.querySelector('[data-shipping-route-step="ORIGIN_TERMINAL"] [data-route-complete]')?.dataset.routeComplete==='true');assert.notEqual(await circle.evaluate(node=>getComputedStyle(node).backgroundColor),beforeColor);assert.equal(writes.length,0);
   await terminal.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));await terminal.getByRole('button').click();await page.clock.runFor(500);await page.locator('.MuiPickersDay-root').filter({hasText:/^27$/}).first().click();await page.waitForFunction(()=>document.querySelector('[data-shipping-route-step="ORIGIN_TERMINAL"] [data-route-complete]')?.dataset.routeComplete==='false');
   await page.clock.fastForward(24*60*60*1000);await page.waitForFunction(()=>document.querySelector('[data-shipping-route-step="ORIGIN_TERMINAL"] [data-route-complete]')?.dataset.routeComplete==='true');assert.deepEqual(await passed(),[true,true,false,false]);
   assert.equal(writes.length,0);assert.deepEqual(job.data,sourceBefore);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/shipping-summary-route-colors-preview.png',fullPage:true});console.log('PASS customer/SR row, assignee below, live date colors, ETD fallback and midnight rollover',lang,width);await page.close();continue;
  }
  const reject=page.locator('[data-shipping-reject]'),rejectBox=await reject.boundingBox(),formBox=await form.boundingBox();assert.equal(await page.locator('.app-page-footer [data-shipping-reject]').count(),1);assert.equal(await page.locator('.app-page-footer').evaluate(node=>getComputedStyle(node).position),'sticky');assert.ok(rejectBox.width>=formBox.width-1);let rejectedRequests=0;page.on('request',req=>{if(req.method()==='POST'&&new URL(req.url()).pathname.endsWith('/shipping-requests/job1'))rejectedRequests++;});const confirmation=page.waitForEvent('dialog');await reject.click();assert.ok((await confirmation).message().includes(job.number));assert.equal(rejectedRequests,0);
  if(process.argv.includes('--reject-footer-only')){
   const footer=page.locator('.app-page-footer'),top=await footer.boundingBox();assert.ok(Math.abs(top.y+top.height-1050)<2,JSON.stringify(top));
   await page.locator('#root').evaluate(node=>{node.scrollTop=node.scrollHeight;});const bottom=await footer.boundingBox();assert.ok(Math.abs(bottom.y+bottom.height-1050)<2,JSON.stringify(bottom));
   const content=await form.boundingBox();assert.ok(content.y+content.height<=bottom.y+1,JSON.stringify({content,bottom}));
   await form.locator('[name=cargo]').fill('Unsaved Cargo');assert.equal(await reject.isDisabled(),true);assert.equal(writes.length,0);assert.equal(rejectedRequests,0);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/shipping-reject-footer-preview.png',fullPage:true});console.log('PASS pinned rejection footer, visible final inputs, confirmation and dirty guard',lang,width);await page.close();continue;
  }
  if(mode==='FCL')for(const hint of ['CARGO READY','ETD/ATD','ETA/ATA','DELIVERY'])assert.ok(await form.locator('[data-shipping-work-route]').innerText().then(text=>text.includes(hint)));
  if(process.argv.includes('--date-sync-only')){
   for(const [node,key,day] of [['ORIGIN_TERMINAL','etd','15'],['DESTINATION_TERMINAL','eta','16']]){
    await form.locator(`[data-shipping-route-step="${node}"]`).getByRole('button').click();
    await page.locator('.MuiPickersDay-root').filter({hasText:new RegExp('^'+day+'$')}).first().click();
    await Promise.all([page.waitForResponse(response=>response.url().includes('/operation-details')&&response.request().method()==='PUT'),page.locator('.app-page-header').getByRole('button',{name:t.save,exact:true}).click()]);
    assert.match(writes.at(-1).fields[key],/^\d{4}-\d{2}-\d{2}$/);assert.equal(writes.at(-1).fields[key],job.data.workDetails['routeDate'+node]);assert.equal(Object.hasOwn(writes.at(-1).fields,'plannedDate'),false);
   }
   assert.deepEqual(errors,[]);console.log('PASS route dates save matching ETD/ETA without changing cargo ready');await page.close();continue;
  }
  if(process.argv.includes('--volume-formula-only')){
   const volume=form.locator('input[name=cbm]');await form.locator('input[name=quantity]').fill('2');await volume.fill('=0.5*0.5*0.3');await form.locator('[name=cargo]').click();assert.equal(await volume.inputValue(),'0.075');assert.equal(await volume.getAttribute('title'),'=0.5*0.5*0.3');await page.waitForFunction(()=>window.notices?.some(n=>n.severity==='warning'));await volume.click();assert.equal(await volume.inputValue(),'=0.5*0.5*0.3');await form.locator('[name=cargo]').click();
   await Promise.all([page.waitForResponse(response=>response.url().includes('/operation-details')&&response.request().method()==='PUT'),page.locator('.app-page-header').getByRole('button',{name:t.save,exact:true}).click()]);await page.waitForFunction(()=>document.querySelector('.app-page-header button')?.disabled);assert.equal(writes.length,1);assert.equal(writes[0].fields.cbm,'0.075');assert.equal(writes[0].fields.cbmFormula,'=0.5*0.5*0.3');assert.equal(job.data.cbm,'88');assert.equal(job.data.workDetails.quantity,'2');
   await volume.fill('0.15');await form.locator('[name=cargo]').click();assert.equal(await volume.getAttribute('title'),'');await Promise.all([page.waitForResponse(response=>response.url().includes('/operation-details')&&response.request().method()==='PUT'),page.locator('.app-page-header').getByRole('button',{name:t.save,exact:true}).click()]);await page.waitForFunction(()=>document.querySelector('.app-page-header button')?.disabled);assert.equal(writes.length,2);assert.equal(writes[1].fields.cbmFormula,'');assert.equal(job.data.workDetails.cbm,'0.15');assert.equal(job.data.cbm,'88');assert.deepEqual(errors,[]);console.log('PASS private work volume formula',lang,width);await page.close();continue;
  }
const main=page.locator('[data-shipping-work-main]'),side=page.locator('[data-shipping-work-side]'),actions=page.locator('[data-shipping-work-actions]');
  const a=await main.boundingBox(),c=await side.boundingBox(),toolbar=await actions.boundingBox();assert.ok(width>1000?a.x+a.width<=c.x+1:a.y<c.y);assert.ok(toolbar.y<a.y);assert.ok(toolbar.width>=a.width);
  const overview=side.locator('section').filter({has:page.getByRole('heading',{name:t.overview,exact:true})}),schedule=side.locator('section').filter({has:page.getByRole('heading',{name:t.schedule,exact:true})});
  assert.equal(await overview.locator('.MuiChip-root,input[name=plannedDate]').count(),0);assert.equal(await form.locator('[data-shipping-work-route] input[name=plannedDate]').count(),mode==='LCL'?0:1);
  const summary=form.locator('[data-shipping-cargo-summary]'),controls=await summary.locator('.MuiOutlinedInput-root').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));assert.equal(controls.length,5);
  if(width>1000){assert.ok(controls.every(r=>Math.abs(r.y-controls[0].y)<1));assert.ok(controls.every(r=>Math.abs(r.height-controls[0].height)<1));assert.ok(controls.every((r,i)=>!i||r.x>controls[i-1].x));}
  const summaryY=(await summary.boundingBox()).y;if(mode==='FCL'){assert.equal(await main.locator('[data-container-row]').count(),0);assert.equal(await side.locator('[data-container-row]').count(),1);}else assert.equal(await form.locator('[data-package-row]').count(),0);
  const partyBoxes=await form.locator('[data-shipping-work-parties] .MuiOutlinedInput-root').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));assert.equal(partyBoxes.length,3);assert.ok(partyBoxes.every((r,i)=>!i||r.y>partyBoxes[i-1].y&&Math.abs(r.x-partyBoxes[0].x)<1&&Math.abs(r.width-partyBoxes[0].width)<1));
  const steps=form.locator('[data-shipping-route-step]');assert.equal(await steps.count(),mode==='FCL'?4:mode==='AIR'?3:2);const stepBoxes=await steps.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y};}));assert.ok(stepBoxes.every((r,i)=>!i||r.y>stepBoxes[i-1].y&&Math.abs(r.x-stepBoxes[0].x)<1));if(width>1000){const heights=await steps.locator('.MuiOutlinedInput-root').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(heights.every(height=>height<48));assert.ok(heights.every(height=>height>24));}
  assert.equal(await form.locator('[name=marks],[name=placeOfReceipt],[name=placeOfDelivery]').count(),0);assert.equal(await main.locator('[name=incoterms]').count(),0);assert.equal(await form.locator('[name=incoterms],[name=freightTerms],[name=remark]').count(),0);assert.equal(await form.locator('input[name=quantity]').inputValue(),'99');assert.equal(writes.length,0);
  if(mode==='FCL'){await page.getByRole('button',{name:'mBL (0)',exact:true}).click();await page.getByRole('button',{name:t.oneMaster,exact:true}).waitFor();await page.getByRole('button',{name:t.masterHouse,exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:t.close,exact:true}).click();await page.getByRole('button',{name:'hBL (0)',exact:true}).click();await page.getByRole('button',{name:t.existingMaster,exact:true}).waitFor();await page.getByRole('button',{name:t.createMaster,exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:t.close,exact:true}).click();assert.equal(await form.locator('[data-container-row]').count(),1);}
  else{assert.equal(await form.locator('[data-package-row]').count(),0);await form.locator('input[name=cbm]').fill('=0.1*0.2*0.3');await form.locator('[name=cargo]').click();}
  await form.locator('[name=cargo]').first().fill('Working Garment');
  if(mode==='FCL'){
   await page.getByRole('button',{name:'mBL (0)',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:t.close,exact:true}).click();assert.equal(await page.getByRole('button',{name:t.newMaster,exact:true}).count(),0);
   for(const label of [t.newMaster,t.newHouse]){
    await page.getByRole('button',{name:label===t.newMaster?'mBL (0)':'hBL (0)',exact:true}).click();await page.getByRole('button',{name:label===t.newMaster?t.oneMaster:t.createMaster,exact:true}).click();const editor=page.getByRole('dialog');await editor.locator('[data-shipping-bills]').waitFor();await editor.getByRole('textbox',{name:b.number,exact:true}).fill('UNSAVED-BILL');await editor.getByRole('button',{name:t.returnDetail,exact:true}).click();assert.ok(await editor.isVisible());
    page.removeAllListeners('dialog');page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:t.returnDetail,exact:true}).click();await editor.waitFor({state:'hidden'});page.on('dialog',d=>d.dismiss());assert.equal(await form.locator('[name=cargo]').first().inputValue(),'Working Garment');assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),0);
   }
   if(process.argv.includes('--return-locks-only')){
    await page.getByRole('button',{name:'mBL (0)',exact:true}).click();await page.getByRole('button',{name:t.oneMaster,exact:true}).click();const editor=page.getByRole('dialog');await editor.getByRole('textbox',{name:b.number,exact:true}).fill('RETRY-MBL');await editor.getByRole('button',{name:b.save,exact:true}).click();await editor.getByRole('button',{name:b.retry,exact:true}).waitFor();assert.equal(await editor.getByRole('button',{name:t.returnDetail,exact:true}).isDisabled(),true);await page.keyboard.press('Escape');assert.ok(await editor.isVisible());await editor.getByRole('button',{name:b.retry,exact:true}).click();await editor.getByRole('button',{name:t.returnDetail,exact:true}).waitFor();await editor.getByRole('button',{name:t.returnDetail,exact:true}).click();await editor.waitFor({state:'hidden'});assert.deepEqual(billWrites[0],billWrites[1]);assert.equal(await form.locator('[name=cargo]').first().inputValue(),'Working Garment');
   }
   await page.getByRole('button',{name:b.documents,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:t.returnDetail,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  }

  await page.getByRole('button',{name:t.arAp,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('[data-shipping-charges]').waitFor();await dialog.getByRole('button',{name:t.close,exact:true}).click();assert.equal(await form.locator('[name=cargo]').first().inputValue(),'Working Garment');
  await Promise.all([page.waitForResponse(response=>response.url().includes('/operation-details')&&response.request().method()==='PUT'),page.locator('.app-page-header').getByRole('button',{name:t.save,exact:true}).click()]);await page.waitForFunction(()=>document.querySelector('.app-page-header button')?.disabled);assert.equal(writes.length,1);for(const key of ['marks','placeOfReceipt','placeOfDelivery'])assert.equal(Object.hasOwn(writes[0].fields,key),false);assert.equal(job.data.marks,original.marks);assert.equal(job.data.cargo,original.cargo);
  if(mode!=='FCL'){assert.equal(Object.hasOwn(writes[0].fields,'packages'),false);assert.equal(job.data.workDetails.cbm,'0.006');assert.equal(job.data.workDetails.cbmFormula,'=0.1*0.2*0.3');assert.equal(job.data.packages[0].heightM,'0.3');}
  await page.getByRole('button',{name:t.arAp,exact:true}).click();assert.equal(await dialog.getByRole('tab').count(),2);assert.equal(await dialog.getByRole('button',{name:t.returnDetail,exact:true}).count(),0);await dialog.getByRole('button',{name:t.close,exact:true}).click();
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await dialog.waitFor({state:'hidden'});if(lang==='ko'&&width===1440&&mode==='FCL')await page.screenshot({path:'logs/shipping-work-layout-preview.png',fullPage:true});console.log('PASS work layout, cargo, preserved source and AR/AP exact retry',lang,width,mode);await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
