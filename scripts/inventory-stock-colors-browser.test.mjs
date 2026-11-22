import {inventoryColorText} from '../frontend/src/constants/inventoryColors.js';
import {materialRegistrationText} from '../frontend/src/constants/materialRegistration.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
import {materialVariantManagementText} from '../frontend/src/constants/materialVariantManagement.js';
import {ITEM_ATTRIBUTE_TEXT} from '../frontend/src/constants/itemAttributes.js';
const fixture='frontend/stock-color-acceptance.html',port=43545;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import {InventoryRows} from '/src/pages/App/inventory/InventoryMovements';
import {MemoryRouter} from 'react-router-dom';
function Page(){return React.createElement(InventoryRows,{view:'stock'});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});

 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const t=materialItemText[lang],c=inventoryColorText[lang];
  const mock=(p,body)=>page.route(p,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`);
  await mock('**/src/context/AppContext.jsx*','const noop=()=>{};export const useAppActions=()=>({showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop});');
  await mock('**/src/utils/apiClient.js*',`export const activateRequestScope=()=>{};export const deactivateRequestScope=()=>{};export const buildQueryString=q=>'?'+new URLSearchParams(q);export const requestJSON=async (url,options)=>{const r=await fetch('/test-api'+url,options);if(!r.ok){const e=new Error('failed');e.status=r.status;throw e;}return r.json();};`);
  const names=name=>({nameEn:name,nameKo:name,nameVi:name}),white={id:1,code:'WHT',...names('White')},master={...names('Carton'),baseSnapshot:{code:'CTN'},unit:names('Each')},attrs={owner:{id:2,name:'THE SAN'},type:names('10x10x10'),color:null};
  let rows=[{id:'source',revision:1,masterId:'master',attributes:attrs,master,quantity:'10.0000',colorMissing:true}],attempt=0;
  await page.route('**/test-api/inventory-entry/**',r=>{const req=r.request(),url=new URL(req.url());
   if(url.pathname.endsWith('/stock'))return r.fulfill({json:rows});
   if(url.pathname.endsWith('/options'))return r.fulfill({json:{colors:[white]}});
   if(req.method()==='POST'){const b=req.postDataJSON();writes.push(b);if(++attempt===1)return r.fulfill({status:503,json:{}});rows=[{...rows[0],quantity:'6.0000'},{id:'white',revision:1,masterId:'master',attributes:{...attrs,color:white},master,quantity:'4.0000',colorMissing:false}];return r.fulfill({json:{id:'transfer'}});}
   return r.fulfill({json:[{id:'transfer',createdAt:'2026-11-22',attributes:{...attrs,color:white},quantity:'4',actorName:'Staff'}]});
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`);
  await page.getByRole('button',{name:c.classify,exact:true}).waitFor().catch(async e=>{console.log(errors,await page.locator('body').innerText());throw e;});
  await page.getByRole('button',{name:c.classify,exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:t.color,exact:true}).fill('WHT');await dialog.getByRole('textbox',{name:t.color,exact:true}).press('Enter');
  await dialog.getByRole('textbox',{name:c.quantity,exact:true}).fill('4');await dialog.getByRole('button',{name:c.save,exact:true}).click();
  await dialog.getByRole('button',{name:t.retry,exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:c.quantity,exact:true}).inputValue(),'4');
  await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes[0],writes[1]);
  await page.getByRole('button',{name:c.history,exact:true}).click();await page.getByRole('dialog').getByRole('cell',{name:'White',exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS stock palette, partial classification, retry preservation and history ko/en/vi desktop/mobile');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
