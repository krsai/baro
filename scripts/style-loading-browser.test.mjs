import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
const fixture=path.resolve('frontend/style-loading-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Board from'/src/pages/App/style/StyleBoard.jsx';
window.notices=[];function App(){const[open,setOpen]=React.useState(true);return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement('button',{onClick:()=>setOpen(false)},'Close tab'),open?React.createElement(MemoryRouter,{initialEntries:['/style']},React.createElement(Board)):null);}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43231,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/style-loading-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const scenario of ['normal','close-success','close-failure']){
    const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgType:"MANUFACTURER"});'}));
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"ko"});'}));
    await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},showNotification:(text,type)=>window.notices.push({text,type})};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
    await page.route('**/src/pages/App/style/StyleDetail.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export default function Detail(){return null;}'}));
    const headers={'Access-Control-Allow-Origin':'*'},styles=[{id:1,ownerOrgId:1,code:'SAN049',name:'SAN049',canDelete:false,deleteBlockedReason:'TRAINING_SOURCE',hasWorkRecords:false,processes:[]},{id:2,ownerOrgId:1,code:'UNUSED',name:'UNUSED',canDelete:true,processes:[]}];
    let release,seen=false,polls=0,background=false,statusOverride=null,statusReads=0,historyReads=0;
    await page.route('**/styles/*/order-history?*',r=>{
      historyReads++;
      assert.equal(new URL(r.request().url()).searchParams.get('ownerOrgId'),'1');
      return r.fulfill({headers,json:[{id:18,orderNumber:'L18-1',createdAt:'2026-10-01T02:00:00Z',dueDate:'2026-11-01',quantity:500}]});
    });
    await page.route('**/styles?*',async route=>{
      assert.equal(new URL(route.request().url()).searchParams.get('list'),'1');
      seen=true;if(scenario!=='normal')await new Promise(resolve=>{release=resolve;});
      await route.fulfill({headers,...(scenario==='close-failure'?{status:500,json:{error:'Simulated failure'}}:{json:styles})});
    });
    let detailReads=0;
    await page.route('**/styles/1?*',r=>{detailReads++;return r.fulfill({headers,json:{...styles[0],bom:[{material:'DETAIL_ONLY'}]}});});
    await page.route('**/at-sync/status?*',r=>{statusReads++;return r.fulfill({headers,json:{needsUpdate:statusOverride??polls===0,trainingMonthKey:'2026-09'}});});
    await page.route('**/at-sync/run-now?*',r=>{background=r.request().postDataJSON().background===true;return r.fulfill({headers,status:202,json:{jobId:'job-1',status:'RUNNING'}});});
    await page.route('**/at-sync/jobs/job-1?*',r=>r.fulfill({headers,json:++polls===1?{jobId:'job-1',status:'RUNNING'}:{jobId:'job-1',status:'SUCCEEDED',result:{reason:'done',trainingMonthKey:'2026-09',updatedProcesses:1}}}));
    await page.goto(`http://127.0.0.1:${port}/style-loading-acceptance.html`);
    if(scenario==='normal'){
      const used=page.locator('tbody tr').filter({hasText:'SAN049'});await used.waitFor();
      assert.equal(historyReads,0);
      await used.getByRole('button',{name:'주문 내역',exact:true}).click();
      const historyDialog=page.getByRole('dialog');
      await historyDialog.getByText('L18-1',{exact:true}).waitFor();
      assert.equal(await historyDialog.getByText('500',{exact:true}).count(),1);
      assert.equal(await historyDialog.getByText('2026-10-01',{exact:true}).count(),1);
      await historyDialog.getByRole('button',{name:'닫기',exact:true}).click();
      await historyDialog.waitFor({state:'hidden'});
      assert.equal(historyReads,1);
      assert.equal(await used.getByRole('button').last().isDisabled(),true);
      assert.equal(await page.locator('tbody tr').filter({hasText:'UNUSED'}).getByRole('button').last().isDisabled(),false);
      for (const topic of ['assignment-board','orders','payroll-sources']) {
        styles[1].canDelete=false;styles[1].hasWorkRecords=true;styles[1].workRecordCount=1;
        await page.evaluate(topic=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:[topic]}})),topic);
        await page.waitForFunction(()=>document.querySelectorAll('tbody tr')[1]?.querySelector('button[aria-label="delete"]')?.disabled===true);
        styles[1].canDelete=true;styles[1].hasWorkRecords=false;styles[1].workRecordCount=0;
        await page.evaluate(topic=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:[topic]}})),topic);
        await page.waitForFunction(()=>document.querySelectorAll('tbody tr')[1]?.querySelector('button[aria-label="delete"]')?.disabled===false);
      }
      await page.getByRole('button',{name:'AT 갱신',exact:true}).click();
      await page.waitForFunction(()=>window.notices.some(n=>n.type==='success'));
      assert.equal(background,true);assert.ok(polls>=2);
      const atButton=page.getByRole('button',{name:/^AT /}).first();
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='AT \uAC31\uC2E0'&&button.disabled));
      // Source mutations must refresh AT readiness, not only the style rows.
      for(const source of ['attendance-entries','work-logs']){
        statusOverride=true;const before=statusReads;
        await page.evaluate(source=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{orgId:1,topics:['payroll-sources'],source}})),source);
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='AT \uAC31\uC2E0'&&!button.disabled));
        assert.ok(statusReads>before,source);
        statusOverride=false;
        await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='AT \uAC31\uC2E0'&&button.disabled));
      }
      statusOverride=true;
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='AT \uAC31\uC2E0'&&!button.disabled));
      assert.equal(await atButton.isDisabled(),false);
    }else{
      for(let i=0;i<100&&!seen;i++)await new Promise(r=>setTimeout(r,20));assert.equal(seen,true);
      await page.getByRole('button',{name:'Close tab',exact:true}).click();release();
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(()=>window.notices),[]);
      if(scenario==='close-success'){
        const cached=await page.evaluate(async()=>{const {fetchStyleById}=await import('/src/utils/styleApi.js');return fetchStyleById(1,{orgId:1,ownerOrgId:1});});
        assert.equal(cached.name,'SAN049');
        assert.equal(cached.bom[0].material,'DETAIL_ONLY');
        assert.equal(detailReads,1);
      }
    }
    assert.deepEqual(errors,[]);await page.close();
  }
  const layout=readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
  assert.equal(layout.includes("cancelAllTrackedRequests('close_active_tab')"),false);
  assert.equal(layout.includes("cancelAllTrackedRequests('logout')"),true);
  console.log('Style browser passed: deletion history, background AT polling, closed-tab cache completion and suppressed stale errors; logout cancellation retained.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
