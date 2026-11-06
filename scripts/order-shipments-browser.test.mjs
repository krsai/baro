import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {orderShipmentText} from '../frontend/src/constants/orderShipments.js';
const fixture=path.resolve('frontend/order-shipments-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/OrderShipments.jsx';function Bridge(){window.testNavigate=useNavigate();return null;}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/order-shipments/12']},React.createElement(Bridge),React.createElement(Routes,null,React.createElement(Route,{path:'/order-shipments',element:React.createElement(Page)}),React.createElement(Route,{path:'/order-shipments/:orderId',element:React.createElement(Page)})))));</script></html>`);
const port=43301,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/order-shipments-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],t=orderShipmentText[lang];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`const actions={markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(message)=>{window.toasts=(window.toasts||[]).concat(message);},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>({...actions,navigateToPath:path=>window.testNavigate(path)});`}));
  let policy={excluded:false,version:0,reason:''},shipments=[],events=[];
  const cells=[{itemId:1,size:'S',ordered:100,style:{code:'SHIRT'},color:{name:'Red'},gender:'M'},{itemId:1,size:'M',ordered:50,style:{code:'SHIRT'},color:{name:'Red'},gender:'M'},{itemId:2,size:'S',ordered:40,style:{code:'SHIRT'},color:{name:'Blue'},gender:'M'}];
  const detail=()=>{const current=cells.map(cell=>{const shipped=shipments.filter(s=>!s.cancelledAt).flatMap(s=>s.lines).filter(c=>c.itemId===cell.itemId&&c.size===cell.size).reduce((n,c)=>n+c.quantity,0);return {...cell,shipped,remaining:cell.ordered-shipped};});return {order:{id:12,orderNumber:'ORD-12',customerOrg:{name:'Customer'}},policy,shipments,events,cells:current,totals:{ordered:190,shipped:current.reduce((n,c)=>n+c.shipped,0),remaining:current.reduce((n,c)=>n+c.remaining,0)}};};
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/orders/**',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({headers});const url=new URL(route.request().url()),method=route.request().method();
   if(method==='GET'&&url.pathname.endsWith('/orders/shipments'))return route.fulfill({headers,json:{rows:policy.excluded&&url.searchParams.get('mode')==='TRACKED'?[]:[{id:12,orderNumber:'ORD-12',customer:'Customer',ordered:190,shipped:detail().totals.shipped,excluded:policy.excluded}],total:1,page:0}});
   if(method==='GET')return route.fulfill({headers,json:detail()});
   const input=route.request().postDataJSON();writes.push({method,input,path:url.pathname});
   if(url.pathname.endsWith('shipping-policy')){policy={...input,version:policy.version+1};events.push({id:String(events.length),createdAt:new Date().toISOString(),actorName:'Operator',snapshot:policy});return route.fulfill({headers,json:policy});}
   if(url.pathname.endsWith('/cancel')){const shipment=shipments.find(s=>url.pathname.includes('/'+s.id+'/'));shipment.cancelledAt=new Date().toISOString();shipment.cancellationReason=input.reason;return route.fulfill({headers,json:shipment});}
   const shipment={id:'shipment-'+shipments.length,shipmentDate:input.shipmentDate,remark:input.remark,createdByName:'Operator',version:1,lines:input.lines.map(line=>({...cells.find(c=>c.itemId===line.itemId&&c.size===line.size),...line}))};shipments.unshift(shipment);return route.fulfill({headers,json:shipment});
  });
  console.log('Checking order shipments',lang,width);await page.goto(`http://127.0.0.1:${port}/order-shipments-acceptance.html`);await page.getByText('ORD-12',{exact:true}).waitFor().catch(async error=>{console.log(errors,await page.locator('body').innerText());throw error;});
  const quantity=page.getByRole('textbox',{name:`SHIRT Red ${t.M} S ${t.current}`,exact:true});await quantity.fill('20');await page.getByRole('textbox',{name:t.remark,exact:true}).fill('First dispatch');await page.getByRole('button',{name:t.register,exact:true}).click();await page.getByText('First dispatch',{exact:true}).waitFor();assert.equal(shipments.length,1);assert.equal(writes[0].input.lines[0].quantity,20);
  await quantity.fill('81');await page.getByRole('button',{name:t.register,exact:true}).click();await page.waitForFunction(message=>window.toasts?.includes(message),t.exceeds);assert.equal(shipments.length,1);
  await quantity.fill('30');await page.getByRole('button',{name:t.register,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('tbody').length===2);await page.waitForTimeout(250);assert.equal(shipments.length,2);
  await page.getByRole('button',{name:t.exclude,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Historical order');await dialog.getByRole('button',{name:t.confirm,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:t.resume,exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:t.register,exact:true}).count(),0);assert.equal(shipments.length,2);
  await page.getByRole('button',{name:t.resume,exact:true}).click();await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Resume');await dialog.getByRole('button',{name:t.confirm,exact:true}).click();await dialog.waitFor({state:'hidden'});await quantity.waitFor();
  await page.getByRole('button',{name:t.cancelShipment,exact:true}).first().click();await dialog.getByRole('textbox',{name:t.reason,exact:false}).fill('Wrong record');await dialog.getByRole('button',{name:t.confirm,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText(t.cancelled,{exact:true}).waitFor();assert.equal(detail().totals.shipped,20);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:t.back,exact:true}).click();await page.getByRole('textbox',{name:t.search,exact:true}).waitFor();await page.getByText('ORD-12',{exact:true}).waitFor();assert.equal(await page.getByText('ORD-12',{exact:true}).count(),1);await page.close();
 }
 console.log('Order shipment UI passed ko/en/vi desktop/mobile: partial quantities, over-limit rejection, tracking exclusion/resume, cancellation, history and viewport fit.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
