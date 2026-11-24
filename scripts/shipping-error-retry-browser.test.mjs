import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {shippingEditorText} from '../frontend/src/constants/shippingEditor.js';

const fixture=path.resolve('frontend/shipping-error-retry-acceptance.html'),port=43561;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{AppProvider}from'/src/context/AppContext';import Location from'/src/components/ShippingLocationField';import Party from'/src/components/ShippingPresetDialog';
const p=new URLSearchParams(location.search),lang=p.get('lang'),kind=p.get('kind');
function Demo(){const[open,setOpen]=React.useState(true);return open?kind==='PARTY'?React.createElement(Party,{orgId:7,customerId:11,languageCode:lang,kind:'PARTY',current:{name:'Draft Party',address:'Draft Address'},onClose:()=>setOpen(false),onLoad:value=>{window.applied=value;}}):React.createElement(Location,{orgId:7,customerId:11,languageCode:lang,label:'Location',value:'Draft Address',details:{label:'Draft Terminal',contactName:'Draft Contact'},allowPorts:kind==='PORT',onClose:()=>setOpen(false),onChange:(...value)=>{window.applied=value;}}):React.createElement('div',{'data-testid':'closed'},'Closed');}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(AppProvider,null,React.createElement(Demo)))));
</script></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
const queryText={ko:{error:'자료를 불러오지 못했습니다.',retry:'다시 시도'},en:{error:'Could not load data.',retry:'Try again'},vi:{error:'Không thể tải dữ liệu.',retry:'Thử lại'}};
const label=value=>new RegExp('^'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(fixture)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const kind of ['ADDRESS','PARTY','PORT']){
  if(process.argv.some(arg=>arg.startsWith('--kind='))&&!process.argv.includes('--kind='+kind))continue;
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[],writes=[],t=shippingEditorText[lang],q=queryText[lang];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let reads=0,saved=null;
  await page.route(/\/shipping-requests\/(presets|parties|ports)(?:[/?]|$)/,async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
   assert.equal(url.searchParams.get('orgId'),'7');
   if(req.method()==='GET'&&!url.pathname.endsWith('/ports'))assert.equal(url.searchParams.get('customerId'),'11');
   requests.push({method:req.method(),path:url.pathname,query:url.search});
   if(url.pathname.endsWith('/parties'))return route.fulfill({headers,json:[]});
   if(req.method()==='GET'){
    reads++;if(reads===1||kind==='PORT'&&reads===3)return route.fulfill({headers,status:500,json:{error:'TEST_READ_FAILURE'}});
    return route.fulfill({headers,json:kind==='PORT'?{rows:[{code:'VNHPH',name:'Haiphong',country:'VN'}],hasMore:false}:saved?[saved]:[]});
   }
   const body=req.postDataJSON();writes.push(body);saved={...body,version:1};
   if(writes.length===1)return route.fulfill({headers,status:500,json:{error:'TEST_FAILED_AFTER_COMMIT'}});
   return route.fulfill({headers,json:saved});
  });
  await page.goto(`http://127.0.0.1:${port}/${path.basename(fixture)}?lang=${lang}&kind=${kind}`);
  const dialog=page.getByRole('dialog'),status=dialog.locator('[data-table-status=error]'),toast=page.locator('.MuiSnackbar-root');
  await status.getByRole('alert').getByText(label(q.error)).waitFor();
  assert.equal(await dialog.locator('[data-table-status=empty]').count(),0);
  assert.equal(reads,1);
  const address=kind==='PORT'?dialog.getByRole('textbox',{name:label(t.terminalName),exact:true}):dialog.getByRole('textbox',{name:label(t.savedAddress),exact:true});
  await address.fill(kind==='PORT'?'Keep Terminal':'Keep Draft Address');await address.press('Tab');
  await page.waitForTimeout(350);assert.equal(reads,1,'failed read must not retry automatically');
  const before=await address.inputValue();
  await status.getByRole('button',{name:label(q.retry),exact:true}).click();await status.waitFor({state:'hidden'});
  if(kind==='PORT')await dialog.getByRole('button',{name:'VNHPH',exact:true}).waitFor();else await dialog.locator('[data-table-status=empty]').waitFor();
  assert.equal(reads,2);assert.equal(await address.inputValue(),before);assert.deepEqual(requests.filter(r=>r.method==='GET'&&!r.path.endsWith('/parties'))[0],requests.filter(r=>r.method==='GET'&&!r.path.endsWith('/parties'))[1]);
  if(kind==='PORT'){
   await dialog.getByRole('button',{name:'VNHPH',exact:true}).click();
   const search=dialog.getByRole('textbox',{name:label(t.locationSearch),exact:true});await search.fill('Ha');await status.waitFor();
   assert.equal(await dialog.getByRole('button',{name:label(t.applyLocation),exact:true}).isDisabled(),true);assert.equal(await address.inputValue(),before);
   await status.getByRole('button',{name:label(q.retry),exact:true}).click();await dialog.getByRole('button',{name:'VNHPH',exact:true}).waitFor();assert.equal(await search.inputValue(),'Ha');assert.equal(reads,4);assert.deepEqual(requests[2],requests[3]);
   await dialog.getByRole('button',{name:label(t.applyLocation),exact:true}).click();await page.getByTestId('closed').waitFor();
   assert.deepEqual(await page.evaluate(()=>window.applied),['Haiphong (VNHPH)','VNHPH',{label:before}]);
  }else{
   if(kind==='ADDRESS'){await dialog.getByRole('textbox',{name:label(t.addressTitle),exact:true}).fill('Saved Draft');await dialog.getByRole('textbox',{name:label(t.addressContact),exact:true}).fill('Keep Contact');}
   const saveLabel=kind==='ADDRESS'?t.addToAddressBook:t.savePreset;
   await dialog.getByRole('button',{name:label(saveLabel),exact:true}).click();
   await toast.getByRole('alert').getByText(label(t.failed)).waitFor();
   assert.equal(await dialog.getByText(label(t.failed)).count(),0,'save error belongs to the global toast');
   assert.equal(await address.isDisabled(),true);assert.equal(await address.inputValue(),before);assert.equal(writes.length,1);
   await dialog.getByRole('button',{name:label(t.retry),exact:true}).click();await toast.getByText(label(t.saved)).waitFor();
   assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1],'uncertain save must reuse the exact request');assert.equal(saved.version,1);assert.equal(await address.inputValue(),before);assert.equal(await address.isEnabled(),true);
   const apply=kind==='ADDRESS'?t.applyLocation:t.loadPreset;await dialog.getByRole('button',{name:label(apply),exact:true}).click();await page.getByTestId('closed').waitFor();assert.ok(await page.evaluate(()=>window.applied));
  }
  assert.deepEqual(errors,[]);await page.close();console.log('PASS shipping read error/retry, draft preservation'+(kind==='PORT'?', port apply':', global save error and identical retry'),lang,width,kind);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
