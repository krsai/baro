import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
import {materialVariantManagementText} from '../frontend/src/constants/materialVariantManagement.js';
import {ITEM_ATTRIBUTE_TEXT} from '../frontend/src/constants/itemAttributes.js';
const fixture='frontend/variant-management-acceptance.html',port=43544;assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Master from '/src/components/MaterialMasterList';
import {MemoryRouter} from 'react-router-dom';
function Page(){const [target,setTarget]=React.useState(null);return React.createElement('div',null,React.createElement('header',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},React.createElement('h1',null,'Material master'),React.createElement('div',{ref:setTarget})),React.createElement(Master,{actionContainer:target}));}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const t=materialItemText[lang],m=materialVariantManagementText[lang],a=ITEM_ATTRIBUTE_TEXT[lang];
  const mock=(p,body)=>page.route(p,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`);
  await mock('**/src/context/AppContext.jsx*','const noop=()=>{};export const useAppActions=()=>({showNotification:message=>{window.notice=message;},setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop});');
  const names=name=>({nameEn:name,nameKo:name,nameVi:name}),unit={id:1,...names('Each')},owners=[{id:1,code:'BARO',name:'BARO'},{id:2,code:'TSAN',name:'THE SAN'}];
  const code={baseId:1,base:{id:1,code:'CTN',...names('Carton Box'),materialUnitId:1}},master={id:'system:1:1:1',baseId:1,unitId:1,data:{...names('Carton Box'),unit}};
  let types=[],rows=[{id:'used-item',baseId:1,masterId:'master',revision:1,used:true,unit,ownerId:1,attributes:{owner:owners[0],type:{id:9,...names('Used item')}}}],attempt=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route(/\/(material-items|code-item-options|code-item-types)(\/|\?)/,r=>{
   const req=r.request(),url=new URL(req.url()),path=url.pathname;if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(path==='/material-items/catalogue')return r.fulfill({headers,json:{codes:[code],units:[unit]}});
   if(path==='/material-items/variants'&&req.method()==='GET')return r.fulfill({headers,json:rows});
   if(path==='/material-items/variant-options')return r.fulfill({headers,json:{master,fields:{type:'OPTIONAL',color:'OPTIONAL'},colors:[]}});
   if(path==='/code-item-options')return r.fulfill({headers,json:{owners,types,customers:[]}});
   if(path==='/code-item-types'){const body=req.postDataJSON(),type={id:11,...body};types=[type];return r.fulfill({headers,json:type});}
   const body=req.postDataJSON();writes.push({method:req.method(),body});
   if(req.method()==='DELETE'){rows=rows.filter(row=>row.id!=='new-item');return r.fulfill({headers,json:{deleted:true}});}
   if(req.method()==='POST'&&++attempt===1)return r.fulfill({headers,status:503,json:{error:'UNAVAILABLE'}});
   const row={id:'new-item',baseId:1,masterId:'master',ownerId:body.ownerId,revision:req.method()==='PUT'?2:1,managed:true,used:false,unit,attributes:{owner:owners.find(o=>o.id===body.ownerId),type:types.find(type=>type.id===body.typeId),color:null,dimensions:{}}};rows=[rows[0],row];return r.fulfill({headers,json:{id:row.id,revision:row.revision}});
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`);
  await page.getByRole('button',{name:new RegExp(t.viewItems+' .*CTN')}).click().catch(async e=>{throw Error(JSON.stringify({cause:e.message,errors,body:await page.locator('body').innerText()}));});
  const details=page.getByRole('dialog');await details.getByRole('cell',{name:'Used item',exact:true}).waitFor();
  assert.equal(await details.getByRole('button',{name:m.edit,exact:true}).isDisabled(),true);
  assert.equal(await details.getByRole('button',{name:m.remove,exact:true}).isDisabled(),true);
  await details.getByRole('button',{name:t.close,exact:true}).click();
  await details.waitFor({state:'hidden'});
  const register=page.locator('header').getByRole('button',{name:t.registerMaster,exact:true});
  assert.equal(await page.getByRole('button',{name:t.registerMaster,exact:true}).count(),1);
  const buttonBounds=await register.boundingBox(),titleBounds=await page.getByRole('heading',{name:'Material master',exact:true}).boundingBox();
  assert.ok(Math.abs(buttonBounds.y+buttonBounds.height/2-titleBounds.y-titleBounds.height/2)<3,'register is on the page title row');
  await register.click();
  const registration=page.getByRole('dialog',{name:t.registerMaster,exact:true});
  assert.equal(await registration.getByRole('button',{name:m.add,exact:true}).isDisabled(),true);
  await registration.getByRole('textbox',{name:t.code,exact:true}).fill('CTN');
  await registration.getByRole('textbox',{name:t.code,exact:true}).press('Enter');
  assert.equal(writes.length,0,'selecting a code must not write');
  await registration.getByRole('button',{name:m.add,exact:true}).click();
  let editor=page.getByRole('dialog').last();
  await editor.getByRole('textbox',{name:a.owner,exact:true}).fill('TSAN');await editor.getByRole('textbox',{name:a.owner,exact:true}).press('Enter');
  await editor.getByRole('button',{name:t.addVariant,exact:true}).click();
  const typeDialog=page.getByRole('dialog',{name:t.addVariant,exact:true});for(let i=0;i<3;i++)await typeDialog.getByRole('textbox').nth(i).fill('10x10x10');
  await typeDialog.getByRole('button',{name:a.save,exact:true}).click();await typeDialog.waitFor({state:'hidden'});
  editor=page.getByRole('dialog').last();assert.equal(await editor.getByRole('textbox',{name:t.unit,exact:true}).inputValue(),'Each');
  await editor.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(message=>window.notice===message,m.failed);
  assert.equal(await editor.getByRole('textbox',{name:a.owner,exact:true}).inputValue(),'THE SAN');
  await editor.getByRole('button',{name:t.retry,exact:true}).click();
  await page.getByRole('cell',{name:'10x10x10',exact:true}).waitFor();assert.deepEqual(writes[0].body,writes[1].body);assert.equal(writes[1].body.quantity,undefined);
  const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:'10x10x10',exact:true})});
  await row.getByRole('button',{name:m.edit,exact:true}).click();editor=page.getByRole('dialog').last();
  await editor.getByRole('textbox',{name:a.owner,exact:true}).fill('BARO');await editor.getByRole('textbox',{name:a.owner,exact:true}).press('Enter');
  await editor.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(message=>window.notice===message,m.saved);
  await row.getByRole('cell',{name:'BARO',exact:true}).waitFor();
  await row.getByRole('button',{name:m.remove,exact:true}).click();await row.waitFor({state:'hidden'});
  assert.equal(writes.at(-1).method,'DELETE');assert.equal(writes.at(-1).body.revision,2);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS stock item CRUD ko/en/vi desktop/mobile: type creation, owner edit, fixed unit, used-item protection, retained draft/retry and delete');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
