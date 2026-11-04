import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/company-connections-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import CustomerPanel from'/src/pages/App/customer/CustomerBasicInfoPanel.jsx';import{buildCustomerFormData,buildCustomerPayload}from'/src/pages/App/customer/customerFormShared.js';import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Profile from'/src/components/PartnerProfileFields.jsx';import Organization from'/src/pages/App/organization/OrganizationBoard.jsx';import Connections,{CompanyConnectionField,COMPANY_CONNECTION_TEXT}from'/src/components/CompanyConnections.jsx';
const p=new URLSearchParams(location.search),lang=p.get('lang'),screen=p.get('screen');window.copy=COMPANY_CONNECTION_TEXT[lang];function Field(){const[value,setValue]=React.useState();return React.createElement(CompanyConnectionField,{orgId:1,name:'DEX LOGIS',country:'VN',businessNumber:'010-799-5238',value,onChange:v=>{window.selectedConnection=v;setValue(v);},languageCode:lang});}function Customer(){const[data,setData]=React.useState(()=>buildCustomerFormData({name:'',country:'VN',businessNumber:'0107995238'}));window.customerPayload=buildCustomerPayload(data);return React.createElement(CustomerPanel,{customerFormData:data,languageCode:lang,onBasicFieldChange:({target:{name,value}})=>setData(prev=>({...prev,[name]:value,...(name==='linkedCompany'&&value?Object.fromEntries(['name','nameKo','nameVi','address'].map(key=>[key,value[key]||''])):{})})),onCountryChange:()=>{}});}const Page=screen==='customer'?React.createElement(Customer):screen==='profile'?React.createElement(Profile,{value:{name:'DEX LOGIS',code:'DEX',linkedCompany:{id:2,name:'DEX LOGIS',code:'DEXL'}},onChange:()=>{},languageCode:lang}):screen==='organization'?React.createElement(Organization):screen==='field'?React.createElement(Field):React.createElement(Connections,{orgId:2,languageCode:lang});createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),Page)));
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
  await page.route(/\/company-connections(?:\/candidates)?(?:\?|$)/,r=>r.fulfill({headers,json:r.request().url().includes('/candidates')?[{id:2,sourceEntityId:2,name:'DEX LOGIS',code:'DEXLOG',country:'VN',businessNumber:'0107995238',address:'Hanoi public address',industry:'LOGISTICS_PROVIDER',industryLabels:{nameKo:'Logistics KO',nameEn:'Logistics',nameVi:'Logistics VI'},representative:'Public Representative',phone:'+84 123456789',email:'public@example.com',revision:'reviewed-target'}]:[{company:{id:1,name:'BARO GARMENT',code:'BARO'},entityId:null,direction:'INCOMING'}]}));
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=organization`);
  await page.waitForFunction(()=>!document.querySelector('input[name="industry"]')?.closest('.MuiFormControl-root')?.querySelector('.Mui-disabled'));
  const industry=page.locator('input[name="industry"]').locator('..').getByRole('combobox');await industry.click({timeout:10000}).catch(async e=>{console.log(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(0,2400)}));throw e;});
  for(const role of roles)await page.getByRole('option',{name:role[lang==='ko'?'nameKo':lang==='vi'?'nameVi':'nameEn'],exact:true}).waitFor();
  await page.getByRole('option',{name:roles[3][lang==='ko'?'nameKo':lang==='vi'?'nameVi':'nameEn'],exact:true}).click();
  await page.getByRole('button',{name:/^(저장|Save|Lưu)$/}).click();await page.waitForFunction(()=>document.querySelector('input[name="industry"]')?.value==='CUSTOM_ROLE');
  assert.equal(writes[0].industry,'CUSTOM_ROLE');assert.equal('type' in writes[0],false);assert.equal('subscription' in writes[0],false);
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=field`);const text=await page.evaluate(()=>window.copy);
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByText('Hanoi public address',{exact:true}).waitFor();await dialog.getByText('0107995238',{exact:true}).waitFor();
  await dialog.getByText('Public Representative',{exact:true}).waitFor();await dialog.getByText('+84 123456789 · public@example.com',{exact:true}).waitFor();
  assert.equal(await dialog.locator('dt').count(),7);
  const firstBox=await dialog.getByRole('button').nth(0).boundingBox(),secondBox=await dialog.getByRole('button').nth(1).boundingBox();
  assert.ok(Math.abs(firstBox.y-secondBox.y)<1);assert.ok(Math.abs(firstBox.width-secondBox.width)<1);
  const columns=await dialog.locator('dd').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().x));assert.ok(columns.every(x=>Math.abs(x-columns[0])<1));
  const titleBox=await dialog.locator('#company-review-title').boundingBox(),cardBox=await dialog.locator('.MuiPaper-outlined').boundingBox();assert.ok(cardBox.y-titleBox.y-titleBox.height>=16);
  const same=dialog.getByRole('button').nth(0);await same.click();
  assert.deepEqual(await page.evaluate(()=>window.selectedConnection),{sourceEntityId:2,revision:'reviewed-target'});
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=customer`);
  await dialog.waitFor();await dialog.getByRole('button').first().click();
  await page.waitForFunction(()=>window.customerPayload?.name==='DEX LOGIS');
  await page.waitForTimeout(800);assert.equal(await dialog.count(),0);
  assert.deepEqual((await page.evaluate(()=>window.customerPayload.companyConnection)),{sourceEntityId:2,revision:'reviewed-target'});
  assert.equal(await page.locator('input[name="name"]').inputValue(),'DEX LOGIS');assert.equal(await page.locator('textarea[name="address"]').first().inputValue(),'Hanoi public address');
  assert.equal(await page.locator('input[name="defaultSizeSetCode"]').count(),0);assert.equal(await page.locator('.MuiFormHelperText-root').count(),0);
  const status=page.locator('.MuiChip-root').filter({hasText:'DEX LOGIS'}).first(),name=page.locator('input[name="name"]');assert.ok((await status.boundingBox()).y<(await name.boundingBox()).y);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=field`);await dialog.waitFor();
  await page.reload();await dialog.waitFor();await dialog.getByRole('button').nth(1).click();
  assert.deepEqual(await page.evaluate(()=>window.selectedConnection),{separate:true,businessNumber:'0107995238',country:'VN'});
  await page.waitForTimeout(800);assert.equal(await dialog.count(),0);
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=incoming`);await page.getByText(`BARO GARMENT (BARO) · ${text.incoming}`,{exact:true}).waitFor();
  await page.goto(`http://127.0.0.1:${port}/company-connections-acceptance.html?lang=${lang}&screen=profile`);const official=page.locator('input[value=DEXL]');await official.waitFor();assert.equal(await official.getAttribute('readonly'),'');assert.equal(await page.locator('input[name=code]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('ko/en/vi desktop/mobile: SERVICE loads all SYSTEM roles, selected category does not change tenant type, explicit company selection and incoming relationship display.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
