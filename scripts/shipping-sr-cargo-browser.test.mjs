import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';
import {freightJobEditorText} from '../frontend/src/constants/freightJobEditor.js';
import {jobText} from '../frontend/src/constants/freightJobs.js';
import {shippingEnglishText} from '../frontend/src/utils/shippingEnglish.mjs';
const file='frontend/shipping-sr-cargo-test.html',port=43469;assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import{appThemes}from'/src/theme';import'/src/styles/form.css';import Editor from'/src/components/FreightJobEditor';import{jobText}from'/src/constants/freightJobs';
const params=new URLSearchParams(location.search),lang=params.get('lang'),mode=params.get('mode'),customer={id:11,name:'CUSTOMER ENGLISH',nameKo:'고객',code:'CUST',country:'VN',phone:'00123'},receiver={id:12,name:'RECEIVER',country:'KR'};
function App(){return <Editor t={jobText[lang]} options={{customers:[customer,receiver,{id:20,isShippingGeneralCustomer:true,name:"General",code:"EXGC"}],forwarder:{id:7,name:'DEX'}}} initial={{id:'saved-job',number:'SR-1',version:1,customerId:20,mode:mode==='EXPRESS'?'AIR':mode==='SEA'?'SEA':'ROAD',service:mode==='EXPRESS'?'EXPRESS':'GENERAL',data:{shipmentType:mode==='SEA'?'FCL':undefined,customerRole:'shipper',shipperId:11,shipperParty:customer,consigneeId:12,consigneeParty:receiver,notifySameAsConsignee:true,notifyId:12,notifyParty:receiver,transportService:mode==='EXPRESS'?'EXPRESS':'GENERAL',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},origin:'PICKUP',destination:'DELIVERY',routeLocations:{ORIGIN_DOOR:'PICKUP',DESTINATION_DOOR:'DELIVERY'},cargo:'Goods',hsCode:'610910',plannedDate:'2026-11-25',packages:[{quantity:'2',lengthM:'1',widthM:'2',heightM:'3'}],generalCustomer:true,actualRequesterName:'Lee Sejin',actualRequesterPhone:'0388569432',actualRequesterCountry:'VN',actualRequesterAddress:'Hanoi',actualRequesterRole:params.get('role')||null,customerRole:null,...(params.get('role')?{[params.get('role')+'Id']:null,[params.get('role')+'Party']:{name:'Lee Sejin',phone:'0388569432',country:'VN',address:'Hanoi'},notifySameAsConsignee:false}:{} )}}} name={row=>row?.nameKo||row?.name||''} orgId={7} onClose={()=>{}} onSave={async value=>{window.saved=value;}}/>;}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={appThemes[params.get('theme')||'standard']}><CssBaseline/><MemoryRouter><App/></MemoryRouter></ThemeProvider>);</script></html>`);
const jsx=file.replace('.html','.jsx');assert.ok(!existsSync(jsx));const source=readFileSync(file,'utf8');writeFileSync(jsx,source.match(/<script type="module">([\s\S]*)<\/script>/)[1]);writeFileSync(file,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/shipping-sr-cargo-test.jsx"></script></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-sr-cargo-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
 if(process.argv.some(arg=>arg.startsWith('--lang='))&&!process.argv.includes('--lang='+lang)||process.argv.some(arg=>arg.startsWith('--width='))&&!process.argv.includes('--width='+width))continue;
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],x=shippingEditorText[lang],e=freightJobEditorText[lang];page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
 await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},showNotification(){}};export const useAppActions=()=>a;'}));
 await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
 await page.route('**/shipping-requests/presets*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
 await page.route('**/shipping-requests/parties*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
 for(const key of ['Enter','Tab','F2']){
  await page.goto(`http://127.0.0.1:${port}/shipping-sr-cargo-test.html?lang=${lang}&mode=EXPRESS`);
  const input=page.getByTestId('shipping-editor').locator('[data-shipping-basics]').getByRole('textbox',{name:jobText[lang].customer,exact:true});await input.fill('');await input.press(key);
  await page.locator('[data-lookup-dialog=true]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-lookup-dialog=true]').waitFor({state:'hidden'});
 }
 await page.goto(`http://127.0.0.1:${port}/shipping-sr-cargo-test.html?lang=${lang}&mode=EXPRESS&role=shipper`);
 const editor=page.getByTestId('shipping-editor'),summary=editor.locator('[data-sr-cargo-summary]'),dg=editor.locator('[data-commodity-inputs]');await editor.waitFor();
 const emptyParty=editor.getByTestId('freight-party-consignee').getByRole('textbox');await emptyParty.fill('');await emptyParty.press('Tab');await page.getByTestId('shipping-party-book').waitFor();await page.keyboard.press('Escape');await page.getByTestId('shipping-party-book').waitFor({state:'hidden'});
 await page.reload();await editor.waitFor();
 assert.equal(await editor.getByRole('textbox',{name:x.hsCode,exact:true}).count(),0);assert.equal(await editor.getByText(x.cargoSchedule,{exact:true}).count(),0);assert.equal(await editor.locator('input[type=date]').count(),0);assert.equal(await editor.locator('[data-package-row]').count(),0);
 assert.equal(await summary.locator(':scope > *').count(),5);assert.equal(await summary.getByRole('combobox',{name:e.unit,exact:true}).count(),1);assert.equal(await dg.getByRole('checkbox',{name:'DG',exact:true}).count(),1);
 if(width===1440){const positions=await summary.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));assert.ok(Math.max(...positions)-Math.min(...positions)<2);}
 await summary.getByRole('textbox',{name:e.cargo,exact:true}).fill('Garment');await summary.getByRole('spinbutton',{name:e.quantity,exact:true}).fill('7');await summary.getByRole('combobox',{name:e.unit,exact:true}).click();await page.getByRole('option',{name:'CTN',exact:true}).click();await summary.getByRole('spinbutton',{name:e.weightKg,exact:true}).fill('1040');await summary.getByRole('spinbutton',{name:x.cbm,exact:true}).fill('5.44');
 await dg.getByRole('checkbox',{name:'DG',exact:true}).check();await dg.getByRole('combobox',{name:x.dgClass,exact:true}).click();await page.getByRole('option',{name:'3',exact:true}).click();await dg.getByRole('textbox',{name:x.unNumber,exact:true}).fill('1993');assert.ok(!x.chargeableWeightKg.includes('?'));await editor.getByRole('spinbutton',{name:x.chargeableWeightKg,exact:true}).fill('1100');
 await editor.getByRole('button',{name:jobText[lang].save,exact:true}).click();await page.waitForFunction(()=>!!window.saved);const saved=await page.evaluate(()=>window.saved);assert.equal(saved.data.cargo,'Garment');assert.equal(saved.data.quantity,'7');assert.equal(saved.data.unit,'CTN');assert.equal(saved.data.weightKg,'1040');assert.equal(saved.data.cbm,'5.44');assert.equal(saved.data.dgClass,'3');assert.equal(saved.data.unNumber,'1993');assert.equal(saved.data.chargeableWeightKg,'1100');assert.equal(saved.data.hsCode,'610910');assert.equal(saved.data.plannedDate,'2026-11-25');assert.deepEqual(saved.data.packages,[{quantity:'2',lengthM:'1',widthM:'2',heightM:'3'}]);
 assert.equal(await editor.locator('.MuiDialog-paper').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS SR summary and empty lookup keys',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);if(existsSync(jsx))unlinkSync(jsx);}
