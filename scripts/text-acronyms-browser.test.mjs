import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {textAcronymText} from '../frontend/src/constants/textAcronyms.js';
const fixture=path.resolve('frontend/text-acronyms-acceptance.html'),port=43461;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,TextField}from'@mui/material';import theme from'/src/theme';import Gate from'/src/components/TextAcronymGate';import Dictionary from'/src/pages/App/system/SystemTextAcronyms';import{emitWorkspaceDataChanged}from'/src/utils/workspaceDataEvents';window.notices=[];window.remoteDictionary=()=>emitWorkspaceDataChanged({topics:['text-acronyms'],source:'server-change'});function Live(){const[value,setValue]=React.useState('');return React.createElement(TextField,{label:'Live Text',name:'remark',value,onChange:e=>setValue(e.target.value)});}createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(MemoryRouter,null,React.createElement(Gate,null,React.createElement(Dictionary),React.createElement(Live)))));
</script></body></html>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/text-acronyms-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:(message,severity)=>window.notices.push({message,severity}),removeNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  await page.route('**/src/lib/supabaseClient.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const supabase={auth:{getSession:async()=>({data:{session:null}})}};'}));
  let value={revision:0,entries:[{acronym:'BOM',expansion:'Bill Of Materials',meaning:'자재 명세서'},{acronym:'iOS',expansion:'',meaning:''}]},writes=0,publicReads=0,failLoad=lang==='en'&&width===1440;
  await page.route('**/*text-acronyms',async r=>{
   const req=r.request(),url=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
   if(req.method()==='GET'){
    if(url.pathname==='/text-acronyms'){publicReads++;if(failLoad){failLoad=false;return r.fulfill({status:503,headers,json:{error:'FAILED'}});}}
    return r.fulfill({headers,json:value});
   }
   writes++;const body=req.postDataJSON();assert.equal(body.entries.find(row=>row.acronym==='eSIM').expansion,'');
   if(writes===1)return r.fulfill({status:409,headers,json:{error:'TEXT_ACRONYMS_CHANGED'}});
   value={revision:1,entries:body.entries};return r.fulfill({headers,json:value});
  });
  await page.goto(`http://127.0.0.1:${port}/text-acronyms-acceptance.html`);
  if(lang==='en'&&width===1440){await page.getByRole('button',{name:'Retry',exact:true}).click();}
  const t=textAcronymText[lang];await page.getByRole('button',{name:t.add,exact:true}).click();
  const acronym=page.getByRole('textbox',{name:new RegExp('^'+t.acronym)}),expansion=page.getByLabel(t.expansion,{exact:true});
  await acronym.fill('eSIM');await acronym.press('Tab');assert.equal(await acronym.inputValue(),'eSIM');assert.equal(await expansion.inputValue(),'');
  await page.getByLabel(t.meaning,{exact:true}).fill('사용자 약어');
  const save=page.getByRole('button',{name:t.save,exact:true});await save.click();await page.waitForFunction(()=>window.notices.some(n=>n.severity==='error'));
  assert.equal(await acronym.inputValue(),'eSIM');assert.equal(await page.getByLabel(t.meaning,{exact:true}).inputValue(),'사용자 약어');assert.equal(writes,1);
  await save.click();await page.waitForFunction(()=>window.notices.some(n=>n.severity==='success'));assert.equal(writes,2);assert.equal(await save.isDisabled(),true);
  const live=page.getByLabel('Live Text',{exact:true});await live.fill('eSIM ESIM esim Esim BOM bom COTTON');await live.press('Tab');assert.equal(await live.inputValue(),'eSIM eSIM Esim Esim BOM Bom Cotton');
  await expansion.fill('embedded SIM');await expansion.press('Tab');assert.equal(await expansion.inputValue(),'embedded SIM');
  const before=publicReads;value={...value,revision:2,entries:[...value.entries,{acronym:'eGPU',expansion:'',meaning:''}]};await page.evaluate(()=>window.remoteDictionary());await page.waitForFunction(()=>true);await page.waitForTimeout(100);assert.ok(publicReads>before);assert.equal(await expansion.inputValue(),'embedded SIM');
  await live.fill('eGPU egpu');await live.press('Tab');assert.equal(await live.inputValue(),'eGPU Egpu');
  assert.deepEqual(errors,[]);console.log(`PASS acronym dictionary ${lang} ${width}: blank expansion, conflict draft, save, mixed case, remote refresh without draft overwrite`);await page.close();
 }
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
