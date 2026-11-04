import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';
const fixture=path.resolve('frontend/partner-connection-registration-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Partner from'/src/components/BusinessPartnerDialog.jsx';
const lang=new URLSearchParams(location.search).get('lang');createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Partner,{open:true,activeOrgId:1845,languageCode:lang,initialType:'LOGISTICS_PROVIDER',allowCustomerCreation:true,onClose:()=>document.documentElement.dataset.saved='true'}))));
</script></body></html>`);
const port=43424,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-connection-registration-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  console.log('Partner company lookup and registration',lang,width);const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],lookups=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1845,activeOrgRole:'ADMIN',activeProfile:{orgType:'SERVICE',orgRole:'ADMIN'}});"}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const role={id:3,code:'LOGISTICS_PROVIDER',nameKo:'Logistics',nameEn:'Logistics',nameVi:'Logistics'},industry={id:10,code:'SHIPPING',nameKo:'Shipping',nameEn:'Shipping',nameVi:'Shipping',partnerRoleId:3,isActive:true,partnerRole:role};
  await page.route('**/partner-classifications/options*',r=>r.fulfill({headers,json:{roles:[role],industries:[industry]}}));
  await page.route('**/company-connections/candidates*',r=>{lookups.push(new URL(r.request().url()));return r.fulfill({headers,json:[{id:1,sourceEntityId:1,name:'BARO GARMENT',nameKo:'BARO KO',nameVi:'BARO VI',country:'VN',businessNumber:'0109423500',code:'BARO',address:'Public BARO address',revision:'reviewed-baro'}]});});
  await page.route('**/business-partners?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});writes.push(r.request().postDataJSON());return r.fulfill({headers,status:201,json:{id:31}});});
  await page.goto(`http://127.0.0.1:${port}/partner-connection-registration-acceptance.html?lang=${lang}`);
  const outer=page.getByRole('dialog').first(),country=page.locator('input[name="country"]');assert.equal(await country.inputValue(),'VN');
  const category=outer.getByRole('combobox',{name:PARTNER_CLASSIFICATION_TEXT[lang].category,exact:true});
  assert.equal(await outer.locator('.MuiChip-root').count(),0);
  const fields=['partyKind','businessNumber','code','name','nameKo','nameVi'];
  const positions=await page.evaluate(names=>names.map(name=>{const box=document.querySelector('input[name="'+name+'"]').closest('.MuiFormControl-root').getBoundingClientRect();return {x:box.x,y:box.y};}),fields);
  if(width===1440){assert.ok(positions.slice(0,3).every(p=>Math.abs(p.y-positions[0].y)<1));assert.ok(positions.slice(3).every(p=>Math.abs(p.y-positions[3].y)<1));assert.ok(positions[3].y>positions[0].y);for(let i=0;i<3;i++)assert.ok(Math.abs(positions[i].x-positions[i+3].x)<1);}
  else for(let i=1;i<positions.length;i++)assert.ok(positions[i].y>positions[i-1].y);
  assert.equal(await page.locator('textarea[name="address"]').count(),0);assert.equal(await page.locator('input[name="address"]').count(),1);
  await country.locator('..').getByRole('combobox').click();await page.getByRole('option',{name:'—',exact:true}).click();
  await page.locator('input[name="businessNumber"]').fill('0109423500');await page.waitForTimeout(800);assert.equal(lookups.length,0);
  const find=outer.getByRole('button',{name:{ko:'기존 업체 확인',en:'Check existing company',vi:'Kiểm tra công ty đã có'}[lang],exact:true});await find.click();
  await outer.getByText({ko:'업체를 조회하려면 국가를 선택해 주세요.',en:'Select a country to look up the company.',vi:'Vui lòng chọn quốc gia để tìm công ty.'}[lang],{exact:true}).waitFor();assert.equal(lookups.length,0);
  await country.locator('..').getByRole('combobox').click();const vn=await page.evaluate(async lang=>{const{getStaticOptionOptions}=await import('/src/constants/staticOptionRegistry.js');return getStaticOptionOptions('country',lang).find(row=>row.value==='VN').label;},lang);await page.getByRole('option',{name:vn,exact:true}).click();
  const review=page.getByRole('dialog').last();await review.getByText('Public BARO address',{exact:true}).waitFor();await review.getByRole('button',{name:{ko:'같은 업체',en:'Same company',vi:'Cùng công ty'}[lang],exact:true}).click();
  await page.waitForTimeout(800);assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('input[name="name"]').inputValue(),'BARO GARMENT');
  assert.equal(await page.locator('input[name="address"]').first().inputValue(),'Public BARO address');assert.equal(await page.locator('.MuiFormHelperText-root').count(),0);
  await category.fill('Logistics');await page.getByRole('option',{name:'Logistics',exact:true}).click();await page.keyboard.press('Escape');
  await outer.getByRole('combobox',{name:/Logistics > /}).fill('Shipping');await page.getByRole('option',{name:'Shipping',exact:true}).click();await page.keyboard.press('Escape');
  await outer.getByRole('button',{name:{ko:'등록',en:'Add',vi:'Thêm'}[lang],exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
  assert.equal(writes.length,1);assert.equal(writes[0].name,'BARO GARMENT');assert.equal(writes[0].country,'VN');assert.equal(writes[0].address,'Public BARO address');assert.deepEqual(writes[0].companyConnection,{sourceEntityId:1,revision:'reviewed-baro'});assert.ok(lookups.every(url=>url.searchParams.get('country')==='VN'));assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
