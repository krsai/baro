import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {INDUSTRY_TREE_TEXT} from '../frontend/src/constants/industryHierarchy.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/partner-registration-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Customer from'/src/pages/App/customer/CustomerDetail.jsx';import Partner from'/src/components/BusinessPartnerDialog.jsx';import{useLanguage}from'/src/context/LanguageContext.jsx';
function App(){const{languageCode}=useLanguage();return React.createElement(MemoryRouter,{initialEntries:['/customer/new']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),location.search?React.createElement(Partner,{open:true,activeOrgId:1,languageCode,initialType:location.search.includes('supplier')?'MATERIAL_SUPPLIER':'PROCESS_OUTSOURCING',onClose:()=>document.documentElement.dataset.saved='true'}):React.createElement(Routes,null,React.createElement(Route,{path:'/customer/new',element:React.createElement(Customer)}))));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);
const port=43223,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-registration-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const screen of ['customer','partner','supplier']){
  const page=await browser.newPage({viewport:{width:1400,height:1100}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));let customerReads=0,payload,requestedCatalogue;
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:"ADMIN",entryType:"ORG"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'window.notifications=[];const actions={navigateToPath:()=>{},showNotification:(message,level)=>window.notifications.push({message,level}),setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/customer-industries?*',r=>r.fulfill({headers,json:[{id:31,nameKo:'Retail',nameEn:'Retail',nameVi:'Retail',isActive:true}]}));
  await page.route('**/outsourcing-service-types?*',r=>{requestedCatalogue=new URL(r.request().url());return r.fulfill({headers,json:[{id:412,nameKo:'Buttonhole',nameEn:'Buttonhole',nameVi:'Buttonhole',systemDefaultId:1,systemDefault:{id:1,partnerRole:{code:screen==='supplier'?'MATERIAL_SUPPLIER':'PROCESS_OUTSOURCING'}}}]});});
  await page.route('**/entities/*/bank-accounts?*',r=>r.fulfill({headers,json:{accounts:[],currencies:[]}}));
  for(const endpoint of ['customers','business-partners'])await page.route(`**/${endpoint}?*`,r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='GET'){customerReads++;return r.fulfill({headers,json:[]});}
   payload=r.request().postDataJSON();return r.fulfill({headers,status:201,json:{...payload,id:7,entityId:44,type:'BRAND'}});
  });
  await page.goto(`http://127.0.0.1:${port}/partner-registration-acceptance.html${screen==='customer'?'':'?'+screen}`);
  assert.equal(await page.evaluate(async()=>{const {resolveCustomerDisplayName}=await import('/src/utils/appLanguage.js');return resolveCustomerDisplayName({name:'English company',nameKo:'',nameVi:''},'${lang}');}),'English company');
  const industry=page.getByRole('combobox',{name:INDUSTRY_TREE_TEXT[lang].industry,exact:true});
  if(screen==='customer'){
   await page.locator('input[name=name]').fill('New customer');
   assert.equal(await page.locator('input[name=code]').getAttribute('required'),null);
   if(lang==='vi')await page.locator('input[name=code]').fill('CUS-001');
   assert.equal(customerReads,0,'A static /customer/new route must not fetch an empty customer ID');
   assert.equal(await industry.count(),0,'Customers have no detailed industry selector');
   await page.locator('.app-page-header button.MuiButton-contained').click();
   await page.waitForFunction(()=>window.notifications.some(row=>row.level==='success'));
   assert.equal(payload.systemIndustryId,null);assert.equal(payload.code,lang==='vi'?'CUS-001':'');
  }else{
   await page.locator('input[name=name]').fill('New vendor');
   await page.locator('input[name=contactName]').fill('Contact person');
   if(lang==='vi')await page.locator('input[name=code]').fill('VEN-001');
   await page.setViewportSize({width:390,height:540});
   await page.waitForTimeout(300);
   for(const selector of ['.MuiDialog-paper','.MuiDialogTitle-root','.MuiDialogActions-root']){
    const bounds=await page.locator(selector).boundingBox();assert.ok(bounds.y>=0 && bounds.y+bounds.height<=541,'Modal title and actions must stay inside viewport');
   }
   await page.setViewportSize({width:1280,height:600});
   await industry.click();assert.equal(await page.getByRole('option',{name:'Buttonhole',exact:true}).count(),1);await page.getByRole('option',{name:'Buttonhole',exact:true}).click();await page.keyboard.press('Escape');
   await page.getByRole('dialog').getByRole('button',{name:{ko:'등록',en:'Add',vi:'Thêm'}[lang],exact:true}).click();
   await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
   assert.equal(requestedCatalogue.searchParams.get('forPartner'),'1');assert.equal(requestedCatalogue.searchParams.get('partnerType'),screen==='supplier'?'MATERIAL_SUPPLIER':'PROCESS_OUTSOURCING');
   assert.deepEqual(payload.serviceTypeIds,[412]);assert.equal(payload.type,screen==='supplier'?'MATERIAL_SUPPLIER':'PROCESS_OUTSOURCING');
   assert.equal(payload.name,'New vendor');assert.equal(payload.contactName,'Contact person');assert.equal(payload.code,lang==='vi'?'VEN-001':null);
  }
  assert.deepEqual(await page.evaluate(()=>window.notifications.filter(row=>row.level==='error')),[]);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner registration passed: ko/en/vi, static new customer route, SYSTEM industry IDs, canonical partner catalogue and SaaS partner creation.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
