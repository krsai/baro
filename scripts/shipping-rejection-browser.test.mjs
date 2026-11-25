import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingText} from '../frontend/src/constants/shippingRequests.js';
const file='frontend/shipping-rejection-test.html',port=43573;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/ShippingRequests';import PageDialogProvider from'/src/components/PageDialogProvider';import'/src/styles/form.css';
function Root(){window.nav=useNavigate();return React.createElement(PageDialogProvider,null,React.createElement('button',{onClick:()=>window.nav('/shipping')},'List'),React.createElement(Routes,null,React.createElement(Route,{path:'/shipping',element:React.createElement(Page)}),React.createElement(Route,{path:'/shipping/:jobId',element:React.createElement(Page)})));}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/shipping']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Root))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-rejection-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const orgType of ['SERVICE','BRAND']){
  const page=await browser.newPage({viewport:{width,height:1050}}),errors=[],writes=[],t=shippingText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:7,activeOrgType:'${orgType}'});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},markTabChanged(){},clearTabChanged(){},navigateToPath(path){window.nav(path);},closeTab(id){window.closedTab=id;}};export const useAppActions=()=>a;'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
  const job={id:'job1',number:'JOB-000001',orgId:7,requestCreatedByOrgId:7,mode:'ROAD',receiptStatus:'ACCEPTED',status:'DRAFT',version:1,bills:[],documents:[],data:{customer:{id:11,name:'CUSTOMER'},origin:'Hanoi',destination:'Seoul',shipper:'Sender',consignee:'Buyer',cargo:'Garment'}};
  let deleted=false,failReject=true,failDelete=true;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'*'};
  await page.route('**/freight/**',async r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({headers});const p=new URL(req.url()).pathname.split('/freight/')[1];let json;
   if(p==='options')json=[];else if(p==='transport-jobs/options')json={forwarder:{id:7,name:'DEX'},employees:[],currencies:[]};else if(p==='transport-jobs')json={rows:deleted?[]:[job],total:deleted?0:1};else if(p==='transport-jobs/job1')json=job;else throw Error('Unexpected '+p);return r.fulfill({headers,json});});
  await page.route('**/shipping-requests/job1*',async r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({headers});const body=req.postDataJSON();writes.push({method:req.method(),body});
   if(req.method()==='POST'){if(failReject){failReject=false;return r.fulfill({headers,status:409,json:{error:'SHIPPING_REJECT_BLOCKED'}});}job.receiptStatus='REJECTED';job.version++;return r.fulfill({headers,json:{id:job.id,version:job.version,receiptStatus:'REJECTED'}});}
   if(failDelete){failDelete=false;return r.fulfill({headers,status:503,json:{error:'TEMPORARY'}});}deleted=true;return r.fulfill({headers,json:{id:job.id,deleted:true}});});
  if(orgType==='BRAND')await page.route('**/shipping-requests**',async r=>{
   const req=r.request(),path=new URL(req.url()).pathname;if(req.method()==='OPTIONS')return r.fulfill({headers});
   if(req.method()==='DELETE'){writes.push({method:'DELETE',body:req.postDataJSON()});if(failDelete){failDelete=false;return r.fulfill({headers,status:503,json:{error:'TEMPORARY'}});}deleted=true;return r.fulfill({headers,json:{id:job.id,deleted:true}});}
   return r.fulfill({headers,json:path.endsWith('/options')?{self:{id:7,name:'BRAND'},customers:[],forwarders:[]}:[...(deleted?[]:[{...job,company:'DEX',receiptStatus:'REJECTED',request:{mode:'ROAD',status:'DRAFT',data:job.data}}])]});
  });
  await page.goto(`http://127.0.0.1:${port}/shipping-rejection-test.html`);
  if(orgType==='BRAND'){
   const row=page.locator('[data-shipping-row=job1]');await row.waitFor();assert.equal(await row.locator('td').count(),6);await page.getByRole('columnheader',{name:t.actions,exact:true}).waitFor();
   const remove=row.getByRole('button',{name:t.deleteRejected,exact:true}),confirm=page.locator('[data-page-confirmation]');await remove.click();await confirm.getByRole('button').first().click();assert.equal(writes.length,0);
   await remove.click();await confirm.getByRole('button').last().click();await page.waitForTimeout(200);assert.equal(deleted,false);
   await remove.click();await confirm.getByRole('button').last().click();await row.waitFor({state:'hidden'});assert.deepEqual(writes[0],writes[1]);assert.deepEqual(errors,[]);await page.close();console.log('PASS source customer permanent delete and failure retry',lang,width);continue;
  }
  const row=page.locator('[data-shipping-row=job1]');await row.waitFor();assert.equal(await row.locator('td').nth(6).textContent(),t.ACCEPTED);assert.equal(await page.getByRole('columnheader',{name:t.actions,exact:true}).count(),1);assert.equal(await row.getByRole('button',{name:t.deleteRejected+' '+job.number,exact:true}).isDisabled(),true);
  await row.dblclick();await page.getByTestId('shipping-operations-form').waitFor();
  const reject=page.getByRole('button',{name:t.reject,exact:true});await reject.click();let confirm=page.locator('[data-page-confirmation]');await confirm.getByRole('button').first().click();assert.equal(writes.length,0);
  await reject.click();await confirm.getByRole('button').last().click();await page.waitForFunction(()=>document.body.textContent.includes('JOB-000001'));await reject.waitFor();await page.waitForTimeout(200);assert.equal(writes.length,1);assert.equal(job.receiptStatus,'ACCEPTED');
  await reject.click();await confirm.getByRole('button').last().click();await reject.waitFor({state:'hidden'});assert.equal(job.receiptStatus,'REJECTED');
  await page.getByRole('button',{name:'List',exact:true}).click();await row.getByText(t.REJECTED,{exact:true}).waitFor();assert.equal(await row.locator('td').nth(6).textContent(),t.REJECTED);
  const remove=row.getByRole('button',{name:t.deleteRejected+' '+job.number,exact:true});await remove.click();await confirm.getByText(t.deleteRejectedConfirm,{exact:true}).waitFor();await confirm.getByRole('button').first().click();assert.equal(writes.length,2);
  await remove.click();await confirm.getByRole('button').last().click();await page.waitForTimeout(200);assert.equal(deleted,false);assert.ok(await row.isVisible());
  await remove.click();await confirm.getByRole('button').last().click();await row.waitFor({state:'hidden'});assert.equal(deleted,true);assert.deepEqual(writes[2],writes[3]);assert.equal(await page.evaluate(()=>window.closedTab),'/shipping/job1');assert.deepEqual(errors,[]);await page.close();console.log('PASS received/rejected states, confirm/cancel, failure retry and permanent delete',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
