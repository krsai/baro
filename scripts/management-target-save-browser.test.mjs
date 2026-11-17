import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/management-target-save-test.html',jsx='frontend/management-target-save-test.jsx',port=43488;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/management-target-save-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import OrderSettings from'/src/pages/App/order/OrderTargetSettings';import PayrollSettings from'/src/pages/App/payroll/PayrollTargetSettings';const Settings=new URLSearchParams(location.search).get('mode')==='payroll'?PayrollSettings:OrderSettings;const noop=()=>{};createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><Settings includeEmployees={false} orgId={1} languageCode={new URLSearchParams(location.search).get('lang')}/></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/management-target-save-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const mode of ['order','payroll'])for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const actions={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;'}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1});"}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useRequestScopeContext=()=>({scopeId:'/orders'});"}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url,options={}){
   window.writes??=[];
   if(options.method==='PUT'){window.writes.push({url,body:JSON.parse(options.body)});if(window.pauseSave)return new Promise(resolve=>{window.finishSave=resolve;});return {};}
   if(url.startsWith('/management-targets/')){const excluded=new URL(url,location.origin).searchParams.get('excluded')==='true';return {rows:excluded?[]:[{id:1,title:'ORDER-001',subtitle:'Hanoi',revision:0,snapshotRevision:3,excluded:false}],hasMore:false};}
   return {};
  }` }));
  await page.goto(`http://127.0.0.1:${port}/management-target-save-test.html?mode=${mode}&lang=${lang}`);
  await page.getByRole('button').first().waitFor();assert.equal(await page.getByRole('button').count(),1);await page.getByRole('button').click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await dialog.getByRole('tab').count(),mode==='payroll'?1:2);
  assert.equal(await dialog.locator('input[required]').count(),0);let panel=dialog.getByRole('tabpanel');
  const card=panel.getByRole('button',{name:/ORDER-001/});await card.waitFor();
  const handle=await card.locator('span[aria-hidden=true]').first().boundingBox(),dest=await panel.locator('[data-target-group=true]').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+10,handle.y+handle.height/2,{steps:5});await page.mouse.move(dest.x+dest.width/2,dest.y+80,{steps:20});await page.mouse.up();
  await panel.locator('[data-target-group=true]').getByRole('button',{name:/ORDER-001/}).waitFor();
  assert.equal(await panel.locator('button').last().isDisabled(),false,'drag enables save');
  await panel.locator('[data-target-group=true]').getByRole('button',{name:/ORDER-001/}).click();
  assert.equal(await panel.locator('button').last().isDisabled(),true,'returning to original group clears dirty state');
  await panel.locator('[data-target-group=false]').getByRole('button',{name:/ORDER-001/}).click();
  if(mode==='payroll'){
   await panel.locator('button').last().click();await page.waitForFunction(()=>window.writes?.length===1);
   const writes=await page.evaluate(()=>window.writes);assert.ok(writes[0].url.startsWith('/management-targets/EVIDENCE?'));assert.equal(writes[0].body.rows[0].excluded,true);assert.equal('reason' in writes[0].body,false);assert.deepEqual(errors,[]);await page.close();continue;
  }
  await dialog.getByRole('tab').nth(1).click();
  panel=dialog.getByRole('tabpanel');await panel.getByRole('button',{name:/ORDER-001/}).click();
  await dialog.getByRole('tab').nth(0).click();panel=dialog.getByRole('tabpanel');
  assert.equal(await panel.locator('[data-target-group=true]').getByRole('button',{name:/ORDER-001/}).count(),1);
  page.once('dialog',prompt=>prompt.dismiss());await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
  const save=()=>dialog.getByRole('tabpanel').locator('button').last().click();
  await save();await page.waitForFunction(()=>window.writes?.length===1);
  let writes=await page.evaluate(()=>window.writes);assert.ok(writes[0].url.startsWith('/management-targets/'+(mode==='order'?'INVOICE':'PAYABLE')+'?'));assert.equal(writes[0].body.rows[0].excluded,true);assert.equal('reason' in writes[0].body,false);
  await dialog.getByRole('tab').nth(1).click();panel=dialog.getByRole('tabpanel');
  assert.equal(await panel.locator('[data-target-group=true]').getByRole('button',{name:/ORDER-001/}).count(),1);
  await page.evaluate(()=>{window.pauseSave=true;});await save();await page.waitForFunction(()=>typeof window.finishSave==='function');await page.waitForFunction(()=>document.querySelector('[role=tab]').disabled);assert.ok(await dialog.getByRole('tab').nth(0).isDisabled());await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);await page.evaluate(()=>{window.pauseSave=false;window.finishSave({});});await page.waitForFunction(()=>!document.querySelector('[role=tab]').disabled);await page.waitForFunction(()=>window.writes?.length===2);writes=await page.evaluate(()=>window.writes);assert.ok(writes[1].url.startsWith('/management-targets/'+(mode==='order'?'SHIPPING':'EVIDENCE')+'?'));assert.equal('reason' in writes[1].body,false);
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog has no horizontal overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS order and unified payroll targets: ko/en/vi desktop/mobile, single button/dialog, independent drafts without reasons, unsaved-close guard and scoped saves.');
}finally{await browser?.close();server.kill();for(const path of [html,jsx])unlinkSync(path);}
