import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {managementTargetText} from '../frontend/src/constants/managementTargets.js';
const file=path.resolve('frontend/management-target-test.html'),entry=file.replace('.html','.jsx'),port=43446;
assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(file,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/management-target-test.jsx"></script>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Stack}from'@mui/material';import{MemoryRouter,Routes,Route}from'react-router-dom';import theme from'/src/theme';import Page from'/src/pages/App/payroll/PayrollEntry';import Settings from'/src/components/ManagementTargetSettings';const q=new URLSearchParams(location.search),lang=q.get('lang');createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter initialEntries={['/payroll/2026-09?factoryId=1']}>{q.get('detail')?<Routes><Route path="/payroll/:payrollId" element={<Page/>}/></Routes>:<Stack direction="row">{['INVOICE','SHIPPING','PAYABLE','EVIDENCE'].map(kind=><Settings key={kind} orgId={1} languageCode={lang} kind={kind}/>)}</Stack>}</MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/management-target-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=managementTargetText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  const mock=(pattern,body)=>page.route(pattern,r=>r.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:"ADMIN"}});');
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
  await mock('**/src/context/AppContext.jsx*','const actions={showNotification:()=>{}};export const useAppActions=()=>actions;');
  await mock('**/src/utils/attributeApi.js*','export const fetchAttributes=async()=>({roles:[]});');
  await mock('**/src/utils/apiClient.js*',`export const buildQueryString=o=>'?' + new URLSearchParams(o);export async function requestJSON(url,options={}){
    window.requests??=[];window.requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(url.startsWith('/management-targets/')){
     const u=new URL(url,location.origin),kind=u.pathname.split('/').pop();window.targets??={};window.targets[kind]??=[{id:1,title:'TARGET-001',subtitle:'Hanoi',reference:'REF-001',revision:0,snapshotRevision:3,excluded:false},{id:2,title:'TARGET-002',subtitle:'Other factory',revision:0,snapshotRevision:3,excluded:false},{id:3,title:'TARGET-003',subtitle:'Excluded factory',revision:1,snapshotRevision:3,excluded:true}];
     if(options.method==='PUT'){const body=JSON.parse(options.body);window.writes??=[];window.writes.push({kind,...body});if(!window.failed?.[kind]){window.failed??={};window.failed[kind]=true;const e=Error('interrupted');e.status=503;throw e;}for(const r of body.rows)Object.assign(window.targets[kind].find(s=>s.id===r.id),{excluded:r.excluded,revision:r.revision+1});return {ok:true};}
     if(window.failLoad){window.failLoad=false;throw Error('load failed');}const q=u.searchParams.get('q').toLowerCase(),excluded=u.searchParams.get('excluded')==='true';return {rows:window.targets[kind].filter(r=>r.excluded===excluded&&(r.title+' '+r.subtitle).toLowerCase().includes(q)),hasMore:false};
    }
    if(url.startsWith('/employees'))return [];
    if(url.startsWith('/payroll/calendar'))return {factories:[{id:1,name:'Hanoi'}]};
    return {snapshotId:1,snapshotExists:true,snapshotRevision:3,managementRevision:0,payableManagementExcluded:false,canManagePayables:true,isProvisional:false,month:'2026-09',employees:[{workerId:3,factoryId:1,workerName:'Test Worker',payType:'FIXED',baseSalary:1000000,netSalary:1000000,grossSalary:1000000,salaryItems:[]}]};
  }`);
  await page.goto(`http://127.0.0.1:${port}/management-target-test.html?lang=${lang}`,{waitUntil:'domcontentloaded',timeout:45000});
  for(const kind of ['INVOICE','SHIPPING','PAYABLE','EVIDENCE']){
   const icon=page.getByRole('button',{name:t[kind],exact:true});await icon.click();const dialog=page.getByRole('dialog',{name:t[kind],exact:true});
   const target=dialog.getByRole('button',{name:'TARGET-001 '+t.excluded,exact:true});await target.waitFor();await page.waitForFunction(()=>!document.querySelector('[role=dialog] [aria-busy=true]'));
   if(width===1440&&kind==='INVOICE'){
    const handle=target.locator('span[aria-hidden="true"]').first(),from=await handle.boundingBox(),to=await dialog.locator('[data-target-group="true"]').boundingBox();
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2+10,from.y+from.height/2,{steps:3});await page.mouse.move(to.x+to.width/2,to.y+150,{steps:12});await page.mouse.up();
   }else await target.click();await dialog.getByRole('button',{name:'TARGET-001 '+t.included,exact:true}).waitFor();
   if(['INVOICE','SHIPPING'].includes(kind))await dialog.getByLabel(t.reason,{exact:false}).fill('Handled outside workflow');
   await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.getByText(t.uncertain,{exact:true}).waitFor();
   await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'unknown result locks closing');
   await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});
   const writes=await page.evaluate(kind=>window.writes.filter(r=>r.kind===kind),kind);assert.deepEqual(writes[0],writes[1],'same request is retried');assert.equal(writes[1].rows[0].excluded,true);
   await icon.click();await dialog.getByRole('button',{name:'TARGET-001 '+t.included,exact:true}).waitFor();
   await dialog.getByRole('button',{name:'TARGET-001 '+t.included,exact:true}).click();
   if(['INVOICE','SHIPPING'].includes(kind))await dialog.getByLabel(t.reason,{exact:false}).fill('Resume workflow');
   await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(kind=>window.targets[kind].find(r=>r.id===1).excluded,kind),false);
  }
  await page.evaluate(()=>{window.failLoad=true;});await page.getByRole('button',{name:t.PAYABLE,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText(t.failed,{exact:true}).waitFor();await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.getByRole('button',{name:'TARGET-001 '+t.excluded,exact:true}).waitFor();await page.mouse.click(4,4);await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.goto(`http://127.0.0.1:${port}/management-target-test.html?lang=${lang}&detail=1`);await page.getByText('Test Worker',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox').count(),0,'the outside combined toggle is removed');
  await page.getByRole('button',{name:t.PAYABLE,exact:true}).waitFor();await page.getByRole('button',{name:t.EVIDENCE,exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Target settings: all four categories, ko/en/vi, desktop/mobile, move/save/restore, unknown-result retry, failed-read retry and payroll detail icons passed.');
}finally{await browser?.close();server.kill();for(const p of [file,entry])if(existsSync(p))unlinkSync(p);}
