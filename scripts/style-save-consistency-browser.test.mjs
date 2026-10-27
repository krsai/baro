import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/style-save-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Detail from'/src/pages/App/style/StyleDetail.jsx';window.notices=[];createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(MemoryRouter,{initialEntries:['/style/1?ownerOrgId=1']},React.createElement(Routes,null,React.createElement(Route,{path:'/style/:styleId',element:React.createElement(Detail)})))));</script></body></html>`);
const port=43243,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/style-save-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgType:"MANUFACTURER",activeProfile:{orgName:"BARO"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(message,level)=>window.notices.push({message,level})};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
  await page.route('**/src/hooks/useUnsavedChanges*',r=>r.fulfill({contentType:'application/javascript',body:'export default()=>{};'}));
  await page.route('**/styleDetail/StyleInfo.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export default({formData,handleInputChange})=>React.createElement('button',{onClick:()=>handleInputChange({target:{name:'processes',value:formData.processes.map(p=>({...p,pt:71}))}})},'Edit process');`}));
  for(const name of ['StyleBom','StyleProcess','StyleTimeMatrix'])await page.route(`**/styleDetail/${name}.jsx*`,r=>r.fulfill({contentType:'application/javascript',body:'export default()=>null;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};let writes=0,confirms=0;
  const style={id:1,ownerOrgId:1,customerOrgId:2,name:'SAN040',customer:'THE SAN',styleCode:'SAN040',processes:[{id:1,code:'C01',pt:70,stBuckets:[{bucketQuantity:1000,bucketStSeconds:70000}]}]};
  await page.route('**/styles/1?*',async r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='GET')return r.fulfill({headers,json:style});writes++;await new Promise(resolve=>setTimeout(resolve,250));if(writes===1)return r.fulfill({headers,status:500,json:{error:'Simulated save failure'}});return r.fulfill({headers,json:{...style,processes:r.request().postDataJSON().processes}});});
  await page.route('**/styles/1/process-versions?*',r=>r.fulfill({headers,json:{versions:[{id:1,versionNumber:1,confirmedDate:'2026-10-27',processCount:1,name:'Ver.1'}],assignments:[],hasUnconfirmedChanges:false}}));
  await page.route('**/styles/1/process-versions/confirm?*',r=>{confirms++;return r.fulfill({headers,status:500,json:{error:'Unnecessary confirmation'}});});
  await page.goto(`http://127.0.0.1:${port}/style-save-acceptance.html`);await page.getByRole('button',{name:'Edit process'}).click();
  const save=page.locator('button.MuiButton-contained').first();await save.waitFor();
  await save.evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>window.notices.some(n=>n.level==='error'));assert.equal(writes,1);assert.equal(await save.isDisabled(),false);
  await save.evaluate(button=>{button.click();button.click();});
  await page.getByRole('dialog').waitFor();assert.equal(writes,2);assert.equal(confirms,0);
  assert.equal(await page.locator('.MuiAlert-standardWarning').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Style save passed ko/en/vi: same-tick double clicks deduplicated, failed save retries, successful atomic save opens versions without a second confirmation.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
