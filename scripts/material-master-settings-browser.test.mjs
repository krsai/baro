import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/material-master-settings-test.html',port=43543;
assert.ok(!existsSync(file));
writeFileSync(file,`<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/AccountingCodeSettings';import{MATERIAL_SETTINGS_TEXT}from'/src/components/MaterialCodeSettings';import{EXPENSE_TEXT}from'/src/constants/expenseTypes';const lang=new URLSearchParams(location.search).get('lang');window.labels=MATERIAL_SETTINGS_TEXT[lang];window.inputs=EXPENSE_TEXT[lang];createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page)));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/material-master-settings-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},removeNotification:()=>{}});'}));
  const roles=[{id:1,nameEn:'Distribution'}],industries=[{id:3,partnerRoleId:1,nameEn:'Garment accessories',isActive:true,materialManagement:true}],original={id:7,code:'CTN',nameEn:'Carton box',nameKo:'카톤 박스',nameVi:'Thùng carton',isActive:true,industryIds:[3],industries,industryRevision:1,materialRevision:2,attributeInputs:{},requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',materialSettings:{enabled:true,stockFields:['unit'],unitInput:'REQUIRED',colorInput:'HIDDEN'}};
  let saved=original,reject=true;const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'*','Access-Control-Allow-Headers':'*'};
  await page.route('**/system-setting-defaults/**',r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='PUT'){const body=req.postDataJSON();writes.push(body);if(reject){reject=false;return r.fulfill({headers,status:400,json:{error:'UNAVAILABLE'}});}saved={...original,...body};return r.fulfill({headers,json:saved});}
   return r.fulfill({headers,json:url.pathname.endsWith('/code-bases')?[saved]:url.pathname.endsWith('/partner-roles')?roles:industries});
  });
  await page.goto(`http://127.0.0.1:${port}/material-master-settings-test.html?lang=${lang}`);
  const edit={ko:'수정',en:'Edit',vi:'Sửa'}[lang],save={ko:'저장',en:'Save',vi:'Lưu'}[lang];
  await page.getByRole('row').filter({hasText:'CTN'}).getByRole('button',{name:edit,exact:true}).click();const dialog=page.getByRole('dialog');
  const t=await page.evaluate(()=>window.labels),d=await page.evaluate(()=>window.inputs);
  for(const kind of ['subtypes','inputs','master'])assert.ok((await dialog.locator(`[data-accounting-summary="${kind}"]`).boundingBox()).height<=(width===1440?56:140));
  await dialog.locator('#accounting-master-toggle').click();const panel=dialog.locator('#accounting-input-panel');
  assert.equal(await panel.getByRole('combobox').count(),0);assert.equal(await panel.getByRole('table').count(),0);
  for(const key of ['owner','type','color','dimensions'])await panel.getByRole('checkbox',{name:t[key],exact:true}).check();
  assert.equal(await panel.getByRole('checkbox',{name:t.unit,exact:true}).isChecked(),true);assert.equal(await panel.getByRole('checkbox',{name:t.unit,exact:true}).isDisabled(),true);
  await panel.press('Escape');await panel.waitFor({state:'hidden'});
  await dialog.locator('#accounting-input-toggle').click();
  assert.equal(await panel.getByRole('checkbox',{name:t.owner,exact:true}).isChecked(),false);assert.equal(await panel.getByRole('checkbox',{name:t.dimensions,exact:true}).isChecked(),false);
  await panel.getByRole('checkbox',{name:d.transportDate,exact:true}).check();await panel.press('Escape');await panel.waitFor({state:'hidden'});
  await Promise.all([page.waitForResponse(r=>r.status()===400),dialog.getByRole('button',{name:save,exact:true}).click()]);await dialog.locator('#accounting-master-toggle').click();assert.equal(await panel.getByRole('checkbox',{name:t.owner,exact:true}).isChecked(),true);await panel.press('Escape');await panel.waitFor({state:'hidden'});
  await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(writes[0],writes[1]);assert.deepEqual(saved.attributeInputs,{});assert.deepEqual(saved.requiredFields,['transportDate']);assert.equal(saved.materialSettings.masterInputs.owner,'REQUIRED');assert.equal(saved.materialSettings.masterInputs.dimensions,'REQUIRED');assert.deepEqual(saved.materialSettings.stockFields,['unit']);
  await page.getByRole('row').filter({hasText:'CTN'}).getByRole('button',{name:edit,exact:true}).click();await dialog.locator('#accounting-master-toggle').click();assert.equal(await panel.getByRole('checkbox',{name:t.dimensions,exact:true}).isChecked(),true);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.close();console.log('PASS separate material master requirements/save/retry/reload',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);}
