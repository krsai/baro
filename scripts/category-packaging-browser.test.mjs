import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {revenueCostsText} from '../frontend/src/constants/revenueCosts.js';
const file=path.resolve('frontend/category-packaging-acceptance.html'),port=43250;
assert.ok(!existsSync(file));
writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import {MemoryRouter} from 'react-router-dom';import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider} from '@mui/material';import theme from '/src/theme';import Settings from '/src/components/CategoryPackagingSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(Settings,{orgId:7,languageCode:new URLSearchParams(location.search).get('lang')}))));
</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/category-packaging-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],t=revenueCostsText[lang];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgRole:'ADMIN'});"}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const actions={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  let saved={revision:0,values:{},categories:[{id:2,name:'T-shirt'}]},writes=0;
  await page.route('**/category-packaging-settings?*',async route=>{
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(route.request().method()==='OPTIONS')return route.fulfill({headers});
   if(route.request().method()==='PUT'){const body=route.request().postDataJSON();assert.equal(body.revision,saved.revision);saved={...saved,...body,revision:saved.revision+1};writes++;}
   await route.fulfill({headers,json:saved});
  });
  await page.goto(`http://127.0.0.1:${port}/category-packaging-acceptance.html?lang=${lang}`);
  const input=page.getByRole('textbox',{name:t.volume,exact:true}),save=page.getByRole('button',{name:t.save,exact:true});
  await input.waitFor();assert.equal(writes,0);assert.equal(await save.isDisabled(),true);
  await input.fill('0.000125');await save.click();await page.waitForFunction(()=>document.querySelector('button')?.disabled);
  assert.equal(saved.values['2'],'0.000125');assert.equal(writes,1);
  await page.reload();await input.waitFor();assert.equal(await input.inputValue(),'0.000125');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: category CBM precision, dirty state, explicit save/reload; ko/en/vi.');
}finally{await browser?.close();vite.kill();unlinkSync(file);}
