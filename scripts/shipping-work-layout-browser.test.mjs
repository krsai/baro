import {billWorkflowText} from '../frontend/src/constants/billWorkflow.js';
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
const theme=new URLSearchParams(location.search).get('theme');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['${process.argv.includes('--shared-sr-only')?'/shipping':'/shipping/job1'}']},React.createElement(ThemeProvider,{theme:appThemes[theme]},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/shipping/:jobId?',element:React.createElement(Page)})))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-work-layout-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of ['FCL','LCL','AIR','EXPRESS']){
  if(process.argv.includes('--inline-smoke')&&(lang!=='ko'||width!==1440))continue;
  if((process.argv.includes('--info-layout-only')||process.argv.includes('--numeric-only')||process.argv.includes('--close-ui-only')||process.argv.includes('--empty-bl-only')||process.argv.includes('--inline-bl-only')||process.argv.includes('--multi-bl-only'))&&mode!=='FCL')continue;
  if(process.argv.includes('--shared-sr-only')&&mode!=='FCL')continue;
  if(process.argv.includes('--customer-only')&&mode!=='FCL')continue;
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
  const customer={id:11,name:'CUSTOMER'},job={id:'job1',number:'JOB-000001',createdAt:'2026-11-25T04:00:00Z',orgId:7,mode:['FCL','LCL'].includes(mode)?'SEA':'AIR',service:mode==='EXPRESS'?'EXPRESS':'GENERAL',receiptStatus:'ACCEPTED',status:'DRAFT',version:1,bills:[],documents:[],data:{customer,shipmentType:mode,shipper:'SENDER\nSender Address',consignee:'BUYER\nBuyer Address',notify:'NOTIFY',origin:'Origin Address',destination:'Destination Address',originPortCode:'VNHPH',destinationPortCode:'KRINC',cargo:'Garment',marks:'PRESERVE MARKS',placeOfReceipt:'PRESERVE RECEIPT',placeOfDelivery:'PRESERVE DELIVERY',incoterms:'CIF',freightTerms:'Prepaid',quantity:'99',cbm:'88',weightKg:'120',unit:'PKG',containers:mode==='FCL'?[{size:'20',type:'DC',count:'1'}]:[],packages:mode==='FCL'?[]:[{quantity:'3',lengthM:'0.1',widthM:'0.2',heightM:'0.3'}]}},original=structuredClone(job.data);
  if(process.argv.includes('--shared-sr-only')){job.customerId=11;job.requestCreatedByOrgId=7;job.requestSnapshot={mode:job.mode,status:'DRAFT',data:structuredClone(job.data)};}
  if(process.argv.includes('--multi-bl-only'))job.bills=[['m-a','MASTER','M-A',null],['m-b','MASTER','M-B',null],['h-a','HOUSE','H-A','m-a'],['h-b','HOUSE','H-B','m-b']].map(([id,kind,number,masterId])=>({id,orgId:7,jobId:job.id,kind,number,masterId,version:1,data:{shipper:number+' Shipper',consignee:'Consignee',cargo:number+' Cargo',weightKg:'100',quantity:'1',cbm:'1',releaseType:'ORIGINAL',surrenderStatus:'NONE'}}));
  if(mode==='FCL')job.data.workScope={start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'};
  if(mode==='LCL')job.data.workScope={start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'};
  if(mode==='AIR')job.data.workScope={start:'ORIGIN_DOOR',end:'DESTINATION_TERMINAL'};
  if(mode==='LCL')job.bills=[{id:'shared-master',jobId:'source-job',kind:'MASTER',number:'M-001',data:{}},{id:'own-house',jobId:'job1',kind:'HOUSE',number:'H-001',data:{}}];
  if(process.argv.includes('--route-colors-only'))Object.assign(job.data,{plannedDate:'2026-11-26',etd:'2026-11-27',routeDateDESTINATION_TERMINAL:'2026-11-28',routeDateDESTINATION_DOOR:''});
  const outputWrites=[];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},charges=[];
  await page.route('**/freight/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(key==='transport-jobs')json={rows:[job],total:1};else if(key==='options')json=[customer,{id:12,code:'NEW',name:'NEW CUSTOMER'}];else if(key==='transport-jobs/options')json={forwarder:{id:7,name:'DEX LOGIS'},employees:[],currencies:[{code:'USD'}]};else if(key==='transport-jobs/job1')json=job;
   else if(process.argv.includes('--inline-bl-only')&&key==='transport-jobs/job1/documents'){
    const body=req.postDataJSON();outputWrites.push(body);if(outputWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});const bill=job.bills.find(row=>row.id===body.billId);json={id:'output-1',number:'HOUSE_DRAFT-OUTPUT',kind:'HOUSE_DRAFT',sourceVersion:job.version,snapshot:{layout:'bill-form-v3',issuer:{name:'DEX LOGIS'},source:{mode:'SEA',bill:{id:bill.id,number:bill.number,kind:bill.kind,issuer:bill.issuer},data:structuredClone(bill.data)}}};
   }
   else if(process.argv.includes('--inline-bl-only')&&key.startsWith('transport-jobs/job1/bills')){
    const body=req.postDataJSON();billWrites.push(body);if(billWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,number:body.kind==='HOUSE'&&!body.number?'DEXL2611001':body.number,houseNumberManaged:body.kind==='HOUSE',orgId:7,jobId:job.id,version:(body.version||0)+1};job.bills=job.bills.filter(row=>row.id!==body.id).concat(json);
   }
   else if(key==='transport-jobs/job1/bills'){const body=req.postDataJSON();billWrites.push(body);if(billWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,jobId:job.id,orgId:7,version:1};job.bills=[json];}
   else if(key==='transport-jobs/job1/operation-details'){const body=req.postDataJSON();writes.push(body);if(body.fields.customerId){if(process.argv.includes('--customer-only')&&writes.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});job.customerId=body.fields.customerId;job.data.customer={id:12,name:'NEW CUSTOMER'};job.version++;return route.fulfill({headers,json:job});}job.data.workDetails={...job.data.workDetails,...body.fields};if(process.argv.includes('--shared-sr-only')){Object.assign(job.data,body.fields);Object.assign(job.requestSnapshot.data,body.fields);}job.version++;json=job;}
   else throw Error('Unexpected freight API '+key);return route.fulfill({headers,json});});
  await page.route('**/shipping-requests/**',async route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const key=new URL(req.url()).pathname.split('/shipping-requests/')[1];let json;
   if(key==='job1/charges'&&req.method()==='POST'){const body=req.postDataJSON();chargeWrites.push(body);if(chargeWrites.length===1)return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});json={...body,version:1};charges.push(json);}
   else if(key==='job1/charges')json={rows:charges,currencies:[{code:'USD'}],parties:[customer]};else json=[];return route.fulfill({headers,json});});
  await page.goto(`http://127.0.0.1:${port}/shipping-work-layout-test.html?theme=${width===390?'standard':'compact'}`,{waitUntil:'domcontentloaded',timeout:60000});
  if(process.argv.includes('--shared-sr-only')){
   await page.getByRole('button',{name:opView(),exact:true}).click();
   function opView(){return t.viewSr+' \u00b7 '+job.number;}
   const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:t.editSr,exact:true}).click();
   const sr=dialog.getByTestId('shipping-operations-form');await sr.waitFor();await sr.locator('[name=cargo]').fill('SR Changed Cargo');
   const count=sr.locator('[data-container-row] input').first();await count.fill('3');assert.equal(writes.length,0);
   await dialog.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(()=>window.notices?.some(n=>n.severity==='success'));
   assert.equal(writes.length,1);assert.deepEqual(writes[0].fields,{cargo:'SR Changed Cargo',containers:[{size:'20',type:'DC',count:'3'}]});assert.equal(job.requestSnapshot.data.cargo,'SR Changed Cargo');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await dialog.getByRole('button',{name:t.close,exact:true}).click();console.log('PASS current SR shared cargo/containers edit and save',lang,width);await page.close();continue;
  }
  const form=page.getByTestId('shipping-operations-form');await form.waitFor({timeout:60000});
  if(process.argv.includes('--multi-bl-only')){
   const flow=billWorkflowText[lang];
   for(const [kind,first,second] of [['MASTER','M-A','M-B'],['HOUSE','H-A','H-B']]){
    await page.locator('[data-bl-tab='+kind+'] button').first().click();await page.getByRole('button',{name:first,exact:true}).click();const editor=page.locator('[data-shipping-bills]');await editor.waitFor();assert.equal(await page.getByRole('dialog').count(),0);const picker=editor.locator('[data-bl-document-picker] [role=combobox]');await picker.click();const options=page.getByRole('option');assert.equal(await options.count(),2);await options.filter({hasText:second}).click();assert.equal(await editor.locator('[name=billNumber]').inputValue(),second);assert.equal(await editor.locator('[name=cargo]').inputValue(),second+' Cargo');
    await editor.locator('[name=cargo]').fill('Unsaved Change');await picker.click();await page.getByRole('option').filter({hasText:first}).click();assert.equal(await editor.locator('[name=billNumber]').inputValue(),second);assert.equal(await editor.locator('[name=cargo]').inputValue(),'Unsaved Change');
    page.removeAllListeners('dialog');page.once('dialog',d=>d.accept());await picker.click();await page.getByRole('option').filter({hasText:first}).click();assert.equal(await editor.locator('[name=billNumber]').inputValue(),first);assert.equal(await editor.locator('[name=cargo]').inputValue(),first+' Cargo');page.on('dialog',d=>d.dismiss());await page.getByRole('button',{name:t.detail,exact:true}).click();await editor.waitFor({state:'hidden'});
   }
   assert.equal(writes.length,0);assert.equal(billWrites.length,0);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS multi Master/House selection with same-kind options and discard guards',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--inline-bl-only')){
   const flow=billWorkflowText[lang],labels=shippingWorkbenchText[lang];await page.evaluate(()=>{window.printed=[];window.open=()=>({opener:null,document:{write(html){window.printed.push(html);},close(){}},focus(){},print(){},close(){}});});
   await form.locator('[name=cargo]').fill('Waybill Draft');await page.getByRole('button',{name:flow.addMaster,exact:true}).click();await page.getByRole('button',{name:flow.direct,exact:true}).click();
   const editor=page.locator('[data-shipping-bills]');await editor.waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await form.isVisible(),false);assert.equal(await editor.locator('[data-list-detail-list]').count(),0);assert.equal(await editor.locator('[data-shipping-bl-form] fieldset').first().evaluate(n=>getComputedStyle(n).borderTopWidth),'0px');assert.equal(await editor.locator('[data-bl-surrender]').count(),0);assert.equal(await editor.getByRole('button',{name:labels.print,exact:true}).count(),0);
   await editor.locator('[name=billNumber]').fill('MASTER-INLINE');await editor.getByRole('button',{name:b.save,exact:true}).click();await editor.getByRole('button',{name:b.retry,exact:true}).waitFor();assert.equal(await page.locator('[data-bl-tab=HOUSE] button').first().isDisabled(),true);await editor.getByRole('button',{name:b.retry,exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-bl-tab=MASTER]').textContent.includes('(1)'));assert.deepEqual(billWrites[0],billWrites[1]);
   await page.locator('[data-bl-tab=HOUSE] button').first().click();await editor.waitFor({state:'hidden'});await page.getByRole('button',{name:flow.addHouse,exact:true}).click();await page.getByRole('button',{name:flow.standalone,exact:true}).click();await editor.waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await editor.getByRole('button',{name:labels.print,exact:true}).isDisabled(),true);
   await editor.getByRole('combobox',{name:/^Surrender/}).click();await page.getByRole('option',{name:flow.confirmed,exact:true}).click();await editor.getByLabel(flow.confirmDate,{exact:true}).fill('2026-11-27');await editor.getByRole('textbox',{name:flow.reference,exact:true}).fill('CONFIRM-1');await editor.getByRole('button',{name:b.save,exact:true}).click();await page.waitForFunction(()=>document.querySelector('[name=billNumber]')?.value==='DEXL2611001');
   if(lang==='ko'&&width===1440)await page.screenshot({path:'logs/inline-house-bl-preview.png',fullPage:true});
   await editor.getByRole('button',{name:labels.print,exact:true}).click();await editor.getByRole('button',{name:b.retry,exact:true}).waitFor().catch(async e=>{console.log('INLINE_PRINT_DIAGNOSTIC',JSON.stringify({outputWrites,bills:job.bills,body:await editor.innerText()}));throw e;});assert.equal(await page.locator('[data-bl-tab=MASTER] button').first().isDisabled(),true);await editor.getByRole('button',{name:b.retry,exact:true}).click();await page.waitForFunction(()=>window.printed.length===1);assert.deepEqual(outputWrites[0],outputWrites[1]);assert.equal(outputWrites[1].kind,'HOUSE_DRAFT');assert.equal(outputWrites[1].billVersion,1);assert.match((await page.evaluate(()=>window.printed[0])),/SURRENDERED/);
   await editor.locator('[name=cargo]').fill('Unsaved House');assert.equal(await editor.getByRole('button',{name:labels.print,exact:true}).isDisabled(),true);await page.getByRole('button',{name:t.detail,exact:true}).click();assert.equal(await editor.isVisible(),true);page.removeAllListeners('dialog');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:t.detail,exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(await form.locator('[name=cargo]').inputValue(),'Waybill Draft');await page.getByRole('button',{name:flow.addMaster,exact:true}).click();await page.getByRole('button',{name:flow.combined,exact:true}).click();await editor.locator('[name=billNumber]').fill('MASTER-COMBINED');await editor.getByRole('button',{name:b.save,exact:true}).click();await page.waitForFunction(()=>document.querySelector('[name=billNumber]')?.readOnly===true);assert.equal(await editor.getByRole('textbox',{name:flow.master,exact:true}).inputValue(),'MASTER-COMBINED');assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS inline BL, no editor dialog, House-only surrender/print, retry and draft guards',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--empty-bl-only')){
   await form.locator('[name=cargo]').fill('Preserved Draft');
   for(const kind of ['MASTER','HOUSE']){
    const tab=page.locator('[data-bl-tab='+kind+']');assert.match(await tab.innerText(),/\(0\)/);await tab.locator('button').first().click();assert.equal(await form.isVisible(),false);assert.equal(await page.locator('[data-shipping-bl-form]').count(),0);assert.equal(await page.getByText(kind==='MASTER'?t.noMaster:t.noHouse,{exact:true}).isVisible(),true);assert.equal(writes.length,0);assert.equal(billWrites.length,0);
   }
   await page.getByRole('button',{name:t.detail,exact:true}).click();assert.equal(await form.isVisible(),true);assert.equal(await form.locator('[name=cargo]').inputValue(),'Preserved Draft');
   await page.locator('[data-bl-tab=MASTER] button').first().click();await page.getByRole('button',{name:billWorkflowText[lang].addMaster,exact:true}).click();assert.equal(await page.locator('[data-shipping-bl-form]').count(),0);await page.getByRole('button',{name:billWorkflowText[lang].direct,exact:true}).click();await page.locator('[data-shipping-bl-form]').waitFor();assert.equal(billWrites.length,0);assert.match(await page.locator('[data-bl-tab=MASTER]').innerText(),/\(0\)/);
   await page.getByRole('button',{name:t.detail,exact:true}).click();assert.equal(await form.isVisible(),true);assert.equal(await form.locator('[name=cargo]').inputValue(),'Preserved Draft');assert.deepEqual(errors,[]);console.log('PASS empty BL tabs show no shipment or fabricated document and preserve drafts',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--close-ui-only')){
   const workflow=billWorkflowText[lang];await page.getByRole('button',{name:workflow.addMaster,exact:true}).click();await page.getByRole('button',{name:workflow.direct,exact:true}).click();
   const editor=page.locator('[data-shipping-bills]');await editor.waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('button',{name:t.returnDetail,exact:true}).count(),0);
   await editor.locator('input[name=billNumber]').fill('UNSAVED');await page.getByRole('button',{name:t.detail,exact:true}).click();assert.equal(await editor.isVisible(),true);page.removeAllListeners('dialog');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:t.detail,exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(billWrites.length,0);assert.deepEqual(errors,[]);console.log('PASS inline navigation preserves unsaved guard',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--numeric-only')){
   for(const key of ['quantity','weightKg']){
    const input=form.locator('[name='+key+']');await input.fill('0012345.2500');assert.equal(await input.inputValue(),'12,345.2500');assert.equal(await input.evaluate(n=>getComputedStyle(n).textAlign),'right');
    await input.fill('0');await input.press('End');await input.pressSequentially('100');assert.equal(await input.inputValue(),'100');await input.fill('12345.2500');
   }
   const volume=form.locator('[name=cbm]');await volume.fill('0012345.2500');await form.locator('[name=cargo]').click();assert.equal(await volume.inputValue(),'12,345.25');assert.equal(await volume.evaluate(n=>getComputedStyle(n).textAlign),'right');
   await Promise.all([page.waitForResponse(r=>r.url().includes('/operation-details')&&r.request().method()==='PUT'),page.locator('.app-page-header').getByRole('button',{name:t.save,exact:true}).click()]);
   assert.equal(writes.at(-1).fields.quantity,'12345.2500');assert.equal(writes.at(-1).fields.weightKg,'12345.2500');assert.equal(writes.at(-1).fields.cbm,'12345.25');assert.deepEqual(errors,[]);console.log('PASS numeric formatting and raw save',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--info-layout-only')){
   const summary=form.locator('[data-shipping-work-summary]'),customer=summary.locator('.MuiOutlinedInput-root').nth(0),date=summary.locator('.MuiOutlinedInput-root').nth(1),assignee=form.locator('[data-shipping-work-assignee] .MuiOutlinedInput-root');
   const a=await customer.boundingBox(),b=await date.boundingBox(),c=await assignee.boundingBox();
   assert.ok(Math.abs(a.y-b.y)<=1);assert.ok(Math.abs(a.height-b.height)<=1);assert.ok(Math.abs(a.height-c.height)<=1);assert.ok(Math.abs(a.x-c.x)<=1);
   const input=date.locator('input');assert.equal(await input.inputValue(),'2026-11-25');assert.equal(await input.getAttribute('readonly'),'');assert.equal(await input.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(writes.length,0);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(lang==='ko'&&width===1440)await form.locator('[data-shipping-work-side] > *').first().screenshot({path:'logs/shipping-info-layout-preview.png'});
   console.log('PASS aligned outlined customer/date/assignee',lang,width);await page.close();continue;
  }
  if(process.argv.includes('--customer-only')){
   const input=form.getByRole('textbox',{name:t.customer,exact:true});await input.fill('NEW');await input.press('Enter');assert.equal(writes.length,0);
   assert.equal(await form.locator('[name=shipper]').inputValue(),original.shipper);
   await page.locator('button[form=shipping-operation-job1]').click();await page.waitForTimeout(500);assert.equal(writes.length,1,JSON.stringify(await form.locator(':invalid').evaluateAll(nodes=>nodes.map(n=>({name:n.name,value:n.value,message:n.validationMessage})))));await page.locator('button[form=shipping-operation-job1]').filter({hasText:t.retry}).waitFor();assert.equal(await input.isDisabled(),true);
   await page.locator('button[form=shipping-operation-job1]').click();await page.waitForFunction(()=>document.querySelector('[data-testid=shipping-operations-form] input')&&window.notices?.some(n=>n.severity==='success'));
   assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[1].fields,{customerId:12});assert.equal(job.customerId,12);assert.equal(await input.isDisabled(),false);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS customer change, no implicit party edits, unknown-result lock and retry',lang,width);await page.close();continue;
  }
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
