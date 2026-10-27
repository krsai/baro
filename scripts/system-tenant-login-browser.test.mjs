import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/system-tenant-login-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{AuthProvider,useAuth}from'/src/context/AuthContext.jsx';import Chooser from'/src/pages/Auth/CompanyChooser.jsx';
function View(){const auth=useAuth();window.auth=auth;if(auth.loading)return React.createElement('p',null,'Loading');if(auth.requiresWorkspaceSelection)return React.createElement(Chooser,{languageCode:new URLSearchParams(location.search).get('lang')});return auth.hasWorkspaceAccess?React.createElement('h1',null,auth.accessProfile.entryType+':'+String(auth.activeOrgId)):React.createElement('h1',null,'No access');}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(AuthProvider,null,React.createElement(View))));</script></body></html>`);
const port=43253,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/system-tenant-login-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const stale of [false,true]){
  const page=await browser.newPage(),requests=[],errors=[];let deny=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(stale=>{sessionStorage.setItem('baro:login-company','BARO');if(stale)sessionStorage.setItem('baro:workspace-selection',JSON.stringify({email:'system@example.com',key:'org:1'}));},stale);
  await page.route('**/src/lib/supabaseClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`const session={access_token:'token',user:{id:'system',email:'system@example.com'}};export const isSupabaseConfigured=true;export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}};`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
  await page.route('**/auth/workspaces',r=>r.fulfill({headers,json:{workspaces:[{key:'system',id:null,name:'SYSTEM',type:'SYSTEM',role:'SYSTEM_ADMIN'}],canCreateCompany:true}}));
  await page.route('**/auth/context*',r=>{requests.push(r.request().url());return r.fulfill({headers,status:deny?403:200,json:deny?{error:'access denied'}:{email:'system@example.com',entryType:'SYSTEM',systemRole:'SYSTEM_ADMIN',orgId:null,orgName:null}});});
  await page.goto(`http://127.0.0.1:${port}/system-tenant-login-acceptance.html?lang=${lang}`);
  await page.getByRole('button',{name:'SYSTEM',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'BARO GARMENT',exact:true}).count(),0);
  assert.ok(requests.every(url=>!new URL(url).searchParams.has('orgId')),'stale BARO selections must never request a BARO profile');
  await page.getByRole('button',{name:'SYSTEM',exact:true}).click();
  await page.getByRole('heading',{name:'SYSTEM:null',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.auth.activeOrgId),null);
  deny=true;await page.evaluate(()=>window.auth.reloadWorkspaces());
  await page.getByRole('heading',{name:'No access',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.auth.accessProfile),null,'explicit access denial must discard an old profile');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('SYSTEM-only accounts cannot enter BARO using login defaults or stale selections in ko/en/vi; 403 revokes cached profiles.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
