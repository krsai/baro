import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/auth-handoff-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{RouterProvider}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{AuthProvider,useAuth}from'/src/context/AuthContext.jsx';import CompanyWorkspaceProvider from'/src/components/CompanyWorkspaceProvider.jsx';
const params=new URLSearchParams(location.search);history.replaceState(null,'',params.get('start')||'/dashboard');const{default:router}=await import('/src/router.jsx');
function Observe(){const auth=useAuth();window.authStates||=[];window.authStates.push({loading:auth.loading,profile:!!auth.accessProfile,error:!!auth.accessError});return null;}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(AuthProvider,null,React.createElement(Observe),React.createElement(CompanyWorkspaceProvider,null,React.createElement(RouterProvider,{router})))));</script></body></html>`);
const port=43249,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/auth-handoff-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const [start,mode] of [['/auth/callback?code=mock','existing'],['/dashboard','existing'],['/onboarding','existing'],['/dashboard','error'],['/onboarding','new']]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>{window.onboardingMounts=0;if(mode==='existing')sessionStorage.setItem('baro:login-company','BARO');},mode);
  await page.route('**/src/lib/supabaseClient.js*',r=>r.fulfill({contentType:'application/javascript',body:`const session={access_token:'token',user:{id:'baro',email:'baro.garment@gmail.com'}};export const isSupabaseConfigured=true;export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}};`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'ko',setLanguageCode:()=>{}});`}));
  await page.route('**/src/layouts/MainLayout.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';import{Outlet}from'/node_modules/.vite/deps/react-router-dom.js';export default()=>React.createElement('main',null,React.createElement('h1',null,'Verified BARO workspace'),React.createElement(Outlet));`}));
  await page.route('**/src/pages/App/WorkspaceDashboard.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export default()=>null;`}));
  await page.route('**/src/pages/Auth/Onboarding.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';export default()=>{window.onboardingMounts++;return React.createElement('h1',null,'New account registration');};`}));
  await page.route('**/auth/workspaces',async r=>{await new Promise(resolve=>setTimeout(resolve,100));return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{workspaces:mode==='new'?[]:[{key:'org:1',id:1,name:'BARO GARMENT',code:'BARO'}]}});});
  await page.route('**/auth/context*',async r=>{await new Promise(resolve=>setTimeout(resolve,200));return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:mode==='error'?500:200,json:mode==='error'?{error:'context failed'}:mode==='new'?{email:'baro.garment@gmail.com',entryType:'ONBOARDING'}:{email:'baro.garment@gmail.com',entryType:'ORG',orgId:1,orgType:'MANUFACTURER',orgRole:'ADMIN',orgName:'BARO GARMENT',subscription:{status:'TRIAL'}}});});
  await page.goto(`http://127.0.0.1:${port}/auth-handoff-acceptance.html?start=${encodeURIComponent(start)}`);
  if(mode==='existing')try{await page.getByRole('heading',{name:'Verified BARO workspace',exact:true}).waitFor({timeout:10000});}catch(error){throw new Error(JSON.stringify({start,mode,errors,body:await page.locator('body').innerText(),state:await page.evaluate(()=>window.authStates)}));}
  else if(mode==='new')await page.getByRole('heading',{name:'New account registration',exact:true}).waitFor();
  else await page.locator('.lineos-google-button').waitFor();
  assert.equal(await page.evaluate(()=>window.onboardingMounts),mode==='new'?1:0,`${start}/${mode} must not flash registration`);
  if(mode==='existing')assert.equal(await page.evaluate(()=>window.authStates.some(state=>!state.loading&&!state.profile&&!state.error)),false,'Company handoff must remain loading until a profile exists');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Auth handoff passed: real callback/protected/onboarding routes never flash registration; genuine new accounts retain onboarding.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
