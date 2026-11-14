import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/global-lookup-acceptance.html'),source=html.replace('.html','.jsx');
assert.ok(!existsSync(html)&&!existsSync(source));
writeFileSync(html,'<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/global-lookup-acceptance.jsx"></script>');
writeFileSync(source,`import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Stack,TextField,Dialog,DialogContent,Button} from '@mui/material';import theme from '/src/theme';import Select from '/src/components/SearchableSelect';import Scope from '/src/components/WorkspaceDialogScope';
const rows=[{id:1,code:'A',name:'Alpha'},{id:2,code:'AB',name:'Alpha Beta'},{id:3,code:'DUP',name:'First'},{id:4,code:'DUP',name:'Second'},{id:5,code:'BLOCK',name:'Blocked'},{id:6,code:'THES',name:'THE SAN'}];
function App(){const viewport=React.useRef(),[nested,setNested]=React.useState(false);const[value,setValue]=React.useState(null),[many,setMany]=React.useState([rows[4]]),[remote,setRemote]=React.useState(null),[query,setQuery]=React.useState(''),[created,setCreated]=React.useState(null);window.chosen=value;window.many=many;window.created=created;return <ThemeProvider theme={theme}><CssBaseline/><div ref={viewport} style={{height:'100vh'}}><Scope viewportRef={viewport}><Stack sx={{p:2,maxWidth:500}} spacing={2}>
<Select label="Partner" languageCode={new URLSearchParams(location.search).get('lang')} options={rows} value={value} getOptionLabel={row=>row.name} isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionDisabled={row=>row.id===5} onChange={(_,row)=>{window.changes=(window.changes||0)+1;setValue(row);}} autoSelect openOnFocus/>
<Select multiple chipsInside label="Types" options={rows} value={many} getOptionLabel={row=>row.name} isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionDisabled={row=>row.id===5} onChange={(_,rows)=>setMany(rows)}/>
<Select options={query.includes('Remote')?[{id:8,name:'Remote',code:'R'}]:[]} value={remote} inputValue={query} getOptionLabel={row=>row.name} onInputChange={(_,next)=>setQuery(next)} onChange={(_,row)=>setRemote(row)} renderInput={params=><TextField {...params} label="Remote" inputProps={{...params.inputProps,'data-domain-input':'remote'}}/>}/>
<Select label="Create" freeSolo options={['Existing']} getOptionLabel={row=>row} onChange={(_,row)=>setCreated(row)} renderInput={params=><TextField {...params} label="Create"/>}/>
<button id="next">Next</button><Button onClick={()=>setNested(true)}>Nested form</Button>{nested&&<Dialog open onClose={()=>setNested(false)}><DialogContent><Select label="Nested partner" options={rows} value={value} getOptionLabel={row=>row.name} onChange={(_,row)=>setValue(row)}/><TextField label="Nested next"/></DialogContent></Dialog>}</Stack></Scope></div></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
const port=43280,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/global-lookup-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
  await page.goto(`http://127.0.0.1:${port}/global-lookup-acceptance.html?lang=${lang}`);
  const field=page.getByRole('textbox',{name:'Partner',exact:true});await field.focus();assert.equal(await page.getByRole('option').count(),0);
  await field.fill('THE');await field.press('Enter');await page.getByRole('dialog').getByRole('button',{name:/^(선택|Select|Chọn)$/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Types');
  await field.press('Tab');await page.getByRole('textbox',{name:'Types',exact:true}).and(page.locator(':focus')).waitFor();
  await field.fill('');await field.press('Enter');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Partner');
  await page.evaluate(()=>{window.changes=0;});
  for(const key of ['Enter','Tab']){await field.fill('THE');await field.press(key);const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await page.evaluate(()=>window.chosen),null);assert.equal(await dialog.getByText('THE SAN',{exact:true}).count(),1);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
  await field.fill('');await field.pressSequentially('AB');assert.equal(await page.evaluate(()=>window.chosen),null);assert.equal(await field.inputValue(),'AB');await field.press('Tab');await page.waitForFunction(()=>window.chosen?.id===2);assert.equal(await page.evaluate(()=>window.changes),1);
  await field.focus();await field.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>window.changes),1);
  await field.fill('DUP');await field.press('Enter');await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>window.chosen),null);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await field.evaluate(el=>document.activeElement===el),true);
  await field.fill('BLOCK');await field.press('Tab');await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByRole('row').count(),2);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await field.fill('');await field.press('Shift+Tab');assert.equal(await page.getByRole('dialog').count(),0);
  await field.focus();await field.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(await page.getByRole('dialog').count(),0);
  await field.dispatchEvent('compositionstart');await field.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);await field.dispatchEvent('compositionend');
  await field.press('Tab');await page.getByRole('dialog').waitFor();await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  const many=page.getByRole('textbox',{name:'Types',exact:true});await many.fill('AB');await many.press('Enter');await page.waitForFunction(()=>window.many.length===2);assert.deepEqual(await page.evaluate(()=>window.many.map(row=>row.id)),[5,2]);
  await many.fill('THE');await many.press('Enter');await page.getByRole('dialog').getByRole('checkbox').check();await page.getByRole('dialog').getByRole('button',{name:/^(선택|Select|Chọn)$/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Remote');
  const remote=page.getByRole('textbox',{name:'Remote',exact:true});await remote.fill('Remote');await remote.press('Enter');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await remote.getAttribute('data-domain-input'),'remote');
  const create=page.getByRole('combobox',{name:'Create',exact:true});await create.fill('New item');await create.press('Enter');await page.waitForFunction(()=>window.created==='New item');
  await page.getByRole('button',{name:'Nested form',exact:true}).click();const nested=page.getByRole('textbox',{name:'Nested partner',exact:true});await nested.fill('THE');await nested.press('Enter');await page.locator('[data-lookup-dialog="true"]').getByRole('button',{name:'Select',exact:true}).click();await page.locator('[data-lookup-dialog="true"]').waitFor({state:'hidden'});await page.getByRole('textbox',{name:'Nested next',exact:true}).and(page.locator(':focus')).waitFor();assert.equal(await page.getByRole('textbox',{name:'Nested next',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.textContent==='Nested form');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Global lookup passed: ko/en/vi, prefix safety, one Tab commit, valid Enter, duplicates, disabled choices, IME, focus restoration, multiple selection, remote input, creation and mobile.');
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(source);}
