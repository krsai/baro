import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';
const fixture=path.resolve('frontend/customer-industry-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React,{useState}from'react';import{MemoryRouter}from'react-router-dom';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Panel from'/src/pages/App/customer/CustomerBasicInfoPanel.jsx';import{buildCustomerFormData,buildCustomerPayload}from'/src/pages/App/customer/customerFormShared';function App(){const[form,setForm]=useState(buildCustomerFormData({id:1,name:'THE SAN',systemIndustryId:94,classification:window.testClassification}));return React.createElement(React.Fragment,null,React.createElement(Panel,{customerFormData:form,savingCustomer:false,languageCode:window.testLang,onBasicFieldChange:e=>setForm(s=>({...s,[e.target.name]:e.target.value})),onCountryChange:()=>{},t:k=>k}),React.createElement('pre',{'data-testid':'payload'},JSON.stringify(buildCustomerPayload(form))))}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App))));</script></body></html>`);
const port=43223,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/customer-industry-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const role={id:1,code:'CUSTOMER',nameKo:'CUSTOMER',nameEn:'CUSTOMER',nameVi:'CUSTOMER'};
  const industries=[{id:94,code:'WOVEN',nameKo:'직물(우븐)',nameEn:'Woven',nameVi:'Dệt thoi'},{id:96,code:'COMBINED',nameKo:'종합(직물·편물)',nameEn:'Woven & knit',nameVi:'Dệt thoi và dệt kim'}].map(row=>({...row,isActive:true,partnerRoleId:1,partnerRole:role}));
  await page.addInitScript(({lang,classification})=>{window.testLang=lang;window.testClassification=classification;},{lang,classification:{revision:2,roleIds:[1],industryIds:[94],industries:[industries[0]],legacyGeneral:[]}});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/partner-classifications/options?*',r=>{assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'1');return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{roles:[role],industries}});});
  await page.goto('http://127.0.0.1:'+port+'/customer-industry-acceptance.html');
  const input=page.getByRole('combobox',{name:'CUSTOMER > '+PARTNER_CLASSIFICATION_TEXT[lang].industry,exact:true});await input.waitFor();
  const label=industries[1][{ko:'nameKo',en:'nameEn',vi:'nameVi'}[lang]];await input.fill(label);await page.getByRole('option',{name:label,exact:true}).click();await page.keyboard.press('Escape');
  const payload=JSON.parse(await page.getByTestId('payload').innerText());assert.deepEqual(payload.classification,{revision:2,roleIds:[1],industryIds:[94,96]});assert.ok(!('systemIndustryId'in payload));assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Customer industry ko/en/vi: saved classification display, multiple SYSTEM industry IDs and legacy scalar preservation passed.');
}finally{await browser?.close();vite.kill();if(existsSync(fixture))unlinkSync(fixture);}
