import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';
const fixture=path.resolve('frontend/partner-classification-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Directory from'/src/pages/App/TradePartners.jsx';import Customer from'/src/pages/App/customer/CustomerBasicInfoPanel.jsx';import{buildCustomerFormData,buildCustomerPayload}from'/src/pages/App/customer/customerFormShared.js';function App(){const[form,setForm]=React.useState(buildCustomerFormData({name:'New customer'}));return location.search.includes('customer')?React.createElement(React.Fragment,null,React.createElement(Customer,{customerFormData:form,savingCustomer:false,languageCode:window.testLanguage,onBasicFieldChange:e=>setForm(current=>({...current,[e.target.name]:e.target.value})),onCountryChange:()=>{},t:k=>k}),React.createElement('pre',{'data-testid':'payload'},JSON.stringify(buildCustomerPayload(form)))):React.createElement(Directory);}createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App))));</script></body></html>`);
const port=43339,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const role=(id,code,names)=>({id,code,nameKo:names[0],nameEn:names[1],nameVi:names[2]});
const roles=[role(1,'CUSTOMER',['고객사','Customer','Khách hàng']),role(2,'MATERIAL_SUPPLIER',['공급 업체','Supplier','Nhà cung cấp']),role(3,'LOGISTICS_PROVIDER',['물류 업체','Logistics provider','Đơn vị logistics']),role(4,'MANAGEMENT',['관리','Management','Quản lý'])];
const industries=[{...role(10,'ZIPPER',['지퍼','Zipper','Khóa kéo']),partnerRoleId:2,partnerRole:roles[1],isActive:true},{...role(11,'BUTTON',['단추','Button','Nút']),partnerRoleId:2,partnerRole:roles[1],isActive:true},{...role(12,'SHIPPING',['운송','Shipping','Vận chuyển']),partnerRoleId:3,partnerRole:roles[2],isActive:true},{...role(13,'WOVEN',['직물','Woven','Dệt thoi']),partnerRoleId:1,partnerRole:roles[0],isActive:true},{...role(14,'RENT',['임대','Rent','Thuê']),partnerRoleId:4,partnerRole:roles[3],isActive:true}];
const empty={revision:0,roleIds:[],industryIds:[],industries:[],legacyGeneral:[{id:99,code:'GENERAL'}]};
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-classification-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[],writePaths=[],text=PARTNER_CLASSIFICATION_TEXT[lang];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(lang=>{window.testLanguage=lang;},lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={activeOrgId:1,activeOrgRole:"ADMIN",accessProfile:{systemRole:"SYSTEM_ADMIN",entryType:"ORG",orgType:"MANUFACTURER",orgRole:"ADMIN"},isAuthenticated:true,devBypass:true,devProfile:{orgType:"MANUFACTURER",orgRole:"ADMIN"}};export const useAuth=()=>a;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:p=>window.lastPath=p,showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  const rows=[{kind:'BUSINESS',hasUsageHistory:false,entity:{id:7,name:'Legacy vendor',nameKo:'기존 업체',nameVi:'Đối tác cũ',type:'MATERIAL_SUPPLIER',isActive:true,createdAt:'2026-10-31',outsourcingServiceAssignments:[]},classification:structuredClone(empty)},{kind:'CUSTOMER',relationshipId:8,hasUsageHistory:true,entity:{id:9,name:'Customer A',type:'BRAND',isActive:true},classification:{revision:1,roleIds:[1],industryIds:[13],industries:[industries[3]],legacyGeneral:[]}}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route(/\/(partner-directory|partner-classifications|business-partners|customers|entities|currencies)(\/|\?|$)/,r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='PUT'||req.method()==='POST'){
    const body=req.postDataJSON();writes.push(body);writePaths.push(url.pathname);assert.ok(!('serviceTypeIds'in body));assert.ok(!('isActive'in body));assert.ok(!('partnerExpenseTypeId'in body));
    if(req.method()==='PUT'){rows[0].classification={...rows[0].classification,...body.classification,revision:body.classification.revision+1,industries:industries.filter(row=>body.classification.industryIds.includes(row.id))};}
    return r.fulfill({headers,json:{id:7,...body,classification:rows[0].classification}});
   }
   return r.fulfill({headers,json:url.pathname==='/partner-directory'?{roles,rows}:url.pathname==='/partner-classifications/options'?{roles,industries}:url.pathname.startsWith('/partner-classifications/')?rows[0].classification:{accounts:[],currencies:[]}});
  });
  await page.goto(`http://127.0.0.1:${port}/partner-classification-acceptance.html`);
  const nav=page.getByRole('navigation'),roleName=row=>row[{ko:'nameKo',vi:'nameVi',en:'nameEn'}[lang]];
  await nav.getByRole('button',{name:new RegExp('^'+roleName(roles[3])+' ')}).click();assert.equal(await page.getByRole('button',{name:lang==='ko'?'기존 업체':lang==='vi'?'Đối tác cũ':'Legacy vendor',exact:true}).count(),0);
  await nav.getByRole('button',{name:new RegExp('^'+roleName(roles[0])+' ')}).click();await page.getByRole('button',{name:'Customer A',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastPath),'/customer/8');
  await page.getByRole('button',{name:lang==='ko'?'단가':lang==='vi'?'Đơn giá':'Pricing',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastPath),'/customer-pricing?customerId=8');
  await nav.getByRole('button',{name:new RegExp('^'+({ko:'전체 거래처',en:'All partners',vi:'Tất cả đối tác'})[lang]+' ')}).click();
  await page.getByRole('button',{name:lang==='ko'?'기존 업체':lang==='vi'?'Đối tác cũ':'Legacy vendor',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText(text.legacy+': GENERAL',{exact:true}).waitFor();
  const save=dialog.getByRole('button',{name:lang==='ko'?'저장':lang==='vi'?'Lưu':'Save',exact:true});assert.equal(await save.isDisabled(),true);
  assert.equal(await dialog.locator('input').evaluateAll(inputs=>inputs.some(input=>input.value==='구매처')),false);
  const localized=row=>row[{ko:'nameKo',vi:'nameVi',en:'nameEn'}[lang]];
  const choose=async(label,option)=>{const input=dialog.getByRole('combobox',{name:label,exact:true});await input.fill(option);await page.getByRole('option',{name:option,exact:true}).click();await page.keyboard.press('Escape');};
  await choose(text.category,localized(roles[1]));assert.equal(await save.isDisabled(),true);
  await choose(localized(roles[1])+' > '+text.industry,localized(industries[0]));await choose(localized(roles[1])+' > '+text.industry,localized(industries[1]));assert.equal(await save.isEnabled(),true);
  await choose(text.category,localized(roles[2]));assert.equal(await save.isDisabled(),true);
  await choose(localized(roles[2])+' > '+text.industry,localized(industries[2]));
  await dialog.getByRole('combobox',{name:localized(roles[1])+' > '+text.industry,exact:true}).click();assert.equal(await page.getByRole('option',{name:/GENERAL|^확인$|^Check$/}).count(),0);await page.keyboard.press('Escape');
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  await save.click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes[0].classification,{revision:0,roleIds:[2,3],industryIds:[10,11,12]});
  await page.setViewportSize({width:1440,height:1000});await nav.getByRole('button',{name:new RegExp('^'+localized(roles[2])+' ')}).click();await page.getByRole('button',{name:lang==='ko'?'기존 업체':lang==='vi'?'Đối tác cũ':'Legacy vendor',exact:true}).waitFor();
  await page.reload();await nav.getByRole('button',{name:new RegExp('^'+localized(roles[1])+' ')}).click();await page.getByRole('button',{name:lang==='ko'?'기존 업체':lang==='vi'?'Đối tác cũ':'Legacy vendor',exact:true}).click();await dialog.getByRole('combobox',{name:localized(roles[2])+' > '+text.industry,exact:true}).waitFor();assert.equal(await save.isEnabled(),true);
  await dialog.getByRole('button',{name:lang==='ko'?'취소':lang==='vi'?'Hủy':'Cancel',exact:true}).click();
  await page.getByRole('button',{name:lang==='ko'?'거래처 등록':lang==='vi'?'Thêm đối tác':'Add partner',exact:true}).click();
  await dialog.locator('input[name="name"]').fill('Dual partner');
  await choose(text.category,localized(roles[0]));await choose(localized(roles[0])+' > '+text.industry,localized(industries[3]));
  // Supplier is preselected from the current directory category.
  await choose(localized(roles[1])+' > '+text.industry,localized(industries[0]));
  await dialog.getByRole('button',{name:lang==='ko'?'등록':lang==='vi'?'Thêm':'Add',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(writePaths.at(-1),'/customers');assert.equal(writes.at(-1).name,'Dual partner');assert.deepEqual(new Set(writes.at(-1).classification.roleIds),new Set([1,2]));assert.ok(!('type'in writes.at(-1)));
  await page.goto(`http://127.0.0.1:${port}/partner-classification-acceptance.html?customer`);
  const customerChoose=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).fill(option);await page.getByRole('option',{name:option,exact:true}).click();await page.keyboard.press('Escape');};
  await page.getByRole('combobox',{name:localized(roles[0])+' > '+text.industry,exact:true}).waitFor();await customerChoose(localized(roles[0])+' > '+text.industry,localized(industries[3]));await customerChoose(text.category,localized(roles[1]));await customerChoose(localized(roles[1])+' > '+text.industry,localized(industries[0]));
  const payload=JSON.parse(await page.getByTestId('payload').innerText());assert.deepEqual(payload.classification,{revision:0,roleIds:[1,2],industryIds:[13,10]});assert.ok(!('systemIndustryId'in payload));assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner classifications ko/en/vi: unified all/categories including management, required multi-category/industry edit and customer registration, GENERAL reference only, save/reload, unchanged legacy contract and mobile passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
