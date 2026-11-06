import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {employeeLeaveText} from '../frontend/src/constants/employeeLeave.js';
const html='frontend/holiday-leave-test.html',jsx='frontend/holiday-leave-test.jsx';
writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/holiday-leave-test.jsx"></script>');
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/Holiday';createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider theme={theme}><CssBaseline/><Page/></ThemeProvider></MemoryRouter>);`);
const port=43295,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const mock=(pattern,body)=>page.route(pattern,route=>route.fulfill({contentType:'application/javascript',body}));
  await mock('**/src/context/LanguageContext.jsx*',`export const useLanguage=()=>({languageCode:'${lang}'});`);
  await mock('**/src/context/AuthContext.jsx*','export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN"});');
  await mock('**/src/context/AppContext.jsx*','const actions={showNotification:(message)=>{window.notice=message;}};export const useAppActions=()=>actions;');
  await mock('**/src/hooks/useUnsavedChanges*','export default ()=>{};');
  await mock('**/src/utils/apiClient.js*',`export const buildQueryString=o=>'?' + new URLSearchParams(Object.entries(o).filter(([,v])=>v!==undefined));let holidays=[{holidayDate:'2026-11-02',isPaid:true}];const employees=[{id:1,name:'Worker',employeeNo:'W001'}];const balance=()=>({year:2026,granted:12,used:1,remaining:11,grants:[],leaves:[{id:'leave-1',leaveDate:'2026-11-04',kind:'ANNUAL',reason:'Vacation',counted:true}]});export async function requestJSON(url,options={}){if(url.startsWith('/holidays')){if(options.method==='PUT'){window.holidayPayload=JSON.parse(options.body);holidays=window.holidayPayload.holidayDetails;}return holidays;}if(url.startsWith('/employee-leaves'))return {employees,balance:url.includes('employeeId=1')?balance():null};if(url.includes('/leaves')||url.includes('/leave-grants')){window.leavePayload={url,...JSON.parse(options.body)};return balance();}throw Error(url);}`);
  await page.addInitScript(language=>localStorage.setItem('baro_language_override',language),lang);
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}?lang=${lang}`,{timeout:45000});
  const paid={ko:'유급 휴무',en:'Paid holiday',vi:'Nghỉ có lương'}[lang],unpaid={ko:'무급 휴무',en:'Unpaid holiday',vi:'Nghỉ không lương'}[lang],save={ko:'저장',en:'Save',vi:'Luu'}[lang];
  await page.getByText(new RegExp(paid+' ·')).first().click();await page.getByRole('combobox').click();await page.getByRole('option',{name:unpaid,exact:true}).click();await page.getByRole('button',{name:save,exact:true}).click();await page.waitForFunction(()=>window.holidayPayload?.holidayDetails[0].isPaid===false);
  const t=employeeLeaveText[lang];await page.getByRole('tab',{name:t.title,exact:true}).click();const picker=page.getByRole('textbox',{name:t.employee,exact:true});await picker.fill('W001');await picker.press('Enter');await page.getByText(t.remaining+': 11',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:t.reason,exact:true}).first().fill('Personal leave');await page.getByRole('combobox').filter({visible:true}).first().click();await page.getByRole('option',{name:t.UNPAID,exact:true}).click();await page.getByRole('button',{name:t.record,exact:true}).click();await page.waitForFunction(()=>window.leavePayload?.kind==='UNPAID');
  await page.getByRole('spinbutton',{name:t.days,exact:true}).fill('2');await page.getByRole('textbox',{name:t.reason,exact:true}).last().fill('Additional allocation');await page.getByRole('button',{name:t.grant,exact:true}).click();await page.waitForFunction(()=>window.leavePayload?.days===2);assert.equal(await page.evaluate(()=>window.leavePayload.url.includes('/leave-grants')),true);
  await page.getByRole('button',{name:t.cancel,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('textbox').fill('Correction');await dialog.getByRole('button',{name:t.cancel,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.leavePayload.url.includes('/cancel')),true);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Holiday/leave UI: ko/en/vi paid default and unpaid save, employee lookup, leave, annual grant, cancellation and mobile passed.');
}finally{await browser?.close();server.kill();for(const file of[html,jsx])if(existsSync(file))unlinkSync(file);}
