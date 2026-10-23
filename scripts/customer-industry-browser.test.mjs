import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/customer-industry-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Panel from '/src/pages/App/customer/CustomerBasicInfoPanel.jsx';import {buildCustomerFormData,buildCustomerPayload} from '/src/pages/App/customer/customerFormShared';
function App(){const [form,setForm]=useState(buildCustomerFormData({id:1,name:'THE SAN',systemIndustryId:94,systemIndustry:{id:94,nameKo:'직물(우븐)',nameEn:'Woven',nameVi:'Dệt thoi'}}));return React.createElement(React.Fragment,null,React.createElement(Panel,{customerFormData:form,countryOptions:[],savingCustomer:false,languageCode:window.testLang,onBasicFieldChange:e=>setForm(s=>({...s,[e.target.name]:e.target.value})),onCountryChange:()=>{},t:k=>k}),React.createElement('pre',{'data-testid':'payload'},JSON.stringify(buildCustomerPayload(form))))}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App)));</script></body></html>`);
const port=43223,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/customer-industry-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.addInitScript(v=>{window.testLang=v},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  const labels={ko:['세부 업종','직물(우븐)','종합(직물·편물)'],en:['Industry','Woven','Woven & knit'],vi:['Ngành nghề','Dệt thoi','Dệt thoi và dệt kim']}[lang];
  await page.route('**/customer-industries?*',r=>{assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'1');return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[{id:94,nameKo:'직물(우븐)',nameEn:'Woven',nameVi:'Dệt thoi'},{id:95,nameKo:'편물(다이마루)',nameEn:'Knit',nameVi:'Dệt kim'},{id:96,nameKo:'종합(직물·편물)',nameEn:'Woven & knit',nameVi:'Dệt thoi và dệt kim'}]})});
  await page.goto(`http://127.0.0.1:${port}/customer-industry-acceptance.html`);const select=page.getByRole('combobox',{name:new RegExp(labels[0])});await select.waitFor({timeout:5000});assert.equal(await select.innerText(),labels[1]);
  await select.click();await page.getByRole('option',{name:labels[2],exact:true}).click();assert.equal(JSON.parse(await page.getByTestId('payload').innerText()).systemIndustryId,96);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Customer industry passed ko/en/vi: saved FK display, tenant catalogue and numeric FK changes.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
