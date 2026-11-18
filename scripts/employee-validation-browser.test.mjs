import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/employee-validation-acceptance.html'),port=43494;
assert.ok(!existsSync(html));
writeFileSync(html,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import{LanguageProvider}from'/src/context/LanguageContext';import{AppProvider}from'/src/context/AppContext';import Page from'/src/pages/App/employee/EmployeeBoard';createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(LanguageProvider,null,React.createElement(AppProvider,null,React.createElement(Page))))));</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/employee-validation-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>localStorage.setItem('baro_language_override',lang),lang);
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import{getDefaultRoleAccessPolicy}from'/src/utils/roleAccessPolicyCore.mjs';const user={email:'admin@example.test',id:'admin'},profile={entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',orgId:2,accessPolicy:getDefaultRoleAccessPolicy()};export const useAuth=()=>({user,isAuthenticated:true,activeProfile:profile,accessProfile:profile,activeOrgId:2,activeOrgType:'MANUFACTURER',activeOrgRole:'ADMIN',activeFactoryId:20,updateActiveProfile:()=>{}});` }));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useRequestScopeContext=()=>({active:true,scopeId:'/employees'});export const RequestScopeBoundary=({children})=>children;`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const endpoints={factories:[{id:20,name:'Hanoi'},{id:21,name:'Other'}],employees:[{id:1,orgMembershipId:1,name:'Existing operator',factoryId:20,orgRole:'OPERATOR',gradeId:10,status:'ACTIVE'}],'org-memberships':[{id:1,email:'operator@example.test',role:'OPERATOR',status:'ACTIVE'}],attributes:{roles:[],colors:[],categories:[],processes:[]},'employee-grades':[{id:1,name:'Grades',grades:[{id:10,code:'STAFF',name:'Staff',isActive:true,isDefault:true}]}]};
  for(const [endpoint,json]of Object.entries(endpoints))await page.route(`**/${endpoint}{,?*}`,r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()!=='GET')writes.push(r.request().postDataJSON());return r.fulfill({headers,json});});
  await page.goto(`http://127.0.0.1:${port}/employee-validation-acceptance.html`);
  await page.getByText('Existing operator',{exact:true}).first().waitFor();await page.getByText('Existing operator',{exact:true}).first().dblclick();
  const drawer=page.locator('.MuiDrawer-paper');await drawer.waitFor();
  assert.equal(await page.getByRole('alert').count(),0,'valid edit opens silently');
  const field=key=>drawer.locator(`[data-employee-field="${key}"]`),input=key=>field(key).locator('input');
  await input('email').fill('changed@example.test');assert.equal(await page.getByRole('alert').count(),0,'typing is not a validation attempt');
  await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
  await page.getByRole('button',{name:({ko:'직원 추가',en:'Add Employee',vi:'Them nhan vien'})[lang],exact:true}).click();await drawer.waitFor();
  await drawer.getByRole('combobox').first().click();await page.locator('[role="option"][data-value="OPERATOR"]').click();
  assert.equal(await drawer.locator('.Mui-error').count(),0);assert.equal(await page.getByRole('alert').count(),0);
  const save=drawer.locator('button').last();await save.click();
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').count(),1);
  for(const key of ['email','name','factoryId'])assert.ok(await field(key).locator('.Mui-error').count()>0,`${key} is highlighted`);
  assert.equal(await input('email').evaluate(el=>el===document.activeElement),true);
  assert.equal(writes.length,0,'invalid form never writes');
  await input('email').fill('valid@example.test');assert.equal(await field('email').locator('.Mui-error').count(),0);await page.getByRole('alert').waitFor({state:'hidden',timeout:1200});
  await input('name').fill('New operator');assert.equal(await field('name').locator('.Mui-error').count(),0);
  await field('factoryId').getByRole('combobox').click();await page.getByRole('option',{name:'Hanoi',exact:true}).click();
  assert.equal(await drawer.locator('.Mui-error').count(),0);assert.equal(await page.getByRole('alert').count(),0);
  await input('name').fill('');await save.click();await page.getByRole('alert').waitFor();assert.equal(await input('name').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});await page.getByRole('alert').waitFor({state:'hidden',timeout:1200});
  await page.getByRole('button',{name:({ko:'직원 추가',en:'Add Employee',vi:'Them nhan vien'})[lang],exact:true}).click();await drawer.waitFor();assert.equal(await drawer.locator('.Mui-error').count(),0);assert.equal(await page.getByRole('alert').count(),0);
  await drawer.getByRole('combobox').first().click();await page.locator('[role="option"][data-value="WORKER"]').click();
  await input('leftAt').fill('2000-01-01');await save.click();
  assert.equal(await field('email').locator('.Mui-error').count(),0,'worker email remains optional');
  assert.ok(await field('leftAt').locator('.Mui-error').count()>0,'date errors identify the actual date field');
  await input('leftAt').fill('');assert.equal(await field('leftAt').locator('.Mui-error').count(),0);await page.getByRole('alert').waitFor({state:'hidden',timeout:1200});
  assert.deepEqual(errors,[]);assert.equal(writes.length,0);await page.close();console.log('PASS employee validation',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(html))unlinkSync(html);}
