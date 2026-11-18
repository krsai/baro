import {partnerHandledItemsPanelText} from '../frontend/src/constants/partnerHandledItems.js';
import {partnerContactText} from '../frontend/src/constants/companyDocumentContact.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';
import {PARTNER_DIRECTORY_TEXT} from '../frontend/src/constants/partnerDirectory.js';
import {partnerClassificationPanelText} from '../frontend/src/constants/partnerClassificationPanel.js';
import {partnerEditorText} from '../frontend/src/constants/partnerEditor.js';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
const handledOnly=process.argv.includes('--handled-only');
const fixture=path.resolve('frontend/partner-editor-acceptance.html'),port=43473;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Directory from'/src/pages/App/TradePartners';import Partner from'/src/components/BusinessPartnerDialog';import Legacy from'/src/pages/App/customer/CustomerDetail';import Payee from'/src/components/ExpensePayeePicker';const screen=new URLSearchParams(location.search).get('screen');function Navigation(){window.testNavigate=useNavigate();return null;}function App(){const[value,setValue]=React.useState({id:9,name:'Partial company',code:'VEND',type:'BRAND',isActive:true});return React.createElement(MemoryRouter,{initialEntries:[screen==='legacy'?'/customer/44':screen==='new'?'/customer/new':'/test']},React.createElement(ThemeProvider,{theme},React.createElement(Navigation),React.createElement(CssBaseline),screen==='registration'?React.createElement(Partner,{open:true,activeOrgId:7,languageCode:new URLSearchParams(location.search).get('lang'),onClose:()=>{}}):(['directory','service','local'].includes(screen))?React.createElement(Directory):screen==='expense'?React.createElement(Payee,{orgId:7,languageCode:new URLSearchParams(location.search).get('lang'),options:[value],value,onChange:setValue,onSaved:saved=>{window.savedPartner=saved;setValue(saved);}}):React.createElement(Routes,null,React.createElement(Route,{path:'/customer/:customerId',element:React.createElement(Legacy)}))));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-editor-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const screen of (process.argv.includes('--registration-only')?['registration']:handledOnly?['directory','local']:process.argv.includes('--contacts-only')?['local']:process.argv.includes('--pricing-only')?['directory','service']:['directory','service','local','expense','legacy'])){
  console.log('Checking canonical partner editor',lang,width,screen);const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[],bankEntities=[],panel=partnerClassificationPanelText[lang],banks=ENTITY_TEXT[lang],payee=expenseHeaderActions[lang];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const auth={isAuthenticated:true,activeOrgId:7,activeOrgRole:"ADMIN",activeProfile:{orgRole:"ADMIN",orgType:"'+(screen==='service'?'SERVICE':'MANUFACTURER')+'"},accessProfile:{orgType:"'+(screen==='service'?'SERVICE':'MANUFACTURER')+'",orgRole:"ADMIN"}};export const useAuth=()=>auth;'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:'+JSON.stringify(lang)+'});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:path=>window.testNavigate(path),showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},role={id:1,nameEn:'Services',nameKo:'Services',nameVi:'Services'},industry={id:11,partnerRoleId:1,partnerRole:role,nameEn:'Office',nameKo:'Office',nameVi:'Office',isActive:true};
  let profile={id:9,entityId:9,name:'Full company',nameKo:'Full company',nameVi:'Full company',type:'PROCESS_OUTSOURCING',partyKind:'CORPORATE',code:'VEND',businessNumber:'VN-123',country:'VN',countryCode:'+84',contactName:'Full contact',contactPhone:'01234',email:'full@example.test',address:'Full address',sourceKind:screen==='local'?'BUSINESS':'CUSTOMER',relationshipId:screen==='local'?null:44,canEditProfile:true,classification:{revision:2,roleIds:[1],industryIds:[11],industries:[industry]},defaultSizeSetCode:'ALPHA'};
  if(screen==='local'){delete profile.defaultSizeSetCode;profile.canEditProfile=!handledOnly&&!process.argv.includes('--private-only');profile.contactMode='DEFAULT';profile.contactDefaultSource={kind:process.argv.includes('--private-only')?'SELF':'REGISTRATION'};profile.contactRevision=0;profile.contactDefaults=Object.fromEntries(['name','nameKo','nameVi','contactName','contactPhone','email','address'].map(key=>[key,profile[key]]));profile.contactLocal={...profile.contactDefaults};profile.linkedCompany={...profile,subscriberOrgId:90,representative:profile.contactName,phone:profile.contactPhone,officialClassification:handledOnly?profile.classification:null};profile.classification={revision:2,roleIds:[],industryIds:[],industries:[]};}
  await page.route('**/partner-directory?*',r=>r.fulfill({headers,json:{roles:[role],rows:[{kind:profile.sourceKind,relationshipId:44,relationshipRoles:['CUSTOMER'],entity:{id:9,type:'BRAND',name:'Partial company',code:'VEND'},classification:profile.classification,missingSalesPriceStyleCount:1,hasUsageHistory:true}]}}));
  await page.route('**/partner-editor/**',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='PUT'){const body=r.request().postDataJSON();writes.push({path:new URL(r.request().url()).pathname,body});const overrides={...(body.contacts.baseMode==='DEFAULT'?{}:profile.contactOverrides||{})};for(const [key,value]of Object.entries(body.contacts.patch)){if(value===null)delete overrides[key];else overrides[key]=value;}const base=body.contacts.baseMode==='DEFAULT'?profile.contactDefaults:profile.contactBase||profile.contactDefaults;const local={...base,...overrides};const mode=body.contacts.mode||'LOCAL';profile={...profile,...(mode==='DEFAULT'?profile.contactDefaults:local),contactLocal:local,contactMode:mode,contactBase:base,classification:{...profile.classification,...body.classification,...(body.classification?{industries:body.classification.industryIds.includes(11)?[industry]:[]}:{} )},contactOverrides:overrides,contactRevision:profile.contactRevision+1};}return r.fulfill({headers,json:profile});});
  await page.route('**/partner-handled-items/options?*',r=>r.fulfill({headers,json:{industries:handledOnly?[industry]:[],bases:handledOnly?[{id:101,code:'ZIP',nameEn:'Zipper',nameKo:'Zipper',nameVi:'Zipper',industryLinks:[{systemIndustryId:11}]},{id:102,code:'FOREIGN',nameEn:'Foreign',industryLinks:[{systemIndustryId:12}]}]:[]}}));
  await page.route('**/partner-classifications/options?*',r=>r.fulfill({headers,json:{roles:[role],industries:[industry]}}));
  await page.route('**/entities/*/bank-accounts*',r=>{const id=Number(new URL(r.request().url()).pathname.split('/')[2]);bankEntities.push(id);if(r.request().method()==='OPTIONS')return r.fulfill({headers});return r.fulfill({headers,json:{accounts:[],currencies:[{id:1,code:'VND'}]}});});
  for(const prefix of ['business-partners','customers'])await page.route('**/'+prefix+'/*?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});assert.equal(r.request().method(),'PUT');writes.push({path:new URL(r.request().url()).pathname,body:r.request().postDataJSON()});return r.fulfill({headers,json:{id:prefix==='customers'?44:9,...r.request().postDataJSON()}});});
  await page.goto(`http://127.0.0.1:${port}/partner-editor-acceptance.html?lang=${lang}&screen=${screen}`);
  if(screen==='registration'){
   const initial=page.locator('button[data-initial-focus]');
   await initial.and(page.locator(':focus')).waitFor();
   await initial.click();await page.getByRole('complementary').getByRole('textbox').and(page.locator(':focus')).waitFor();
   assert.equal(writes.length,0);assert.deepEqual(errors,[]);await page.close();continue;
  }
  if(['directory','service'].includes(screen)){await page.getByText('Partial company',{exact:true}).waitFor();const price={ko:'\uB2E8\uAC00',en:'Pricing',vi:'\u0110\u01a1n gi\u00e1'}[lang];assert.equal(await page.getByRole('button',{name:price,exact:true}).count(),screen==='service'?0:1);if(screen==='service')assert.equal(await page.getByText(price,{exact:true}).count(),0,'No logistics pricing attention badge');}
  if(['directory','service','local'].includes(screen))await page.getByRole('button',{name:PARTNER_DIRECTORY_TEXT[lang].detail,exact:true}).click();
  if(screen==='expense'){await page.getByRole('button',{name:payee.choosePayee,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:payee.information,exact:true}).click();}
  const dialog=page.getByRole('dialog').last();await page.waitForFunction(()=>document.querySelector('input[name=name]')?.value==='Full company');assert.equal(await dialog.locator('input[name=businessNumber]').inputValue(),'VN-123');assert.equal(await dialog.locator('input[name=countryCode]').count(),0);assert.ok((await dialog.locator('.MuiInputAdornment-root').allTextContents()).includes('+84'));assert.equal(await dialog.locator('input[name=contactName]').inputValue(),'Full contact');
  const contact=partnerContactText[lang];for(const [name,label]of Object.entries({contactName:contact.contactName,contactPhone:contact.phone,email:contact.email,address:contact.address}))assert.equal(await dialog.getByRole('textbox',{name:label,exact:true}).getAttribute('name'),name);
  if(profile.canEditProfile){await dialog.getByRole('button',{name:panel.select,exact:true}).click();await page.getByRole('complementary').getByRole('checkbox',{name:'Office',exact:true}).waitFor();if(screen==='local')await page.getByRole('complementary').getByRole('checkbox',{name:'Office',exact:true}).check();await page.getByRole('button',{name:panel.close,exact:true}).click();await page.getByRole('complementary').waitFor({state:'hidden'});}
  if(handledOnly){
   const items=partnerHandledItemsPanelText[lang],choose=dialog.getByRole('button',{name:new RegExp(items.choose)}).first();
   const summary=dialog.locator('[data-selection-summary]').filter({has:page.getByRole('button',{name:new RegExp(items.choose)})});
   assert.equal(await summary.locator('input').count(),0);
   await dialog.getByRole('button',{name:banks.save,exact:true}).click();assert.equal(writes.length,0);
   await choose.focus();assert.equal(await page.getByRole('complementary',{name:items.choose,exact:true}).count(),0,'focus alone does not open the selector');
   await choose.click();const lookup=page.getByRole('complementary',{name:items.choose,exact:true});await lookup.waitFor();
   await lookup.getByRole('textbox',{name:items.search,exact:true}).and(page.locator(':focus')).waitFor();
   if(profile.canEditProfile){await dialog.getByRole('button',{name:panel.select,exact:true}).click();await lookup.waitFor({state:'hidden'});await page.getByRole('complementary').getByRole('checkbox',{name:'Office',exact:true}).waitFor();await choose.click();await lookup.waitFor();assert.equal(await page.getByRole('complementary').count(),1);}
   assert.equal(await lookup.getByText('FOREIGN',{exact:true}).count(),0);
   await lookup.getByRole('textbox',{name:items.search,exact:true}).fill('UNKNOWN');assert.equal(await lookup.getByRole('checkbox').count(),0);
   await page.keyboard.press('Escape');await lookup.waitFor({state:'hidden'});await choose.and(page.locator(':focus')).waitFor();
   await choose.click();await lookup.getByRole('textbox',{name:items.search,exact:true}).fill('ZI');await lookup.getByRole('checkbox').check();
   await lookup.getByRole('button',{name:items.close,exact:true}).click();await lookup.waitFor({state:'hidden'});
   await summary.getByText('Zipper',{exact:true}).waitFor();await summary.locator('.MuiChip-deleteIcon').click();
   await dialog.getByRole('button',{name:banks.save,exact:true}).click();assert.equal(writes.length,0);
   await choose.click();await lookup.getByRole('checkbox').check();await lookup.getByRole('button',{name:items.close,exact:true}).click();
  }
  if(screen==='local')await dialog.locator('input[name=nameKo]').fill('Local Korean name');
  await dialog.locator('input[name=contactName]').fill('Updated contact');await dialog.getByRole('button',{name:banks.save,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('input[name=name]'));
  assert.equal(writes.length,1);assert.equal(writes[0].path,screen==='local'?'/partner-editor/entity/9/contacts':'/customers/44');if(screen==='local'){assert.equal(writes[0].body.contacts.patch.contactName,'Updated contact');assert.equal(writes[0].body.contacts.patch.nameKo,'LOCAL KOREAN NAME');assert.equal(profile.linkedCompany.nameKo,'Full company');assert.equal('defaultSizeSetCode' in writes[0].body,false);assert.equal(profile.linkedCompany.representative,'Full contact');}else{assert.equal(writes[0].body.partyKind,'CORPORATE');assert.equal(writes[0].body.contactName,'Updated contact');}if(profile.canEditProfile)assert.deepEqual(writes[0].body.classification,{revision:2,roleIds:[1],industryIds:[11],...(handledOnly&&screen!=='local'?{handledItems:writes[0].body.classification.handledItems}:{})});else assert.equal(writes[0].body.classification,undefined);if(screen!=='local'){assert.equal(writes[0].body.manager,'Updated contact');assert.equal('defaultSizeSetCode' in writes[0].body,false);}
  if(handledOnly){const selected=screen==='local'?writes[0].body.handledItems:writes[0].body.classification.handledItems;assert.deepEqual(selected.industries.map(({industryId,baseIds})=>({industryId,baseIds})),[{industryId:11,baseIds:[101]}]);}
  assert.ok(bankEntities.includes(9));assert.equal(bankEntities.includes(44),false);if(screen==='expense'){assert.equal(await page.evaluate(()=>window.savedPartner.id),9);assert.equal(await page.evaluate(()=>window.savedPartner.relationshipId),44);}
  if(process.argv.includes('--contacts-only')){
   await page.getByRole('button',{name:PARTNER_DIRECTORY_TEXT[lang].detail,exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('input[name=contactName]')?.value==='Updated contact');
   const contactDialog=page.getByRole('dialog').last();
   assert.equal(await contactDialog.locator('input[name=name]').getAttribute('readonly'),null);assert.equal(await contactDialog.locator('input[name=nameKo]').inputValue(),'LOCAL KOREAN NAME');
   await contactDialog.getByRole('button',{name:profile.contactDefaultSource.kind==='SELF'?contact.defaults:contact.registration,exact:true}).click();
   assert.equal(await contactDialog.locator('input[name=contactName]').inputValue(),'Full contact');assert.equal(await contactDialog.locator('input[name=nameKo]').inputValue(),'Full company');
   await contactDialog.getByRole('button',{name:banks.save,exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('input[name=name]'));
   assert.equal(writes.length,2);assert.equal(writes[1].body.contacts.revision,1);
   assert.deepEqual(writes[1].body.contacts.patch,{});assert.equal(writes[1].body.contacts.mode,'DEFAULT');
   await page.getByRole('button',{name:PARTNER_DIRECTORY_TEXT[lang].detail,exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('input[name=contactName]')?.value==='Full contact');
   const restored=page.getByRole('dialog').last();await restored.getByRole('button',{name:contact.local,exact:true}).click();
   assert.equal(await restored.locator('input[name=contactName]').inputValue(),'Updated contact');assert.equal(await restored.locator('input[name=nameKo]').inputValue(),'LOCAL KOREAN NAME');
   await restored.getByRole('button',{name:banks.save,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('input[name=name]'));
   assert.equal(writes[2].body.contacts.mode,'LOCAL');
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
