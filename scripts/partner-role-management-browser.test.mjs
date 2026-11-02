import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/partner-role-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Page from'/src/pages/App/ExpenseMasterSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(Page)));</script></body></html>`);
const port=43359,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/partner-role-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:null});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAppActions=()=>({setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});`}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';let active=true;const listeners=new Set();window.setTestTabActive=value=>{active=value;listeners.forEach(fn=>fn());};export const useRequestScopeContext=()=>({active:React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>active)});`}));
  let roles=[{id:1,code:'CUSTOMER',nameEn:'Customer',nameKo:'Customer',nameVi:'Customer'}],sources=[],rejectDelete=false,industryDeletes=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/system-setting-defaults/**',r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(['POST','PUT'].includes(req.method())&&url.pathname.includes('/services')){
    const body=req.postDataJSON();assert.equal('code' in body,false);
    if(req.method()==='POST')sources.push({id:20,code:'TYPE_internal',...body,hasUsageHistory:false});else Object.assign(sources.find(row=>row.id===20),body);
    return r.fulfill({headers,json:{ok:true}});
   }
   if(req.method()==='DELETE'&&url.pathname.includes('/services/')){
    industryDeletes++;if(rejectDelete){rejectDelete=false;sources[0].hasUsageHistory=true;return r.fulfill({headers,status:409,json:{error:'SETTING_IN_USE'}});}
    sources=sources.filter(row=>row.id!==Number(url.pathname.split('/').pop()));return r.fulfill({headers,json:{ok:true}});
   }
   if(req.method()==='POST'){assert.equal('code' in req.postDataJSON(),false);roles.push({id:2,code:'ROLE_internal',...req.postDataJSON()});return r.fulfill({headers,status:201,json:roles[1]});}
   if(req.method()==='PUT'){assert.equal('code' in req.postDataJSON(),false);Object.assign(roles[1],req.postDataJSON());return r.fulfill({headers,json:roles[1]});}
   if(req.method()==='DELETE'){roles=roles.filter(row=>row.id!==2);return r.fulfill({headers,json:{ok:true}});}
   return r.fulfill({headers,json:url.pathname.endsWith('partner-roles')?roles:sources});
  });
  await page.goto(`http://127.0.0.1:${port}/partner-role-acceptance.html`);
  await page.getByText({ko:'거래 구분 > 세부 유형 > 회계 코드',en:'Transaction category > Subtype > Accounting code',vi:'Nhóm giao dịch > Loại chi tiết > Mã kế toán'}[lang],{exact:true}).waitFor();
  await page.getByRole('navigation',{name:{ko:'거래 구분',en:'Transaction category',vi:'Nhóm giao dịch'}[lang]}).waitFor();
  await page.getByRole('button',{name:{ko:'거래 구분 등록',en:'Add transaction category',vi:'Thêm nhóm giao dịch'}[lang],exact:true}).click();
  let dialog=page.getByRole('dialog');const inputs=dialog.locator('input');
  assert.equal(await inputs.count(),3);
  await inputs.nth(0).fill('Custom');await inputs.nth(1).fill('Custom');await inputs.nth(2).fill('Custom');
  await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation').getByRole('button',{name:'Custom 0',exact:true}).click();
  await page.getByRole('button',{name:{ko:'거래 구분 수정',en:'Edit transaction category',vi:'Sửa nhóm giao dịch'}[lang],exact:true}).click();
  dialog=page.getByRole('dialog');assert.equal(await dialog.locator('input').count(),3);
  for(let i=0;i<3;i++)await dialog.locator('input').nth(i).fill('Renamed');
  await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation').getByRole('button',{name:'Renamed 0',exact:true}).waitFor();
  await page.getByRole('button',{name:{ko:'삭제',en:'Delete',vi:'Xóa'}[lang],exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:{ko:'삭제',en:'Delete',vi:'Xóa'}[lang],exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('navigation').getByRole('button',{name:'Customer 0',exact:true}).waitFor();assert.equal(roles.length,1);
  await page.getByRole('button',{name:{ko:'세부 유형 등록',en:'Add subtype',vi:'Thêm loại chi tiết'}[lang],exact:true}).click();
  dialog=page.getByRole('dialog');assert.equal(await dialog.locator('input:not([aria-hidden="true"])').count(),3);
  for(let i=0;i<3;i++)await dialog.locator('input:not([aria-hidden="true"])').nth(i).fill('Subtype');
  await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  const subtypeRow=page.getByRole('row').filter({has:page.getByRole('cell',{name:'Subtype',exact:true})});await subtypeRow.waitFor();assert.equal(await page.getByRole('cell',{name:'TYPE_internal',exact:true}).count(),0);
  await subtypeRow.getByRole('button',{name:{ko:'수정',en:'Edit',vi:'Sửa'}[lang],exact:true}).click();dialog=page.getByRole('dialog');
  assert.equal(await dialog.locator('input:not([aria-hidden="true"]):not([type="checkbox"])').count(),3);
  await dialog.locator('input:not([aria-hidden="true"]):not([type="checkbox"])').first().fill('Renamed subtype');await dialog.locator('button').last().click();await dialog.waitFor({state:'hidden'});
  const removeName={ko:'삭제',en:'Delete',vi:'Xóa'}[lang];
  sources=[{id:10,code:'UNUSED',nameEn:'Unused',nameKo:'Unused',nameVi:'Unused',partnerRoleId:1,isActive:true,hasUsageHistory:false},{id:11,code:'USED',nameEn:'Used',nameKo:'Used',nameVi:'Used',partnerRoleId:1,isActive:true,hasUsageHistory:true,_count:{customerIndustries:1},services:[]},{id:12,code:'UNKNOWN',nameEn:'Unknown',nameKo:'Unknown',nameVi:'Unknown',partnerRoleId:1,isActive:true}];
  await page.reload();const unused=page.getByRole('row').filter({has:page.getByRole('cell',{name:'Unused',exact:true})});
  await unused.waitFor();assert.equal(await unused.getByRole('button',{name:removeName,exact:true}).isEnabled(),true);
  for(const code of ['Used','Unknown'])assert.equal(await page.getByRole('row').filter({has:page.getByRole('cell',{name:code,exact:true})}).getByRole('button',{name:removeName,exact:true}).isDisabled(),true);
  const used=page.getByRole('row').filter({has:page.getByRole('cell',{name:'Used',exact:true})});
  await used.getByRole('button',{name:removeName,exact:true}).locator('..').hover();
  await page.getByRole('tooltip').filter({hasText:{ko:'기존 고객 유형 연결 (1)',en:'Legacy customer type links (1)',vi:'Liên kết loại khách hàng cũ (1)'}[lang]}).waitFor();
  sources[1].hasUsageHistory=false;sources[1]._count.customerIndustries=0;
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{topics:['customers'],orgId:1}})));
  await page.waitForFunction(label=>!Array.from(document.querySelectorAll('tbody tr')).find(row=>row.textContent.includes('Used')&&!row.textContent.includes('Unused'))?.querySelector('button[aria-label="'+label+'"]')?.disabled,removeName);
  await page.evaluate(()=>window.setTestTabActive(false));sources[1].hasUsageHistory=true;sources[1]._count.customerIndustries=1;
  await page.evaluate(()=>window.setTestTabActive(true));
  await page.waitForFunction(label=>Array.from(document.querySelectorAll('tbody tr')).find(row=>row.textContent.includes('Used')&&!row.textContent.includes('Unused'))?.querySelector('button[aria-label="'+label+'"]')?.disabled,removeName);
  rejectDelete=true;await unused.getByRole('button',{name:removeName,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:removeName,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('[role=alert]'));await page.waitForFunction(label=>Array.from(document.querySelectorAll('tbody tr')).find(row=>row.textContent.includes('Unused'))?.querySelector('button[aria-label="'+label+'"]')?.disabled,removeName);
  sources[0].hasUsageHistory=false;await page.reload();await unused.getByRole('button',{name:removeName,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:removeName,exact:true}).click();await unused.waitFor({state:'hidden'});assert.equal(industryDeletes,2);assert.equal(sources.length,2);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Partner categories: create, edit, delete and mobile layout pass in ko/en/vi.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
