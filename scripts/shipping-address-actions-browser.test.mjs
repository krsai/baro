import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';

const html='frontend/shipping-address-actions-test.html',port=43507;
assert.ok(!existsSync(html));
writeFileSync(html,`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import{MemoryRouter}from'react-router-dom';import Address from'/src/components/ShippingAddressBook';import Party from'/src/components/ShippingPresetDialog';import Requester from'/src/components/ShippingRequesterBook';
const params=new URLSearchParams(location.search),kind=params.get('kind'),languageCode=params.get('lang');window.applied=[];
const registeredParty={id:42,name:'BARO GARMENT',address:'12 MAIN STREET',contactName:'JEONG DONGWON',country:'VN',phone:'0901234567'};window.registered=registeredParty;window.original=JSON.stringify(registeredParty);
const Component={LOCATION:Address,PARTY:Party,REQUESTER:Requester}[kind];createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(Component,{orgId:1,customerId:2,kind,languageCode,registeredParty,onLoad:value=>window.applied.push(value),onSelect:value=>window.applied.push(value),onClose:()=>{},current:{}}))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});
let browser;
const exact=value=>new RegExp('^'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-address-actions-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const kind of ['LOCATION','PARTY','REQUESTER']){
  const t=shippingEditorText[lang],page=await browser.newPage({viewport:{width,height:1000}}),writes=[],errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const saved={id:'saved-row',version:1,kind,customerId:2,label:kind==='PARTY'?'WAREHOUSE CO':'Factory',data:{name:kind==='PARTY'?'WAREHOUSE CO':'JEONG DONGWON',label:'Factory',address:'12 MAIN STREET',contactName:'JEONG DONGWON',country:'VN',phone:'0901234567'}};
  const rows=[saved];
  await page.route(/\/shipping-requests\/(presets|parties)(?:[/?]|$)/,async route=>{
   const request=route.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(new URL(request.url()).pathname.endsWith('/parties'))return route.fulfill({headers,json:[]});
   if(request.method()==='GET')return route.fulfill({headers,json:rows});
   const body=request.postDataJSON();writes.push(body);let row=rows.find(row=>row.id===body.id);if(row)Object.assign(row,body,{version:row.version+1});else{row={...body,version:1};rows.push(row);}return route.fulfill({headers,json:row});
  });
  await page.goto(`http://127.0.0.1:${port}/shipping-address-actions-test.html?kind=${kind}&lang=${lang}`);
  const rowName=kind==='PARTY'?'WAREHOUSE CO':kind==='REQUESTER'?'Jeong Dongwon':'Factory';
  await page.locator('[data-dialog-record-list]').getByRole('button',{name:kind==='PARTY'?new RegExp(rowName,'i'):exact(rowName)}).click();
  const update=page.getByRole('button',{name:exact(kind==='LOCATION'?t.saveAddress:kind==='PARTY'?t.updatePreset:t.updateRequester)});
  const input=page.getByRole('textbox',{name:exact(kind==='REQUESTER'?t.requesterName:t.addressContact)});
  assert.equal(await input.inputValue(),'Jeong Dongwon');assert.equal(await update.isDisabled(),true);
  await input.focus();await input.press('Tab');assert.equal(await update.isDisabled(),true);assert.equal(writes.length,0);
  await input.fill('NGUYEN VAN AN');await input.press('Tab');assert.equal(await input.inputValue(),'Nguyen Van An');
  await update.click();await page.waitForFunction(()=>!document.querySelector('[data-dialog-record-actions] button:last-child:not(:disabled)'));
  assert.equal(writes.length,1);assert.equal(writes[0].id,'saved-row');assert.equal(writes[0].version,1);assert.equal(writes[0].data[kind==='REQUESTER'?'name':'contactName'],'Nguyen Van An');
  await page.getByRole('button',{name:exact(kind==='LOCATION'?t.newAddress:kind==='PARTY'?t.newPreset:t.newRequester)}).click();
  assert.equal(await page.getByRole('button',{name:exact(kind==='LOCATION'?t.addToAddressBook:kind==='PARTY'?t.savePreset:t.addRequester)}).count(),1);
  assert.equal(await page.getByRole('button',{name:exact(kind==='LOCATION'?t.deleteAddress:t.deletePreset)}).count(),0);
  if(kind==='LOCATION'){
   await page.locator('[data-dialog-record-list]').getByRole('button',{name:'BARO GARMENT',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:exact(t.saveRegisteredAddress)}).count(),1);assert.equal(writes.length,1);
   assert.equal(await page.getByRole('button',{name:exact(t.deleteAddress)}).count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.registered)===window.original),true);
   await page.getByRole('button',{name:exact(t.saveRegisteredAddress)}).click();
  }else{
   await page.getByRole('textbox',{name:exact(kind==='PARTY'?t.partyName:t.requesterName)}).fill('New Person');
   if(kind==='REQUESTER')await page.getByRole('textbox',{name:exact(t.requesterPhone)}).fill('0907654321');
   await page.getByRole('button',{name:exact(kind==='PARTY'?t.savePreset:t.addRequester)}).click();
  }
  await page.waitForFunction(()=>!document.querySelector('[data-dialog-record-actions] button:last-child:not(:disabled)'));
  assert.equal(writes.length,2);assert.notEqual(writes[1].id,'saved-row');assert.equal(writes[1].version,undefined);assert.equal(rows.length,2);
  assert.deepEqual(errors,[]);console.log('PASS selected update, pristine focus, revision, new/copy scope',kind,lang,width);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(html);}
