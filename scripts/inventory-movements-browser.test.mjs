import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';

const fixture='frontend/inventory-movement-acceptance.html',port=43293;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Route,Routes} from 'react-router-dom';import {InventoryEntry,InventoryRows} from '/src/pages/App/inventory/InventoryMovements.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/inventory/movements/new']},React.createElement(Routes,null,React.createElement(Route,{path:'/inventory/movements/new',element:React.createElement(InventoryEntry)}),React.createElement(Route,{path:'/inventory/movements',element:React.createElement(InventoryRows,{view:'history'})}))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/inventory-movement-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 const master={id:'box',data:{nameEn:'Carton Box',baseSnapshot:{code:'CTN'},unit:{nameEn:'Each'}}};
 const variants=[{id:'own',attributes:{owner:{id:1,name:'BARO'},dimensions:{length:'10',width:'10',height:'10'}}}];
 const owners=[{id:1,name:'BARO'},{id:2,name:'THE SAN'}];
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
 for(const width of [1440,390])for(const useExisting of [false,true]){
  const page=await browser.newPage({viewport:{width,height:900}}),writes=[],errors=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const a={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop};export const useAppActions=()=>a;'}));
  await page.route('**/inventory-entry**',r=>{
   const req=r.request(),path=new URL(req.url()).pathname;
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(path.endsWith('/masters'))return r.fulfill({headers,json:[master]});
   if(path.endsWith('/options'))return r.fulfill({headers,json:{variants,owners,colors:[],types:[],fields:{dimensions:true,color:'HIDDEN',type:'HIDDEN'}}});
   if(path.endsWith('/history'))return r.fulfill({headers,json:[{id:'one',date:'2026-11-20',quantity:'1250.0000',remark:'',master:master.data,attributes:variants[0].attributes}]});
   writes.push(req.postDataJSON());return r.fulfill({headers,status:201,json:{id:'one'}});
  });
  const masterLoad=page.waitForResponse(response=>response.url().includes('/inventory-entry/masters'));
  await page.goto(`http://127.0.0.1:${port}/inventory-movement-acceptance.html`);
  const pick=async(label,value)=>{const input=page.getByRole('textbox',{name:label});await input.fill(value);await input.press('Enter');};
  await masterLoad;
  await pick(/Material master/i,'CTN');
  await page.getByRole('button',{name:'Register new item'}).waitFor();
  if(useExisting){
   await pick(/Stock item/i,'BARO');
   const lookup=page.getByRole('dialog');
   await lookup.getByRole('button',{name:'Select',exact:true}).click();
  }else{
   await page.getByRole('button',{name:'Register new item'}).click();
   await pick(/Owner/i,'THE SAN');
   for(const axis of ['Length','Width','Height'])await page.getByRole('textbox',{name:new RegExp(axis,'i')}).fill('10');
  }
  await page.getByRole('textbox',{name:/Quantity/i}).fill('1250').catch(async error=>{throw new Error(JSON.stringify({cause:error.message,errors,body:await page.locator('body').innerText()}));});
  await page.getByRole('button',{name:'Save',exact:true}).click({timeout:5000});
  await page.getByRole('cell',{name:'1,250',exact:true}).waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].masterId,'box');
  assert.equal(writes[0].variantId,useExisting?'own':null);
  if(!useExisting){assert.equal(writes[0].ownerId,2);assert.deepEqual(writes[0].dimensions,{length:'10',width:'10',height:'10'});}
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS inventory movement entry and reuse on desktop and mobile');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
