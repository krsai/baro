import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/reference-refresh-test.html',jsx='frontend/reference-refresh-test.jsx',port=43492;
for(const path of [html,jsx])assert.ok(!existsSync(path));
writeFileSync(html,'<meta charset="utf-8"><div id="root"></div><script type="module" src="/reference-refresh-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Codes from'/src/pages/App/AccountingCodeSettings';import Industries from'/src/pages/App/ExpenseMasterSettings';import{RequestScopeBoundary}from'/src/context/RequestScopeContext';import{requestJSON}from'/src/utils/apiClient';import{emitWorkspaceDataChanged}from'/src/utils/workspaceDataEvents';window.remoteChange=()=>emitWorkspaceDataChanged({topics:['partner-classifications','accounting-codes'],source:'server-change'});window.mutate=path=>requestJSON(path,{method:'PUT',body:JSON.stringify({nameEn:'Changed'})});function App(){const[tab,setTab]=React.useState('industries');return <ThemeProvider theme={theme}><CssBaseline/><button onClick={()=>setTab('codes')}>Codes tab</button><button onClick={()=>setTab('industries')}>Industries tab</button><section data-page="codes" style={{display:tab==='codes'?'block':'none'}}><RequestScopeBoundary active={tab==='codes'}><Codes/></RequestScopeBoundary></section><section data-page="industries" style={{display:tab==='industries'?'block':'none'}}><RequestScopeBoundary active={tab==='industries'}><Industries/></RequestScopeBoundary></section></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/reference-refresh-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:null});'}));
  let codeReads=0,industryReads=0,revision=0;
  const role={id:1,code:'SUPPLIER',nameKo:'CATEGORY',nameEn:'CATEGORY',nameVi:'CATEGORY'},source=()=>({id:10,code:'SUBTYPE',partnerRoleId:1,partnerRole:role,nameKo:'SUBTYPE-'+revision,nameEn:'SUBTYPE-'+revision,nameVi:'SUBTYPE-'+revision,isActive:true,hasUsageHistory:revision===0,_count:{partnerClassifications:revision===0?1:0},services:[]});
  const settingsRoute=r=>{
   const req=r.request(),path=new URL(req.url()).pathname,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()!=='GET'){revision++;return r.fulfill({headers,json:{ok:true}});}
   if(path.endsWith('/code-bases')){codeReads++;return r.fulfill({headers,json:[{id:7,code:'ABC',nameKo:'BASE-'+revision,nameEn:'BASE-'+revision,nameVi:'BASE-'+revision,industryIds:[10],industries:[source()],industryRevision:1,entryMode:'GENERAL',requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',isActive:true,hasUsageHistory:false}]});}
   if(path.endsWith('/services')){industryReads++;return r.fulfill({headers,json:[source()]});}
   return r.fulfill({headers,json:[role]});
  };await page.route('**/system-setting-defaults/**',settingsRoute);await page.route('**/partner-editor/**',settingsRoute);
  await page.goto(`http://127.0.0.1:${port}/reference-refresh-test.html`);const initiallyUsed=page.getByRole('row').filter({hasText:'SUBTYPE-0'});await initiallyUsed.waitFor();assert.equal(await initiallyUsed.locator('[data-table-action=delete]').isDisabled(),true);
  await page.getByRole('button',{name:'Codes tab',exact:true}).click();await page.getByRole('cell',{name:'BASE-0',exact:true}).waitFor();
  const before=codeReads;await page.evaluate(()=>window.mutate('/system-setting-defaults/services/10'));await page.getByRole('cell',{name:'BASE-1',exact:true}).waitFor();assert.ok(codeReads>before,'industry save refreshes accounting tree and rows');
  await page.getByRole('button',{name:'Industries tab',exact:true}).click();await page.getByRole('cell',{name:'SUBTYPE-1',exact:true}).waitFor();assert.equal(await page.getByRole('row').filter({hasText:'SUBTYPE-1'}).locator('[data-table-action=delete]').isDisabled(),false,'usage removal enables deletion after settings refresh');const hiddenReads=codeReads;
  await page.evaluate(()=>window.mutate('/system-setting-defaults/code-bases/7'));await page.getByRole('cell',{name:'SUBTYPE-2',exact:true}).waitFor();assert.equal(codeReads,hiddenReads,'inactive accounting tab defers reads');
  await page.getByRole('button',{name:'Codes tab',exact:true}).click();await page.getByRole('cell',{name:'BASE-2',exact:true}).waitFor();
  const edit={ko:'수정',en:'Edit',vi:'Sửa'}[lang];await page.getByRole('button',{name:edit,exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  const input=dialog.getByRole('textbox').first();await input.fill('XYZ');const draftReads=codeReads;
  await page.evaluate(()=>window.mutate('/system-setting-defaults/services/10'));await page.waitForTimeout(100);assert.equal(codeReads,draftReads,'open editor defers reference refresh');assert.equal(await input.inputValue(),'XYZ');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.getByRole('cell',{name:'BASE-3',exact:true}).waitFor();
  const remoteBefore=codeReads;revision++;await page.evaluate(()=>window.remoteChange());await page.getByRole('cell',{name:'BASE-4',exact:true}).waitFor();assert.ok(codeReads>remoteBefore);await page.evaluate(()=>window.mutate('/partner-editor/entity/9/contacts'));await page.getByRole('cell',{name:'BASE-5',exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS reference settings: ko/en/vi reciprocal mutation refresh, inactive deferral, editor preservation and server notices.');
}finally{await browser?.close();vite.kill();for(const path of [html,jsx])if(existsSync(path))unlinkSync(path);}
