import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/payroll-target-tabs-test.html',jsx='frontend/payroll-target-tabs-test.jsx',port=43486;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/payroll-target-tabs-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import Settings from'/src/pages/App/payroll/PayrollTargetSettings';const noop=()=>{};createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><Settings orgId={1} languageCode={new URLSearchParams(location.search).get('lang')} showNotification={noop}/></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-target-tabs-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const actions={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop};export const useAppActions=()=>actions;'}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:1});"}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useRequestScopeContext=()=>({scopeId:'/payroll'});"}));
  await page.route('**/src/utils/apiClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url,options={}){
   window.writes??=[];window.reads??=[];
   if(options.method==='PUT'){window.writes.push({url,body:JSON.parse(options.body)});return {};}
   window.reads.push(url);
   if(url.startsWith('/payroll/settings'))throw Error('Employee settings must not load from payroll AP settings');
   if(url.startsWith('/management-targets/')){const excluded=new URL(url,location.origin).searchParams.get('excluded')==='true';return {rows:excluded?[]:[{id:1,title:'PAY-2026-000001',subtitle:'Hanoi',revision:0,snapshotRevision:3,excluded:false}],hasMore:false};}
   return {};
  }` }));
  await page.goto(`http://127.0.0.1:${port}/payroll-target-tabs-test.html?lang=${lang}`);
  await page.getByRole('button').first().waitFor();assert.equal(await page.getByRole('button').count(),1);await page.getByRole('button').click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await dialog.getByRole('tab').count(),0);
  assert.equal(await dialog.locator('input[type=month]').count(),0,'payroll AP settings select saved month/factory calculations, not employee management versions');
  assert.equal(await dialog.getByRole('switch').count(),0);assert.equal(await dialog.getByText('Former Worker',{exact:true}).count(),0);assert.equal(await dialog.getByRole('button',{name:/이번 달부터|다음 달부터|This month|Next month|Từ tháng này|Từ tháng sau/}).count(),0);
  const panel=dialog;await panel.getByRole('button',{name:/PAY-2026-000001/}).click();
  assert.equal(await panel.locator('[data-target-group=true]').getByRole('button',{name:/PAY-2026-000001/}).count(),1);
  page.once('dialog',prompt=>prompt.dismiss());await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'unsaved drafts require confirmation before closing');
  await panel.getByRole('button',{name:({ko:'저장',en:'Save',vi:'Lưu'})[lang],exact:true}).click();await page.waitForFunction(()=>window.writes?.length===1);
  assert.equal(await dialog.count(),1);assert.equal((await page.evaluate(()=>window.writes))[0].body.rows[0].excluded,true);assert.ok((await page.evaluate(()=>window.writes))[0].url.startsWith('/management-targets/EVIDENCE?'));
  assert.equal(await dialog.getByText('Current Worker',{exact:true}).count(),0,'employee attendance configuration is not exposed in payroll AP settings');
  assert.equal(await page.evaluate(()=>window.reads.some(url=>url.startsWith('/payroll/settings'))),false);
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog has no horizontal overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS payroll AP settings: ko/en/vi desktop/mobile, no employee tab, month/factory targets, draft preservation and scoped save.');
}finally{await browser?.close();server.kill();for(const path of [html,jsx])unlinkSync(path);}
