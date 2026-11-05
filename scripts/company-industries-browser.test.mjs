import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {companyIndustryText} from '../frontend/src/constants/companyIndustries.js';
const fixture=path.resolve('frontend/company-industries-acceptance.html'),port=43441;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Settings from '/src/pages/App/organization/OrganizationDetail';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings))));</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/company-industries-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),t=companyIndustryText[lang],errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:(message)=>{window.notices=(window.notices||[]).concat(message);},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const role={id:2,code:'LOGISTICS',nameKo:'Logistics',nameEn:'Logistics',nameVi:'Logistics'},industry={id:11,code:'FWD',nameKo:'Forwarder',nameEn:'Forwarder',nameVi:'Forwarder',isActive:true,partnerRoleId:2},code={id:21,code:'FRTE',nameKo:'Freight',nameEn:'Freight',nameVi:'Freight',industryIds:[11],canBill:false,eligible:true,available:false};let profile={canEdit:true,classification:{revision:0,roleIds:[],industryIds:[],industries:[]},codes:[code]};
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7,activeProfile:{orgType:"SERVICE"},updateActiveProfile:()=>{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:'+JSON.stringify(lang)+'});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/partner-classifications/options?*',r=>r.fulfill({headers,json:{roles:[role],industries:[industry]}}));
  await page.route('**/company-industries?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(new URL(r.request().url()).searchParams.get('orgId'),'7');writes.push(body);profile={...profile,classification:{...body.classification,revision:body.classification.revision+1,industries:[industry]},codes:[code]};}return r.fulfill({headers,json:profile});});
  await page.route('**/organizations/primary*',r=>r.fulfill({headers,json:{id:7,name:'Company',code:'TEST',country:'VN',businessNumber:'12345'}}));
  await page.route('**/employees*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/entities/7/bank-accounts*',r=>r.fulfill({headers,json:{accounts:[],currencies:[]}}));
  await page.goto(`http://127.0.0.1:${port}/company-industries-acceptance.html?lang=${lang}`);const panel=page.getByTestId('company-industry-settings');
  const copy=PARTNER_CLASSIFICATION_TEXT[lang];await panel.getByRole('textbox',{name:copy.category,exact:true}).fill('Logistics');await page.keyboard.press('Enter');await panel.getByRole('button',{name:t.save,exact:true}).click();await panel.getByText(copy.required,{exact:true}).waitFor();assert.equal(writes.length,0);
  await panel.getByRole('textbox',{name:'Logistics > '+copy.industry,exact:true}).fill('Forwarder');await page.keyboard.press('Enter');
  const address=page.locator('input[name="address"]');await address.waitFor();assert.equal(await page.locator('textarea[name="address"]').count(),0);assert.ok(await address.evaluate(node=>node.getBoundingClientRect().height<40));
  assert.equal(await panel.getByRole('textbox').count(),2,'no accounting-code whitelist');assert.equal(await panel.locator('xpath=ancestor::section[1]').locator('input[name=businessNumber]').count(),1,'industry selector is inside the first legal information card');await panel.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(message=>window.notices?.includes(message),t.saved);assert.equal(await panel.getByText(t.saved,{exact:true}).count(),0);
  assert.deepEqual(writes[0].classification,{revision:0,roleIds:[2],industryIds:[11]});assert.equal('billingCodeIds' in writes[0],false);assert.equal(await panel.getByRole('button',{name:t.save,exact:true}).isDisabled(),true);
  await page.reload();await panel.getByRole('textbox',{name:copy.category,exact:true}).waitFor();assert.equal(await panel.locator('.MuiChip-label').filter({hasText:'Forwarder'}).count(),1);assert.equal(await panel.locator('.MuiChip-label').filter({hasText:'FRTE'}).count(),0);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS top-card industries / no billing restriction / persisted settings '+lang+' '+width);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
