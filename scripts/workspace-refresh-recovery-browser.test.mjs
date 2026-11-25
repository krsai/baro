import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/refresh-recovery-test.html',jsx='frontend/refresh-recovery-test.jsx',port=43581;
for(const file of [html,jsx])assert.ok(!existsSync(file));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/refresh-recovery-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useNavigate,useLocation}from'react-router-dom';import{ThemeProvider,Button,TextField}from'@mui/material';import{createAppTheme}from'/src/theme';import useRefresh from'/src/hooks/useWorkspaceRefreshOnEvent';import useReference from'/src/hooks/useReferenceSettingsRefresh';import useHolidayCalendar from'/src/hooks/useHolidayCalendar';import{emitWorkspaceDataChanged}from'/src/utils/workspaceDataEvents';
window.testReact=React;window.reads=0;window.refReads=0;window.holidayReads=0;window.holidayValue=['2026-01-01'];window.marked=0;window.cleared=0;
function App(){const[draft,setDraft]=React.useState(''),[busy,setBusy]=React.useState(false),[org,setOrg]=React.useState(1);const navigate=useNavigate();window.route=useLocation().pathname;window.busy=busy;window.org=org;
window.emit=(target=org)=>emitWorkspaceDataChanged({orgId:target,topics:['orders']});window.emitHoliday=()=>emitWorkspaceDataChanged({orgId:org,topics:['holidays']});window.emitReference=()=>emitWorkspaceDataChanged({orgId:0,topics:['accounting-codes']});
useRefresh({orgId:org,topics:['orders'],isBlocked:!!draft||busy,onRefresh:async()=>{window.reads++;if(window.blocksDuringRead){setBusy(true);await new Promise(resolve=>setTimeout(resolve,20));setBusy(false);}if(window.hold)await new Promise(resolve=>window.release=resolve);if(window.fail==='throw')throw Error('load failed');return window.fail!=='false';}});
const {holidayKeys}=useHolidayCalendar(org,{isBlocked:()=>!!draft||busy});window.holidays=holidayKeys;
useReference({blocked:!!draft||busy,onRefresh:async()=>{window.refReads++;if(window.refFail)throw Error('reference failed');}});
return <ThemeProvider theme={createAppTheme(new URLSearchParams(location.search).get('theme'))}><TextField label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><Button onClick={()=>setDraft('')}>Clear</Button><Button onClick={()=>setBusy(v=>!v)}>Busy</Button><Button onClick={()=>navigate('/other')}>Other</Button><Button onClick={()=>navigate('/rows')}>Back</Button><Button onClick={()=>setOrg(v=>v===1?2:1)}>Company</Button></ThemeProvider>;}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/rows']}><App/></MemoryRouter>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/refresh-recovery-test.html`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Vite started');
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const theme of ['standard','compact'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,locale:lang}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={markTabChanged:()=>window.marked++,clearTabChanged:()=>window.cleared++};export const useAppActions=()=>a;'}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useRequestScopeContext=()=>({active:true});'}));
  await page.route('**/src/utils/holidayApi.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const normalizeHolidayList=rows=>rows;export const fetchHolidayKeys=async()=>{window.holidayReads++;return [...window.holidayValue];};'}));
  await page.goto(`http://127.0.0.1:${port}/refresh-recovery-test.html?lang=${lang}&theme=${theme}`);await page.getByLabel('Draft').waitFor();
  const press=async name=>width===390?page.getByRole('button',{name,exact:true}).tap():page.getByRole('button',{name,exact:true}).click();
  await page.evaluate(()=>window.emit(2));assert.equal(await page.evaluate(()=>window.reads),0);
  await page.getByLabel('Draft').fill('Keep Unsaved');await page.evaluate(()=>{window.emit();window.emit();});assert.equal(await page.evaluate(()=>window.reads),0);
  await press('Clear');await page.waitForFunction(()=>window.reads===1);assert.equal(await page.getByLabel('Draft').inputValue(),'');
  await press('Busy');await page.waitForFunction(()=>window.busy);await page.evaluate(()=>window.emit());assert.equal(await page.evaluate(()=>window.reads),1);await press('Busy');await page.waitForFunction(()=>window.reads===2);
  await press('Other');await page.waitForFunction(()=>window.route==='/other');await page.evaluate(()=>window.emit());assert.equal(await page.evaluate(()=>window.reads),2);await press('Back');await page.waitForFunction(()=>window.reads===3);
  for(const failure of ['throw','false']){
   const before=await page.evaluate(()=>({reads:window.reads,cleared:window.cleared}));await page.evaluate(f=>{window.fail=f;window.blocksDuringRead=true;window.emit();},failure);await page.waitForFunction(n=>window.reads===n,before.reads+1);
   await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.cleared),before.cleared);assert.equal(await page.evaluate(()=>window.reads),before.reads+1,'failure never loops');
   await page.evaluate(()=>{window.fail=null;window.blocksDuringRead=false;window.dispatchEvent(new Event('focus'));});await page.waitForFunction(n=>window.reads===n,before.reads+2);
  }
  const before=await page.evaluate(()=>window.reads);await page.evaluate(()=>{window.hold=true;window.emit();});await page.waitForFunction(()=>!!window.release);await page.evaluate(()=>{window.emit();window.emit();window.hold=false;window.release();window.release=null;});await page.waitForFunction(n=>window.reads===n,before+2);
  await press('Busy');await page.evaluate(()=>window.emit());await press('Company');await page.waitForFunction(()=>window.org===2);await press('Busy');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.reads),before+2,'old company pending event discarded');
  await page.evaluate(()=>{window.refFail=true;window.emitReference();});await page.waitForFunction(()=>window.refReads===1);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.refReads),1);
  await page.evaluate(()=>{window.refFail=false;window.dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>window.refReads===2);
  const idle=await page.evaluate(()=>window.reads);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.reads),idle);
  await page.getByLabel('Draft').fill('Protect Calendar');const holidayBefore=await page.evaluate(()=>window.holidayReads);await page.evaluate(()=>{window.holidayValue=['2026-02-01'];window.emitHoliday();});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.holidayReads),holidayBefore);assert.deepEqual(await page.evaluate(()=>window.holidays),['2026-01-01']);await press('Clear');await page.waitForFunction(()=>window.holidays[0]==='2026-02-01');
  assert.deepEqual(errors,[]);console.log('PASS refresh recovery',lang,theme,width);await context.close();
 }
}finally{await browser?.close();vite.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
