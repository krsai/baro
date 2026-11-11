import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {systemEntityText} from '../frontend/src/constants/systemEntities.js';
import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';
const fixture=path.resolve('frontend/system-entities-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from "react";import{createRoot}from"react-dom/client";import{MemoryRouter}from"react-router-dom";import{ThemeProvider,CssBaseline}from"@mui/material";import theme from"/src/theme";import Directory from"/src/pages/App/system/SystemEntities";createRoot(document.getElementById("root")).render(React.createElement(React.StrictMode,null,React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Directory)))));</script></body></html>');
const port=43323,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/system-entities-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],writes=[],deletes=[],t=systemEntityText[lang],classification=PARTNER_CLASSIFICATION_TEXT[lang];let fail=true,removed=false;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={showNotification:(text,severity)=>{(window.notices??=[]).push({text,severity});},setUnsavedChangesGuard:(key,dirty)=>{(window.guards??={})[key]=dirty.isDirty;},clearUnsavedChangesGuard:key=>{(window.guards??={})[key]=false;}};export const useAppActions=()=>actions;'}));
  const role1={id:1,code:'APPAREL',nameEn:'Apparel',nameKo:'Apparel',nameVi:'Apparel'},role2={id:2,code:'LOGISTICS_PROVIDER',nameEn:'Logistics',nameKo:'Logistics',nameVi:'Logistics'};
  const industry={id:7,code:'GARMENT',nameEn:'Manufacturer',nameKo:'Manufacturer',nameVi:'Manufacturer',isActive:true,partnerRoleId:1,partnerRole:role1},forwarder={id:8,code:'FWD',nameEn:'Forwarder',nameKo:'Forwarder',nameVi:'Forwarder',isActive:true,partnerRoleId:2,partnerRole:role2};
  let entity={id:1,name:'BARO',nameKo:'BARO',code:'BARO',businessNumber:'0001',partyKind:'CORPORATE',country:'VN',address:'Old address',isActive:true};
  let scope={orgId:1,entityId:1,owner:{id:1,name:'BARO'},classification:{revision:1,explicit:true,roleIds:[1],industryIds:[7],industries:[industry]}};
  const unused={id:13,name:'Unused vendor',code:'UNUS',isActive:true,classifications:[],usage:[],canDelete:true,subscriber:false,owner:{name:'BARO'}};
  const detail=()=>({requested:entity,entity,classifications:[scope],usage:[{kind:'finance',count:1}],canDelete:false,identityLocked:true,revision:'r'+scope.classification.revision});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/partner-classifications/**',()=>{throw Error('SYSTEM must not borrow company membership to load its catalogue');});
  await page.route('**/system/entities**',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});const url=new URL(r.request().url()),method=r.request().method();
   if(url.pathname.endsWith('/catalogue'))return r.fulfill({headers,json:{roles:[role1,role2],industries:[industry,forwarder]}});
   if(method==='PUT'){const body=r.request().postDataJSON();writes.push(body);assert.deepEqual(body.profile,{name:'BARO updated'});assert.deepEqual(body.classifications,[{orgId:1,entityId:1,revision:1,industryIds:[7,8]}]);if(fail){fail=false;return r.fulfill({headers,status:500,json:{error:'TEMPORARY_FAILURE'}});}entity={...entity,name:body.profile.name};scope={...scope,classification:{...scope.classification,revision:2,roleIds:[1,2],industryIds:[7,8],industries:[industry,forwarder]}};return r.fulfill({headers,json:detail()});}
   if(method==='DELETE'){deletes.push(r.request().postDataJSON());assert.ok(url.pathname.endsWith('/13'));removed=true;return r.fulfill({headers,json:{deleted:true}});}
   if(url.pathname.endsWith('/1'))return r.fulfill({headers,json:detail()});
   if(url.pathname.endsWith('/13'))return r.fulfill({headers,json:{requested:unused,entity:unused,classifications:[],usage:[],canDelete:true,revision:'unused'}});
   const rows=[{...entity,subscriber:true,classifications:[scope.classification],usage:[{kind:'finance',count:1}],canDelete:false},...(removed?[]:[unused])];return r.fulfill({headers,json:{rows,total:rows.length,page:0}});
  });
  await page.goto(`http://127.0.0.1:${port}/system-entities-acceptance.html?lang=${lang}`);
  const used=page.getByTestId('system-entities-table').locator('tbody tr').first();await used.getByRole('button',{name:t.edit,exact:true}).waitFor();assert.equal(await used.getByRole('button',{name:t.remove+' BARO',exact:true}).isDisabled(),true);
  await used.getByRole('button',{name:t.edit,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('input[name="name"]').waitFor();const save=dialog.getByRole('button',{name:t.save,exact:true});assert.equal(await save.isDisabled(),true);
  assert.equal(await dialog.locator('input[name="code"]').evaluate(node=>node.readOnly),true);assert.equal(await dialog.locator('textarea[name="address"]').count(),0);
  await dialog.locator('input[name="name"]').fill('BARO updated');const industryInput=dialog.getByRole('textbox',{name:classification.industry,exact:true});await industryInput.fill('Forwarder');await industryInput.press('Enter');
  assert.equal(await dialog.getByRole('textbox',{name:classification.category,exact:true}).isDisabled(),true);assert.ok(await dialog.locator('.MuiInputBase-root .MuiChip-root').count()>=4);assert.equal(await save.isEnabled(),true);
  await save.click();await page.waitForFunction(()=>window.notices?.length===1);assert.equal(await dialog.locator('input[name="name"]').inputValue(),'BARO updated');assert.equal(await save.isEnabled(),true);
  await save.click();await page.waitForFunction(()=>window.notices?.length===2);assert.deepEqual(writes[0],writes[1]);assert.equal(await save.isDisabled(),true);assert.ok(await page.evaluate(()=>Object.values(window.guards).every(value=>!value)));
  await page.keyboard.press('Escape');await page.getByTestId('system-entities-table').getByRole('button',{name:t.remove+' Unused vendor',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:t.remove,exact:true}).click();await page.waitForFunction(()=>window.notices?.length===3);assert.equal(deletes.length,1);
  await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: SYSTEM ko/en/vi used-company edits, automatic categories, single-save drafts/retry, protected deletion, unused deletion and responsive layout.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
