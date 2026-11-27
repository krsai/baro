import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/shipping-job-charges-test.html',port=43567;
assert.ok(!existsSync(html));
writeFileSync(html,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{appThemes}from'/src/theme';import Page from'/src/components/ShippingJobCharges';import'/src/styles/form.css';
const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme:appThemes[p.get('theme')]},React.createElement(CssBaseline),React.createElement(Page,{open:true,orgId:7,job:{id:'job-000002',number:'JOB-000002',status:'DRAFT'},languageCode:p.get('lang'),onClose:()=>{window.closedCharges=true;}}))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-job-charges-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const theme of ['standard','compact']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],rows=[];let first=true;
  page.setDefaultTimeout(12000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN'}});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const actions={showNotification(){},navigateToPath:path=>window.openedPath=path,markTabChanged(){},clearTabChanged(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){}};export const useAppActions=()=>actions;`}));
  await page.route('**/text-acronyms*',route=>route.fulfill({json:{revision:0,entries:[]}}));
  await page.route('**/shipping-requests/**',async route=>{const req=route.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({headers});
   if(req.url().includes('/charge-sources/')){const row=rows.find(row=>req.url().includes(row.id));return route.fulfill({headers,json:{...row,jobId:'job-000002',jobNumber:'JOB-000002'}});}
   if(req.method()==='POST'){const body=req.postDataJSON();writes.push(body);assert.equal(body.billId,null);if(first){first=false;return route.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}});}const saved={...body,version:1};rows.push(saved);return route.fulfill({headers,json:{id:body.id,version:1}});}
   return route.fulfill({headers,json:{rows,parties:[],currencies:[{code:'USD'}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/shipping-job-charges-test.html?lang=${lang}&theme=${theme}`);
  const t=await page.evaluate(async lang=>(await import('/src/components/ShippingJobCharges.jsx')).shippingJobChargeText[lang],lang),dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:t.add,exact:true}).waitFor().catch(async error=>{console.error(await page.locator('body').innerText());throw error;});await page.waitForFunction(()=>!document.querySelector('[data-table-action="add"]').disabled);
  assert.equal(await dialog.getByRole('tab').count(),2);assert.equal(await dialog.locator('[data-charge-draft]').count(),0);
  for(const [direction,tab] of [['SALES',t.ar],['PURCHASE',t.ap]]){
   await dialog.getByRole('tab',{name:tab,exact:true}).click();await dialog.getByRole('button',{name:t.add,exact:true}).click();
   const editor=dialog.locator('[data-shipping-job-charge-editor]');await editor.waitFor();assert.equal(await editor.getByRole('textbox',{name:t.target,exact:true}).inputValue(),'JOB-000002');
   await editor.locator('[name=description]').fill(direction==='SALES'?'Ocean Freight':'Trucking');await editor.locator('[name=quantity]').fill('2');await editor.locator('[name=unitPrice]').fill('12.5');assert.equal(await editor.getByRole('textbox',{name:t.amount,exact:true}).inputValue(),'25');
   await dialog.getByRole('button',{name:t.save,exact:true}).click();
   if(direction==='SALES'){await dialog.getByRole('button',{name:t.retry,exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:t.close,exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:t.retry,exact:true}).click();}
   await page.waitForFunction(()=>document.querySelector('[data-dialog-record-actions] button')?.disabled).catch(async error=>{console.error(JSON.stringify({writes,body:await page.locator('body').innerText()}));throw error;});
   const label=direction==='SALES'?{ko:'청구서 작성',en:'Create Invoice',vi:'Lập Hóa Đơn'}[lang]:{ko:'비용신청 작성',en:'Create Expense Request',vi:'Lập Đề Nghị Chi Phí'}[lang];
   await dialog.getByRole('button',{name:label,exact:true}).click();assert.ok((await page.evaluate(()=>window.openedPath)).startsWith(direction==='SALES'?'/invoices/new?shippingChargeId=':'/outsourcing-record/new?shippingChargeId='));
  }
  assert.deepEqual(writes[0],writes[1]);assert.equal(writes[2].direction,'PURCHASE');assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(lang==='ko'&&width===1440&&theme==='standard'){mkdirSync('logs',{recursive:true});await page.screenshot({path:'logs/shipping-job-charges-preview.png',fullPage:true});}
  console.log('PASS job AR/AP split, list/detail entry, exact retry and native financial navigation',lang,width,theme);await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
