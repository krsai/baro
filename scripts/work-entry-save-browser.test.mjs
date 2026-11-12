import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html='frontend/work-entry-save-test.html',jsx='frontend/work-entry-save-test.jsx',port=43385;
for(const file of [html,jsx])assert.ok(!existsSync(file));
writeFileSync(html,'<div id="root"></div><script type="module" src="/work-entry-save-test.jsx"></script>');
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {AppProvider,useAppActions} from '/src/context/AppContext.jsx';import Entry from '/src/pages/App/work/WorkEntry';
const kind=new URLSearchParams(location.search).get('kind'),base=kind==='OUTSOURCING'?'/outsourcing-record':'/work-history';window.moves=[];
function Harness(){const actions=useAppActions();React.useEffect(()=>actions.setNavigateToPath((path,options)=>{if(!options?.skipUnsavedChangesCheck&&!actions.confirmDiscardUnsavedChanges())return;window.moves.push(path);}),[actions]);return <Entry recordKind={kind}/>;}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[base+'/new']}><AppProvider><Harness/></AppProvider></MemoryRouter>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/work-entry-save-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const kind of ['EMPLOYEE','OUTSOURCING']){
  const page=await browser.newPage(),errors=[];let prompts=0;page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
  const stub=(pattern,body)=>page.route(pattern,route=>route.fulfill({contentType:'application/javascript',body}));
  await stub('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1});');
  await stub('**/src/context/LanguageContext.jsx*','export const useLanguage=()=>({languageCode:"en"});');
  await stub('**/src/pages/App/work/workLogStorage.js*',`export const appendWorkLog=async payload=>{window.saveCalls=(window.saveCalls||0)+1;return new Promise((resolve,reject)=>{window.finishSave=result=>result==='FAIL'?reject(Error('Save failed')):result==='REVIEW'?reject(Object.assign(Error('Review needed'),{details:{quantityReviewItems:[{key:'review'}]}})):resolve(result);});};export const findWorkLogById=async()=>null;export const updateWorkLog=async()=>null;`);
  await stub('**/src/pages/App/work/WorkDetail.jsx*',`import React from '/node_modules/.vite/deps/react.js';import useUnsaved from '/src/hooks/useUnsavedChanges.js';import {useAppActions} from '/src/context/AppContext.jsx';export default function Detail({onSave,saving}){const[draft,setDraft]=React.useState('');useUnsaved(Boolean(draft));const a=useAppActions();return React.createElement('div',{},React.createElement('input',{'aria-label':'Draft',value:draft,onChange:e=>setDraft(e.target.value)}),React.createElement('button',{disabled:saving,onClick:()=>onSave({workDate:'2026-11-03',note:draft})},'Save'),React.createElement('button',{onClick:()=>a.navigateToPath('/work-history')},'Leave'));}`);
  await page.goto(`http://127.0.0.1:${port}/work-entry-save-test.html?kind=${kind}`);
  const draft=page.getByRole('textbox',{name:'Draft'}),save=page.getByRole('button',{name:'Save',exact:true});await draft.fill('Keep these work rows');
  await page.getByRole('button',{name:'Leave'}).click();assert.equal(prompts,1);assert.deepEqual(await page.evaluate(()=>window.moves),[]);
  for(const response of ['FAIL',{},'REVIEW']){
   await save.click();await page.waitForFunction(()=>typeof window.finishSave==='function');assert.deepEqual(await page.evaluate(()=>window.moves),[]);
   await page.evaluate(response=>{window.finishSave(response);delete window.finishSave;},response);await save.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('button').disabled);
   assert.equal(await draft.inputValue(),'Keep these work rows');assert.deepEqual(await page.evaluate(()=>window.moves),[]);assert.equal(prompts,1);
  }
  await page.getByRole('button',{name:'Leave'}).click();assert.equal(prompts,2,'failed/unconfirmed saves retain the dirty guard');
  await save.click();await page.waitForFunction(()=>typeof window.finishSave==='function');await page.evaluate(()=>window.finishSave({id:'saved-123'}));
  await page.waitForFunction(()=>window.moves.length===1);assert.deepEqual(await page.evaluate(()=>window.moves),[(kind==='OUTSOURCING'?'/outsourcing-record':'/work-history')+'/saved-123']);assert.equal(prompts,2,'confirmed save must not prompt to discard');assert.equal(await page.evaluate(()=>window.saveCalls),4);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Work entry saves passed: employee/outsourcing, confirmed navigation without discard prompt, pending/failed/missing-ID draft protection and retry.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
