import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';
import {freightJobEditorText} from '../frontend/src/constants/freightJobEditor.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
import {shippingEnglishText} from '../frontend/src/utils/shippingEnglish.mjs';
const file='frontend/shipping-general-role-test.html',port=43459;assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import{appThemes}from'/src/theme';import'/src/styles/form.css';import Editor from'/src/components/FreightJobEditor';import{jobText}from'/src/constants/freightJobs';import Partner from'/src/components/PartnerProfileFields';
const params=new URLSearchParams(location.search),lang=params.get('lang'),mode=params.get('mode'),customer={id:11,name:'CUSTOMER ENGLISH',nameKo:'고객',code:'CUST',country:'VN',phone:'00123'},receiver={id:12,name:'RECEIVER',country:'KR'};
function App(){const[v,set]=React.useState({name:'COMPANY',country:'VN',contactPhone:'+84 00123'});return mode==='PROFILE'?<Partner languageCode={lang} value={v} onChange={(key,value)=>set(v=>({...v,[key]:value}))}/>:<Editor t={jobText[lang]} options={{customers:[customer,receiver,{id:20,isShippingGeneralCustomer:true,name:"General",code:"EXGC"}],forwarder:{id:7,name:'DEX'}}} initial={{id:'saved-job',number:'SR-1',version:1,customerId:20,mode:mode==='EXPRESS'?'AIR':mode==='SEA'?'SEA':'ROAD',service:mode==='EXPRESS'?'EXPRESS':'GENERAL',data:{shipmentType:mode==='SEA'?'FCL':undefined,customerRole:'shipper',shipperId:11,shipperParty:customer,consigneeId:12,consigneeParty:receiver,notifySameAsConsignee:true,notifyId:12,notifyParty:receiver,transportService:mode==='EXPRESS'?'EXPRESS':'GENERAL',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},origin:'PICKUP',destination:'DELIVERY',routeLocations:{ORIGIN_DOOR:'PICKUP',DESTINATION_DOOR:'DELIVERY'},cargo:'Goods',generalCustomer:true,actualRequesterName:'Lee Sejin',actualRequesterPhone:'0388569432',actualRequesterCountry:'VN',actualRequesterAddress:'Hanoi',actualRequesterRole:params.get('role')||null,customerRole:null,...(params.get('role')?{[params.get('role')+'Id']:null,[params.get('role')+'Party']:{name:'Lee Sejin',phone:'0388569432',country:'VN',address:'Hanoi'},notifySameAsConsignee:false}:{} )}}} name={row=>row?.nameKo||row?.name||''} orgId={7} onClose={()=>{}} onSave={async value=>{window.saved=value;}}/>;}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={appThemes[params.get('theme')||'standard']}><CssBaseline/><MemoryRouter><App/></MemoryRouter></ThemeProvider>);</script></html>`);
const jsx=file.replace('.html','.jsx');assert.ok(!existsSync(jsx));const source=readFileSync(file,'utf8');writeFileSync(jsx,source.match(/<script type="module">([\s\S]*)<\/script>/)[1]);writeFileSync(file,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/shipping-general-role-test.jsx"></script></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-general-role-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],x=shippingEditorText[lang],e=freightJobEditorText[lang];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},showNotification(){}};export const useAppActions=()=>a;'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
  await page.route('**/shipping-requests/presets*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:new URL(r.request().url()).searchParams.get('kind')==='REQUESTER'?[{id:'lee-sejin',version:1,data:{name:'Lee Sejin',phone:'0388569432',country:'VN',address:'Hanoi'}}]:[]}));
  await page.route('**/shipping-requests/parties*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  for(const role of ['shipper','consignee','notify']){
   await page.goto(`http://127.0.0.1:${port}/shipping-general-role-test.html?lang=${lang}&mode=EXPRESS`);
   const editor=page.getByTestId('shipping-editor'),basics=editor.locator('[data-shipping-basics]');await editor.waitFor();
   assert.equal(await basics.getByRole('textbox',{name:jobText[lang].customer,exact:true}).inputValue(),x.generalCustomer+' - Lee Sejin');
   assert.equal(await basics.getByRole('textbox',{name:x.generalCustomerPerson,exact:true}).count(),0);
   assert.equal(await basics.locator(':scope > *').count(),3);
   await basics.getByRole('button',{name:e[role],exact:true}).click();
   const party=editor.getByTestId('freight-party-'+role);assert.equal(await party.getByRole('textbox').inputValue(),'Lee Sejin');assert.equal(await party.getByRole('textbox').getAttribute('readonly'),'');
   assert.equal(await party.getByRole('button').count(),0,'selected requester role does not open company directory');
   await editor.getByRole('button',{name:jobText[lang].save,exact:true}).click();await page.waitForFunction(()=>!!window.saved);
   const saved=await page.evaluate(()=>window.saved);assert.equal(saved.data.actualRequesterRole,role);assert.equal(saved.data.customerRole,null);assert.equal(saved.data[role+'Id'],null);assert.equal(saved.data[role+'Party'].phone,'0388569432');assert.equal(saved.customerId,20);
   if(role==='notify')assert.equal(saved.data.notifySameAsConsignee,false);
   await page.goto(`http://127.0.0.1:${port}/shipping-general-role-test.html?lang=${lang}&mode=EXPRESS&role=${role}`);
   await editor.waitFor();assert.equal(await basics.getByRole('button',{name:e[role],exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await editor.getByTestId('freight-party-'+role).getByRole('textbox').inputValue(),'Lee Sejin');
  }
  await page.goto(`http://127.0.0.1:${port}/shipping-general-role-test.html?lang=${lang}&mode=EXPRESS`);
  const editor=page.getByTestId('shipping-editor'),customerInput=editor.locator('[data-shipping-basics]').getByRole('textbox',{name:jobText[lang].customer,exact:true});
  await customerInput.press('F2');await page.locator('[data-lookup-dialog=true]').getByRole('cell',{name:'EXGC',exact:true}).dblclick();
  const book=page.getByTestId('shipping-requester-book');await book.getByRole('button',{name:'Lee Sejin',exact:true}).click();await book.getByRole('button',{name:x.loadPreset,exact:true}).click();await book.waitFor({state:'hidden'});
  assert.equal(await customerInput.inputValue(),x.generalCustomer+' - Lee Sejin');assert.equal(await editor.getByTestId('freight-party-shipper').getByRole('textbox').inputValue(),'Lee Sejin');
  const consignee=editor.locator('[data-shipping-basics]').getByRole('button',{name:e.consignee,exact:true});await consignee.focus();await consignee.press('Enter');
  assert.equal(await editor.getByTestId('freight-party-consignee').getByRole('textbox').inputValue(),'Lee Sejin');assert.equal(await editor.getByTestId('freight-party-shipper').getByRole('textbox').inputValue(),'');assert.equal(await editor.getByTestId('freight-party-notify').getByRole('textbox').inputValue(),'Lee Sejin');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS express individual customer roles',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);if(existsSync(jsx))unlinkSync(jsx);}
