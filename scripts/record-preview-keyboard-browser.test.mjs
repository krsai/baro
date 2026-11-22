import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';
const html='frontend/record-preview-test.html',jsx='frontend/record-preview-test.jsx',port=43517;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/record-preview-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import Party from'/src/components/ShippingPresetDialog';import Requester from'/src/components/ShippingRequesterBook';import Address from'/src/components/ShippingAddressBook';import Location from'/src/components/ShippingLocationField';const p=new URLSearchParams(location.search),mode=p.get('mode'),languageCode=p.get('lang');function App(){const[open,setOpen]=React.useState(true);const apply=row=>{window.chosen=row;window.commits=(window.commits||0)+1;};const props={orgId:1,customerId:2,languageCode,onClose:()=>{window.previewClosed=true;setOpen(false);}};return open?(mode==='port'?<Location {...props} allowPorts label='Ports' onChange={(name,code,extra)=>apply({name,code,extra})}/>:mode==='party'?<Party {...props} kind='PARTY' parties={[{id:11,name:'ALPHA',country:'KR',address:'ALPHA ADDRESS'},{id:12,name:'BETA',country:'VN',address:'BETA ADDRESS'}]} onLoad={apply}/>:mode==='requester'?<Requester {...props} onSelect={apply}/>:<Address {...props} onLoad={apply}/>):null;}createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><App/></MemoryRouter></ThemeProvider>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/record-preview-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of (process.env.RECORD_PREVIEW_MODES?.split(',')||['party','requester','address','port'])){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=shippingEditorText[lang];let writes=0,confirms=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{confirms++;await d.accept();});
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){},showNotification(){}};export const useAppActions=()=>a;'}));
  await page.route('**/shipping-requests/ports*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{rows:[{id:11,name:'ALPHA',code:'KRALP',country:'KR'},{id:12,name:'BETA',code:'VNBET',country:'VN'}]}}));
  await page.route('**/shipping-requests/parties*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:[]}));
  await page.route('**/shipping-requests/presets*',r=>{if(r.request().method()!=='GET'){writes++;return r.abort();}const kind=new URL(r.request().url()).searchParams.get('kind');return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:kind==='PARTY'?[]:['ALPHA','BETA'].map((name,index)=>({id:'saved-'+index,label:name,version:1,data:{name,label:name,address:name+' ADDRESS',phone:'01012345678',country:'KR'}}))});});
  const go=async()=>{await page.goto(`http://127.0.0.1:${port}/record-preview-test.html?mode=${mode}&lang=${lang}`);await page.locator('[data-dialog-record-list] tbody tr[data-record-row]').last().waitFor();};
  await go();const rows=page.locator('[data-record-row]'),detail=page.locator('[data-list-detail-content]'),search=page.locator('[data-record-search] input');
  if(mode==='port'){
   await rows.nth(1).hover();await detail.getByText('BETA',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.chosen),undefined);
   await detail.getByRole('textbox',{name:t.terminalName,exact:true}).fill('TERMINAL DRAFT');await rows.nth(0).getByRole('button').focus();await detail.getByText('ALPHA',{exact:true}).waitFor();assert.equal(await detail.getByRole('textbox',{name:t.terminalName,exact:true}).inputValue(),'TERMINAL DRAFT');
   await rows.nth(0).dispatchEvent('keydown',{key:'Enter',repeat:true});assert.equal(await page.evaluate(()=>window.chosen),undefined);await page.keyboard.press('Enter');await page.waitForFunction(()=>window.previewClosed);assert.equal(await page.evaluate(()=>window.chosen.code),'KRALP');assert.equal(await page.evaluate(()=>window.chosen.extra.label),'TERMINAL DRAFT');assert.equal(await page.evaluate(()=>window.commits),1);assert.equal(writes,0);assert.deepEqual(errors,[]);await page.close();console.log('PASS record preview/Enter/native button',mode,lang,width);continue;
  }
  const name=()=>detail.getByRole('textbox',{name:mode==='party'?t.partyName:mode==='requester'?t.requesterName:t.addressTitle,exact:true});
  await rows.nth(1).hover();await page.waitForFunction(()=>[...document.querySelectorAll('[data-list-detail-content] input')].some(n=>n.value==='BETA'));assert.equal(await name().inputValue(),'BETA');assert.equal(await page.evaluate(()=>window.chosen),undefined);
  await search.focus();await search.press('ArrowUp');await page.waitForFunction(()=>[...document.querySelectorAll('[data-list-detail-content] input')].some(n=>n.value==='ALPHA'));assert.equal(await name().inputValue(),'ALPHA');
  await page.keyboard.press('Shift+Enter');await rows.nth(0).dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(await page.evaluate(()=>window.chosen),undefined);
  await page.keyboard.press('Enter');await page.waitForFunction(()=>window.previewClosed);assert.equal(await page.evaluate(()=>window.commits),1);assert.equal(await page.evaluate(()=>window.chosen.name||window.chosen.label),'ALPHA');assert.equal(writes,0);
  await go();await rows.nth(1).hover();await page.waitForFunction(()=>[...document.querySelectorAll('[data-list-detail-content] input')].some(n=>n.value==='BETA'));
  const address=detail.getByRole('textbox',{name:t.savedAddress,exact:true});await address.fill('UNSAVED ADDRESS');await rows.nth(0).hover();assert.equal(await name().inputValue(),'BETA');assert.equal(await address.inputValue(),'UNSAVED ADDRESS');assert.equal(confirms,0,'hover never opens discard confirmation');
  await search.focus();await search.press('ArrowUp');await search.press('Enter');assert.equal(await page.evaluate(()=>window.chosen),undefined,'dirty form is not replaced or confirmed by list navigation');
  await detail.getByRole('textbox',{name:t.savedAddress,exact:true}).press('Enter');assert.equal(await page.evaluate(()=>window.chosen),undefined,'detail input Enter does not apply');assert.equal(writes,0);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS record preview/Enter/dirty guard',mode,lang,width);
 }
}finally{await browser?.close();vite.kill();for(const p of [html,jsx])if(existsSync(p))unlinkSync(p);}
