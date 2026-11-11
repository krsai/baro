import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/style-product-ownership-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Picker from'/src/pages/App/style/StyleProductPicker.jsx';
window.notices=[];window.taken=0;function App(){const[org,setOrg]=React.useState(1);window.switchOrg=setOrg;return React.createElement(Picker,{orgId:org,languageCode:new URL(location.href).searchParams.get('lang'),onTaken:()=>window.taken++});}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(App)));
</script></body></html>`);
const port=43258;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/style-product-ownership-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:(message,level)=>window.notices.push({message,level})});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};let writes=0;
  await page.route('**/style-products?*',route=>route.fulfill({headers,json:writes>=2&&new URL(route.request().url()).searchParams.get('orgId')==='1'?[]:[{id:17,ownerOrgId:2,ownerOrgName:'THE SAN',customerOrgId:2,revision:3,fields:{code:'AM01160',name:'Áo 한글'}}]}));
  await page.route('**/style-products/17/production-style?*',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({headers,status:204});
   writes++;assert.deepEqual(route.request().postDataJSON(),{customerOrgId:2,revision:3});
   await new Promise(resolve=>setTimeout(resolve,200));
   return route.fulfill({headers,status:writes===1?409:200,json:writes===1?{error:'STYLE_PRODUCT_REVISION_CONFLICT'}:{id:81,productStyleId:17,appliedProductRevision:3}});
  });
  await page.goto(`http://127.0.0.1:${port}/style-product-ownership-acceptance.html?lang=${lang}`);
  const button=page.locator('button').first();await button.click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('cell',{name:'AM01160',exact:true}).waitFor();
  const query=dialog.getByRole('textbox');await query.fill('AM01160');
  const select=dialog.locator('tbody button').first();
  await select.evaluate(element=>{element.click();element.click();});
  await dialog.getByRole('alert').waitFor();assert.equal(writes,1);assert.equal(await query.inputValue(),'AM01160');
  await select.click();await dialog.waitFor({state:'hidden'});
  assert.equal(writes,2);assert.equal(await page.evaluate(()=>window.taken),1);
  assert.equal(await page.evaluate(()=>window.notices.filter(n=>n.level==='success').length),1);
  await page.waitForFunction(()=>document.querySelectorAll('button').length===0);await page.evaluate(()=>window.switchOrg(2));await button.waitFor();await button.click();await dialog.waitFor();await query.fill('No matching product');
  assert.equal(await dialog.locator('tbody button').count(),0);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await button.evaluate(element=>element===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS product style import',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
