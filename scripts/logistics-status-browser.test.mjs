import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve('frontend/logistics-status-acceptance.html'),port=43562;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import '/src/styles/form.css';import '/src/styles/table.css';import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import {appThemes} from '/src/theme';import Page from '/src/pages/App/LogisticsStatusBoard.jsx';
window.harnessReact=React;window.harnessCreateRoot=createRoot;const theme=appThemes[new URLSearchParams(location.search).get('theme')||'standard'];createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/customer-production-report']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/logistics-status-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1440,390])for(const theme of ['standard','compact']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[];let failed=false;
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(15000);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,activeOrgType:'SERVICE',isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN'}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${language}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={navigateToPath:path=>window.openedPath=path,markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(message,severity,options)=>{window.noticeRoot??=window.harnessCreateRoot(document.body.appendChild(document.createElement('div')));window.noticeRoot.render(window.harnessReact.createElement('div',{role:'alert'},window.harnessReact.createElement('span',null,message),options?.action));},removeNotification:()=>window.noticeRoot?.render(null)};export const useAppActions=()=>actions;`}));
  await page.route('**/logistics-status-reports*',async route=>{
   const req=route.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({headers});assert.equal(req.method(),'GET');
   const params=new URL(req.url()).searchParams;requests.push(Object.fromEntries(params));assert.equal(params.get('orgId'),'7');
   if(failed)return route.fulfill({status:503,headers,json:{error:'UNAVAILABLE'}});
   const customer={id:20,name:'BARO - THE SAN'},second={id:21,name:'DAEWOO'},base={shipmentType:'FCL',mode:'SEA',service:'GENERAL',jobType:'IMPORT',status:'IN_TRANSIT',cargo:'Steel Coils',origin:'Hai Phong',destination:'Busan',schedules:[{id:'master-1',number:'MBL-1',etd:'2026-11-21',eta:'2026-11-26'},{id:'master-2',number:'MBL-2',etd:'2026-11-22',eta:'2026-11-27'}],quantity:'0',unit:'PKG',weightKg:'1234.5',cbm:'0',containers:[{count:'20',size:'40',type:'HQ'}],cargoReadyDate:'2026-11-19',remark:'Make DN\nInspection 10 Containers',deliveryDate:null};
   let rows=[{...base,id:'job-1',number:'SR-001',customerId:20,customer},{...base,id:'job-2',number:'SR-002',cargoReadyDate:null,customerId:21,customer:second}];
   if(params.get('includeCompleted')==='true')rows.push({...base,id:'job-3',number:'SR-003',customerId:20,customer,status:'DELIVERED',deliveryDate:'2026-11-25'});
   if(params.get('customerId'))rows=rows.filter(row=>String(row.customerId)===params.get('customerId'));
   if(params.get('search')==='missing')rows=[];
   return route.fulfill({headers,json:{rows,total:rows.length,customers:[customer,second]}});
  });
  await page.goto(`http://127.0.0.1:${port}/logistics-status-acceptance.html?theme=${theme}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('[data-logistics-row="job-1"]').waitFor({timeout:60000});await page.getByRole('progressbar').waitFor({state:'hidden'});
  const labels=await page.evaluate(async language=>(await import('/src/pages/App/LogisticsStatusBoard.jsx')).logisticsBoardText[language],language);
  assert.deepEqual(await page.evaluate(async()=>{const {information:f}=await import('/src/pages/App/LogisticsStatusBoard.jsx');return [f({mode:'SEA',shipmentType:'LCL',cbm:'2.5'}),f({mode:'AIR',chargeableWeightKg:'100'}),f({service:'EXPRESS',chargeableWeightKg:'12'}),f({mode:'ROAD',vehicleCount:2,vehicleUnit:'Vehicles'}),f({mode:'AIR',weightKg:100})];}),['2.5 CBM','100 CWT','12 CWT','2 Vehicles','—']);
  assert.equal(await page.locator('thead').first().getByRole('columnheader').count(),8);assert.ok(await page.locator('[data-logistics-row="job-1"]').innerText().then(text=>text.includes("20x40'HQ")&&text.includes('MBL-2')&&!text.includes('0 PKG')));
  assert.ok(await page.locator('[data-logistics-row="job-1"] td').nth(5).innerText().then(text=>text==='—'));
  assert.equal(await page.getByRole('columnheader',{name:'CGO',exact:true}).count(),1);assert.equal(await page.locator('[data-logistics-row="job-1"] td').nth(2).innerText(),'2026-11-19');assert.equal(await page.locator('[data-logistics-row="job-2"] td').nth(2).innerText(),String.fromCharCode(8212));
  const completion=page.getByRole('combobox').first();await completion.click();await page.getByRole('option').last().click();await page.locator('[data-logistics-row="job-3"]').waitFor();
  const customer=page.getByRole('combobox').nth(1);await customer.click();await page.getByRole('option',{name:'DAEWOO',exact:true}).click();await page.locator('[data-logistics-row="job-1"]').waitFor({state:'hidden'});await page.locator('[data-logistics-row="job-2"]').waitFor();
  const search=page.getByPlaceholder(labels.search);await search.fill('missing');await page.getByText(labels.empty,{exact:true}).waitFor();await page.locator('[data-search-reset]').click();await page.locator('[data-logistics-row="job-1"]').waitFor();
  failed=true;await page.getByRole('button',{name:labels.refresh,exact:true}).click();await page.getByText(labels.failed,{exact:true}).waitFor().catch(async error=>{console.error(JSON.stringify({requests,body:await page.locator('body').innerText(),notice:await page.locator('[data-app-notice]').count(),visibility:await page.evaluate(()=>document.visibilityState)}));throw error;});assert.equal(await page.locator('[data-logistics-row="job-1"]').count(),1);assert.equal(await page.getByText(labels.empty,{exact:true}).count(),0);
  const attempts=requests.length;await page.waitForTimeout(500);assert.equal(requests.length,attempts);failed=false;await page.getByRole('button',{name:labels.retry,exact:true}).click();await page.getByRole('progressbar').waitFor({state:'hidden'});
  if(language==='en'&&width===1440&&theme==='standard'){mkdirSync('logs',{recursive:true});await page.screenshot({path:'logs/logistics-status-preview.png',fullPage:true});}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-logistics-row="job-1"]').getByRole('button',{name:'BARO - THE SAN'}).click();assert.equal(await page.evaluate(()=>window.openedPath),'/shipping/job-1');assert.deepEqual(errors,[]);
  await page.close();console.log('PASS logistics board filters, MBL dates, retry, retained rows, navigation',language,width,theme);
 }
}finally{await browser?.close();vite.kill();if(existsSync(file))unlinkSync(file);}
