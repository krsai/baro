import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/company-connections-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Organization from'/src/pages/App/organization/OrganizationBoard.jsx';import Connections,{CompanyConnectionField,COMPANY_CONNECTION_TEXT}from'/src/components/CompanyConnections.jsx';
const p=new URLSearchParams(location.search),lang=p.get('lang'),screen=p.get('screen');window.copy=COMPANY_CONNECTION_TEXT[lang];function Field(){const[value,setValue]=React.useState();return React.createElement(CompanyConnectionField,{orgId:1,name:'DEX LOGIS',country:'VN',businessNumber:'',value,onChange:v=>{window.selectedConnection=v;setValue(v);},languageCode:lang});}const Page=screen==='organization'?React.createElement(Organization):screen==='field'?React.createElement(Field):React.createElement(Connections,{orgId:2,languageCode:lang});createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),Page)));
</script></body></html>`);
const port=43423,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/company-connections-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  console.log('Checking company connections',lang,width);const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:2,activeProfile:{orgType:'SERVICE',orgRole:'ADMIN'},updateActiveProfile:()=>{}});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},roles=['CUSTOMER','SUPPLIER','LOGISTICS_PROVIDER','CUSTOM_ROLE'].map((code,index)=>({id:index+1,code,nameEn:'System '+code,nameKo:'시스템 '+code,nameVi:'Hệ thống '+code}));
  await page.route('**/partner-classifications/options*',r=>r.fulfill({headers,json:{roles,industries:[]}}));
  await page.route('**/organizations/primary*',r=>r.fulfill({headers,json:{id:2,name:'DEX LOGIS',code:'DEXLOG',type:'SERVICE',industry:'LOGISTICS',country:'VN'}}));
  await page.route('**/organizations/2',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});const body=r.request().postDataJSON();writes.push(body);return r.fulfill({headers,json:{id:2,...body}});});
  await page.route('**/employees*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/entities/*/bank-accounts*',r=>r.fulfill({headers,json:{accounts:[],currencies:[{id:1,code:'VND'}]}}));
  await page.route(/\/company-connections(?:\/candidates)?(?:\?|$)/,r=>r.fulfill({headers,json:r.request().url().includes('/candidates')?[{id:2,name:'DEX LOGIS',code:'DEXLOG',revision:'reviewed-target'}]:[{company:{id:1,name:'BARO GARMENT',code:'BARO'},entityId:null,direction:'INCOMING'}]}));
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=organization`);
  await page.waitForFunction(()=>!document.querySelector('input[name="industry"]')?.closest('.MuiFormControl-root')?.querySelector('.Mui-disabled'));
  const industry=page.locator('input[name="industry"]').locator('..').getByRole('combobox');await industry.click({timeout:10000}).catch(async e=>{console.log(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(0,2400)}));throw e;});
  for(const role of roles)await page.getByRole('option',{name:role[lang==='ko'?'nameKo':lang==='vi'?'nameVi':'nameEn'],exact:true}).waitFor();
  await page.getByRole('option',{name:roles[3][lang==='ko'?'nameKo':lang==='vi'?'nameVi':'nameEn'],exact:true}).click();
  await page.getByRole('button',{name:/^(저장|Save|Lưu)$/}).click();await page.waitForFunction(()=>document.querySelector('input[name="industry"]')?.value==='CUSTOM_ROLE');
  assert.equal(writes[0].industry,'CUSTOM_ROLE');assert.equal('type' in writes[0],false);assert.equal('subscription' in writes[0],false);
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=field`);const text=await page.evaluate(()=>window.copy);
  await page.getByRole('button',{name:text.find,exact:true}).click();await page.getByRole('combobox').click();await page.getByRole('option',{name:'DEX LOGIS (DEXLOG)',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.selectedConnection),{targetOrgId:2,revision:'reviewed-target'});
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=incoming`);await page.getByText(`BARO GARMENT (BARO) · ${text.incoming}`,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('ko/en/vi desktop/mobile: SERVICE loads all SYSTEM roles, selected category does not change tenant type, explicit company selection and incoming relationship display.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
