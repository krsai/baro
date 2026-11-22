import {materialRegistrationText} from '../frontend/src/constants/materialRegistration.js';
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
  const reg=materialRegistrationText[lang],t=materialItemText[lang],m=materialVariantManagementText[lang],a=ITEM_ATTRIBUTE_TEXT[lang];
  const mock=(p,body)=>page.route(p,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:${JSON.stringify(lang)}});`);
  await mock('**/src/context/AppContext.jsx*','const noop=()=>{};export const useAppActions=()=>({showNotification:message=>{window.notice=message;},setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop});');
  const names=name=>({nameEn:name,nameKo:name,nameVi:name}),unit={id:1,...names('Each')},owners=[{id:1,code:'BARO',name:'BARO'},{id:2,code:'TSAN',name:'THE SAN'}];
  const code={baseId:1,base:{id:1,code:'CTN',...names('Carton Box'),materialUnitId:1}},master={id:'system:1:1:1',baseId:1,unitId:1,data:{...names('Carton Box'),unit}};
  let types=[],rows=[{id:'used-item',baseId:1,masterId:'master',revision:1,used:true,unit,ownerId:1,attributes:{owner:owners[0],type:{id:9,...names('Used item')}}}],attempt=0,typeWrites=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route(/\/(material-items|code-item-options|code-item-types)(\/|\?)/,r=>{
   const req=r.request(),url=new URL(req.url()),path=url.pathname;if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(path==='/material-items/options')return r.fulfill({headers,json:rows.map(row=>({id:row.masterId,variantId:row.id,variantRevision:row.revision,data:{...names('Carton Box'),variantId:row.id,itemOwnerSnapshot:row.attributes.owner,itemAttributeSnapshot:{type:row.attributes.type},unit}}))});
   if(path==='/material-items/catalogue')return r.fulfill({headers,json:{codes:[code,{...code,baseId:2,base:{...code.base,id:2,code:'MPP'}}],units:[unit]}});
   if(path==='/material-items/variants'&&req.method()==='GET')return r.fulfill({headers,json:rows});
   if(path==='/material-items/variant-options')return r.fulfill({headers,json:{master,fields:{type:url.searchParams.get('baseId')==='2'?'HIDDEN':'REQUIRED',color:'HIDDEN'},colors:[]}});
   if(path==='/code-item-options')return r.fulfill({headers,json:{owners,types,customers:[]}});
   if(path==='/code-item-types'){typeWrites++;const body=req.postDataJSON(),type={id:11,...body};types=[type];return r.fulfill({headers,json:type});}
   const body=req.postDataJSON();writes.push({method:req.method(),body});
   if(req.method()==='DELETE'){rows=rows.filter(row=>row.id!=='new-item');return r.fulfill({headers,json:{deleted:true}});}
   if(req.method()==='POST'&&++attempt===1)return r.fulfill({headers,status:503,json:{error:'UNAVAILABLE'}});
   const row={id:'new-item',baseId:1,masterId:'master',ownerId:body.ownerId,revision:req.method()==='PUT'?2:1,managed:true,used:false,unit,attributes:{owner:owners.find(o=>o.id===body.ownerId),type:types.find(type=>type.id===body.typeId),color:null,dimensions:{}}};rows=[rows[0],row];return r.fulfill({headers,json:{id:row.id,revision:row.revision}});
  });
  await page.goto(`http://127.0.0.1:${port}/${fixture.split('/')[1]}`);
  const used=page.getByRole('row').filter({has:page.getByRole('cell',{name:'Used item',exact:true})});await used.waitFor();
  assert.equal(await used.getByRole('button',{name:m.edit,exact:true}).isDisabled(),true);assert.equal(await used.getByRole('button',{name:m.remove,exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('dialog').count(),0);
  const register=page.locator('header').getByRole('button',{name:t.registerMaster,exact:true});
  assert.equal(await page.getByRole('button',{name:t.registerMaster,exact:true}).count(),1);
  const buttonBounds=await register.boundingBox(),titleBounds=await page.getByRole('heading',{name:'Material master',exact:true}).boundingBox();
  assert.ok(Math.abs(buttonBounds.y+buttonBounds.height/2-titleBounds.y-titleBounds.height/2)<3,'register is on the page title row');
  await register.click();
  const codeSearch=page.locator('[data-lookup-dialog]');
  await codeSearch.waitFor();
  assert.equal(await page.getByRole('dialog').count(),1,'registration opens code results directly without an empty wrapper');
  assert.equal(await codeSearch.getByRole('button',{name:t.save,exact:true}).count(),0);
  await codeSearch.getByRole('row').filter({has:page.getByRole('cell',{name:'MPP',exact:true})}).getByRole('button').click();
  const registration=page.getByRole('dialog',{name:t.registerMaster,exact:true});
  await registration.getByRole('combobox',{name:t.variant,exact:true}).waitFor();
  assert.equal(await registration.getByRole('combobox',{name:t.variant,exact:true}).isDisabled(),true);
  assert.equal(await registration.getByRole('textbox',{name:t.color,exact:true}).isDisabled(),true);
  await registration.getByRole('textbox',{name:t.code,exact:true}).fill('CTN');
  await registration.getByRole('textbox',{name:t.code,exact:true}).press('Enter');
  assert.equal(writes.length,0,'selecting a code must not write');
  assert.equal(await page.getByRole('dialog').count(),1,'code selection keeps the first dialog');
  let editor=page.getByRole('dialog').last();
  await editor.getByRole('textbox',{name:a.owner,exact:true}).fill('TSAN');await editor.getByRole('textbox',{name:a.owner,exact:true}).press('Enter');
  await editor.getByRole('combobox',{name:t.variant,exact:true}).fill('10x10x10');
  assert.equal(await page.locator('[data-list-detail-dialog]').count(),1);
  const existing=editor.getByRole('button',{name:'BARO',exact:true});
  await existing.click();
  assert.equal(await editor.locator('[data-record-details]').count(),1,'existing item opens shared details');
  assert.equal(writes.length,0,'preview must not register or select a material');
  await editor.getByRole('button',{name:m.add,exact:true}).click();
  assert.equal(await editor.getByRole('combobox',{name:t.variant,exact:true}).inputValue(),'10x10x10','returning from preview preserves the new draft');
  assert.equal(await editor.getByRole('button',{name:t.addVariant,exact:true}).count(),0);
  editor=page.getByRole('dialog').last();assert.equal(await editor.getByRole('textbox',{name:t.unit,exact:true}).inputValue(),'Each');
  assert.equal(await editor.getByRole('textbox',{name:t.unit,exact:true}).getAttribute('readonly'),'');
  assert.equal(await editor.getByRole('textbox',{name:t.color,exact:true}).isDisabled(),true);
  await editor.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('button',{name:t.retry,exact:true}).waitFor();
  assert.equal(await editor.getByRole('textbox',{name:a.owner,exact:true}).inputValue(),'THE SAN');
  await editor.getByRole('button',{name:t.retry,exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(writes[0].body,writes[1].body);assert.equal(typeWrites,1,'direct registration creates its type once across retries');assert.equal(writes[1].body.quantity,undefined);
  assert.equal(await page.locator('header').getByRole('button',{name:reg.requests,exact:true}).count(),0);
  await page.getByRole('cell',{name:'10x10x10',exact:true}).waitFor();assert.equal(rows.length,2);assert.equal(writes.at(-1).method,'POST');assert.deepEqual(errors,[]);await page.close();

 }
 console.log('PASS direct code search and material registration/retry ko/en/vi desktop/mobile');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
