import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
const fixture='frontend/material-variants-test.html',port=43543;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Master from '/src/components/MaterialMasterList';
window.testReact=React;
function App(){const [keyword,setKeyword]=React.useState('');return React.createElement(React.Fragment,null,React.createElement('input',{'aria-label':'Search',value:keyword,onChange:e=>setKeyword(e.target.value)}),React.createElement(Master,{keyword}));}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(App))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});
let browser;
const names=name=>({nameEn:name,nameKo:name,nameVi:name});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/material-variants-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const a={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop};export const useAppActions=()=>a;'}));
  await page.route('**/src/components/AppNotice.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export default function Notice({children,action}){return window.testReact.createElement('div',{role:'alert'},children,action);}"}));
  const unit={id:1,...names('Each')},codes=[{baseId:1,base:{id:1,code:'CTN',...names('Carton Box'),materialUnitId:1}},{baseId:2,base:{id:2,code:'LBL',...names('Label'),materialUnitId:1}}];
  const variants=[{id:'san10',baseId:1,ownerId:2,attributes:{owner:{id:2,name:'THE SAN'},type:names('10x10x10'),color:{code:'RED',...names('Red')}},unit},{id:'baro20',baseId:1,ownerId:1,attributes:{owner:{id:1,name:'BARO'},type:names('20x20x20')},unit},{id:'san-old',baseId:1,ownerId:2,attributes:{owner:{id:2,name:'THE SAN'},dimensions:{length:'30',width:'40',height:'50'}},unit}];
  let fail=lang==='ko'&&width===1440;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/material-items**',r=>{
   const req=r.request(),url=new URL(req.url());
   assert.equal(url.searchParams.get('orgId'),'1');
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()!=='GET')writes.push(req.method());
   if(url.pathname.endsWith('/catalogue'))return r.fulfill({headers,json:{codes,units:[unit]}});
   if(url.pathname.endsWith('/variants'))return r.fulfill({headers,status:fail?503:200,json:fail?{error:'UNAVAILABLE'}:variants});
   return r.fulfill({headers,json:[]});
  });
  await page.goto(`http://127.0.0.1:${port}/material-variants-test.html`);
  const t=materialItemText[lang];
  if(fail){await page.getByRole('alert').waitFor().catch(async e=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText(),cause:e.message}));});assert.equal(await page.getByText(t.empty,{exact:true}).count(),0);fail=false;await page.getByRole('button',{name:t.retry,exact:true}).click();}
  const view=page.getByRole('button',{name:new RegExp(t.viewItems+' .*CTN')});
  await view.waitFor();assert.equal(await page.getByRole('cell',{name:'10x10x10',exact:true}).count(),0);
  assert.equal(await view.locator('xpath=..').evaluate(cell=>cell===cell.parentElement.lastElementChild&&getComputedStyle(cell).position==='sticky'),true);
  await view.focus();await page.keyboard.press('Enter');
  let dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByRole('cell',{name:'10x10x10',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('cell',{name:'THE SAN',exact:true}).count(),2);
  await dialog.getByRole('cell',{name:'30 \u00d7 40 \u00d7 50',exact:true}).waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await view.evaluate(button=>button===document.activeElement),true);
  await page.getByRole('textbox',{name:'Search',exact:true}).fill('THE SAN');await view.click();
  dialog=page.getByRole('dialog');await dialog.getByRole('cell',{name:'10x10x10',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('cell',{name:'BARO',exact:true}).count(),1,'the modal shows all products belonging to the code');
  await dialog.getByRole('button',{name:t.close,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('textbox',{name:'Search',exact:true}).inputValue(),'THE SAN');
  await page.getByRole('textbox',{name:'Search',exact:true}).fill('10x10x10');
  await view.waitFor();assert.equal(await page.getByRole('button',{name:new RegExp(t.viewItems+' .*LBL')}).count(),0);
  await page.getByRole('textbox',{name:'Search',exact:true}).fill('');
  await page.getByRole('button',{name:new RegExp(t.viewItems+' .*LBL')}).click();
  dialog=page.getByRole('dialog');await dialog.getByRole('cell',{name:t.noItems,exact:true}).waitFor();
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.close();
 }
 console.log('PASS material code drilldown: row-end modal action, keyboard/focus return, all belonging definitions, owner/type search, legacy dimensions, empty state and failure retry; ko/en/vi desktop/mobile; no writes');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
