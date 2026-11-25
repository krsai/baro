import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/payroll-refresh-test.html',jsx='frontend/payroll-refresh-test.jsx',port=43582;
for(const file of [html,jsx])assert.ok(!existsSync(file));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/payroll-refresh-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import{createAppTheme}from'/src/theme';import Page from'/src/pages/App/payroll/PayrollBoard';function App(){const[notice,setNotice]=React.useState(null);window.setNotice=setNotice;return <ThemeProvider theme={createAppTheme(new URLSearchParams(location.search).get('theme'))}><CssBaseline/><MemoryRouter><Page/></MemoryRouter>{notice&&<div role="alert">{notice.children}{notice.action}</div>}</ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/payroll-refresh-test.html`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const theme of ['standard','compact'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:950},hasTouch:width===390}),page=await context.newPage();let failed='',reads=0,writes=0;const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export const LanguageContext=React.createContext({languageCode:'${lang}'});export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{},actions={navigateToPath:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:()=>window.marked=true,clearTabChanged:()=>window.marked=false,showNotification:(children,severity,options)=>{window.setNotice({children,action:options?.action});},removeNotification:()=>window.setNotice(null)};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/employees?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/payroll/**',r=>{
   const path=new URL(r.request().url()).pathname;if(!path.startsWith('/payroll/'))return r.fallback();
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()!=='GET'){writes++;return r.fulfill({headers,status:500,json:{error:'unexpected'}});}
   reads++;if(failed&&path.endsWith('/'+failed))return r.fulfill({headers,status:503,json:{error:'Refresh unavailable'}});
   if(path.endsWith('/snapshots'))return r.fulfill({headers,json:[{month:'2026-08',factoryId:1,data:[],isProvisional:true,payableDocument:{managementNumber:'PAY-KEEP-001'}}]});
   if(path.endsWith('/calendar'))return r.fulfill({headers,json:{latestCompletedMonthKey:'2026-08',availableMonthKeys:['2026-08'],factories:[{id:1,name:'Factory',managementStartDateKey:'2024-01-01'}]}});
   return r.fulfill({headers,json:{ready:true,completedMonth:true,hasAttendanceData:true,hasWorkData:true,groups:[]}});
  });
  await page.goto(`http://127.0.0.1:${port}/payroll-refresh-test.html?theme=${theme}`);const row=page.locator('tbody tr').filter({hasText:'PAY-KEEP-001'});try{await row.waitFor();}catch(error){console.error(await page.locator('body').innerText());throw error;}
  const trigger=()=>page.evaluate(async()=>{const{emitWorkspaceDataChanged}=await import('/src/utils/workspaceDataEvents.js');emitWorkspaceDataChanged({orgId:1,topics:['payroll-sources']});});
  for(const source of ['snapshots','readiness']){
   failed=source;await trigger();const alert=page.getByRole('alert');await alert.getByRole('button').waitFor();assert.match(await alert.textContent(),/최근 성공|Last Success|Lần Thành Công/);await row.waitFor();
   assert.equal(await page.evaluate(()=>window.marked),true);const stopped=reads;await page.waitForTimeout(300);assert.equal(reads,stopped,'failed refresh stops');
   failed='';if(width===390)await alert.getByRole('button').tap();else{await alert.getByRole('button').focus();await page.keyboard.press('Enter');}
   await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));await row.waitFor();
  }
  assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS payroll refresh preserves rows, shows timestamp and retries',lang,theme,width);await context.close();
 }
}finally{await browser?.close();vite.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
