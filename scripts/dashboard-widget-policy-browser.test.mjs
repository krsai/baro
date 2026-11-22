import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const html='frontend/dashboard-widget-policy-test.html',jsx='frontend/dashboard-widget-policy-test.jsx',port=43529;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-widget-policy-test.jsx"></script></html>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Paper}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import{AppProvider}from'/src/context/AppContext';import Widgets from'/src/components/DashboardWidgets';import{widgetPolicyText}from'/src/components/DashboardWidgetPolicy';
const lang=new URLSearchParams(location.search).get('lang'),t=widgetPolicyText[lang];const widgets=['notifications','suspected-errors','work-requests','approvals'].map(id=>({id,label:t[id],content:<Paper>{t[id]}</Paper>}));createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><AppProvider><Widgets title="Dashboard" companyId={1} userId="member" languageCode={lang} widgets={widgets}/></AppProvider></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
const texts={ko:['위젯 선택','위젯 사용 설정','알림','운영','저장','닫기'],en:['Select widgets','Widget access','Notifications','Operator','Save','Close'],vi:['Chọn tiện ích','Quyền sử dụng tiện ích','Thông báo','Vận hành','Lưu','Đóng']};
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-widget-policy-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const [select,title,notifications,operator,save,close]=texts[lang],roles=Object.fromEntries(['notifications','suspected-errors','work-requests','approvals'].map(id=>[id,['ADMIN','ACCOUNTANT','OPERATOR','WORKER']]));
  let policy={revision:0,roles},writes=[],reads=0,role='ADMIN';const errors=[];
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const p={entryType:'ORG',orgType:'SERVICE',orgRole:'${role}',orgId:1,employeeId:1};export const useAuth=()=>({activeOrgId:1,activeProfile:p,accessProfile:p,isAuthenticated:true});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route(/\/dashboard\/widget-policy\?/,async r=>{
   const req=r.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   if(req.method()==='OPTIONS')return r.fulfill({status:204,headers});
   if(req.method()==='PUT'){const body=req.postDataJSON();writes.push(body);assert.equal(body.revision,policy.revision);policy={revision:policy.revision+1,roles:body.roles};return r.fulfill({headers,json:policy});}
   reads++;return r.fulfill({headers,json:{...policy,allowed:Object.keys(policy.roles).filter(id=>policy.roles[id].includes(role))}});
  });
  const url=`http://127.0.0.1:${port}/dashboard-widget-policy-test.html?lang=${lang}`;
  await page.goto(url);await page.locator('[data-dashboard-widget="notifications"]').waitFor();
  await page.getByRole('button',{name:select,exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.getByRole('group',{name:notifications,exact:true}).getByRole('checkbox',{name:operator,exact:true}).uncheck();
  assert.equal(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
  await dialog.getByRole('button',{name:save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes.length,1);assert.equal(policy.roles.notifications.includes('OPERATOR'),false);
  const updated=page.waitForResponse(r=>r.url().includes('/dashboard/widget-policy?')&&r.request().method()==='GET');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await updated;
  const previousReads=reads;await page.getByRole('button',{name:select,exact:true}).click();await page.keyboard.press('Escape');assert.equal(reads,previousReads,'closing unchanged selection does not reload policy');
  role='OPERATOR';await page.reload();await page.locator('[data-dashboard-widget="work-requests"]').waitFor();assert.equal(await page.locator('[data-dashboard-widget="notifications"]').count(),0);
  await page.getByRole('button',{name:select,exact:true}).click();assert.equal(await page.getByRole('button',{name:title,exact:true}).count(),0);assert.equal(await page.getByRole('checkbox',{name:notifications,exact:true}).count(),0);
  assert.deepEqual(errors,[]);await page.close();console.log('widget policy browser passed',lang,width);
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
