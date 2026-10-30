import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseApprovalActionsText} from '../frontend/src/constants/expenseApprovalActions.js';
import {approvalWorkflowText} from '../frontend/src/constants/approvalWorkflow.js';
const fixture=path.resolve('frontend/expense-approval-actions-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Actions from'/src/components/ExpenseApprovalActions.jsx';import Inbox from'/src/components/ExpenseApprovalInbox.jsx';
const lang=new URLSearchParams(location.search).get('lang');function App(){const[version,setVersion]=React.useState(1),[dirty,setDirty]=React.useState(false),[orgId,setOrg]=React.useState(7),[compact,setCompact]=React.useState(false);window.setCompact=setCompact;window.setVersion=setVersion;window.setDirty=setDirty;window.setOrg=setOrg;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Inbox,{orgId,languageCode:lang,onOpenRequest:(...args)=>window.opened=args}),React.createElement(Actions,{compact,requestId:1,version,orgId,languageCode:lang,dirty,disabled:dirty,onRefresh:()=>setVersion(2)}));}createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
</script></body></html>`);
const port=43260,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-approval-actions-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));
  const t=expenseApprovalActionsText[lang],headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  let version=1,approved=false,rejected=false,reason='';
  const state=()=>({version,status:rejected?'REJECTED':approved?'APPROVED':'REQUESTED',managementNumber:'EXP-2026-000001',approved,rejected,rejection:rejected?{reason}:null,canApprove:!approved&&!rejected,canReject:!approved&&!rejected,steps:[{id:'s1',position:1,employeeId:11,employee:{name:'Reviewer'},approved,rejected,reason,approvedAt:approved?'2026-10-29T01:00:00Z':null,rejectedAt:rejected?'2026-10-30T01:00:00Z':null}]});
  await page.route('**/expense-requests/1/approval?*',async r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='POST'){const body=r.request().postDataJSON();if(body.version!==version)return r.fulfill({headers,status:409,json:{error:'EXPENSE_REQUEST_CHANGED'}});posts.push(body);rejected=body.decision==='REJECTED';reason=body.reason||'';approved=!rejected;await new Promise(resolve=>setTimeout(resolve,150));}
   return r.fulfill({headers,json:state()});
  });
  await page.route('**/expense-approval-inbox?*',r=>r.fulfill({headers,json:approved?[]:[{id:1,version,managementNumber:'EXP-2026-000001',requestDate:'2026-10-29',payee:'Vendor',drafter:'Author'}]}));
  await page.goto(`http://127.0.0.1:${port}/expense-approval-actions-acceptance.html?lang=${lang}`);
  const panel=page.getByTestId('expense-approval-actions'),button=panel.getByRole('button',{name:t.approve,exact:true});await button.waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'approve is visible without opening approval settings');
  await page.getByRole('button',{name:t.inbox,exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByText('EXP-2026-000001').waitFor();await dialog.getByRole('button',{name:t.open,exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.opened),['request','1']);
  await page.evaluate(()=>window.setDirty(true));assert.equal(await button.isDisabled(),true);
  await page.evaluate(()=>window.setDirty(false));await button.click();dialog=page.getByRole('dialog');await dialog.getByText('EXP-2026-000001').waitFor();await dialog.getByRole('button',{name:t.cancel,exact:true}).click();assert.equal(posts.length,0);
  await button.click();version=2;await page.getByRole('dialog').getByRole('button',{name:t.approve,exact:true}).click();await panel.getByRole('button',{name:t.refresh,exact:true}).waitFor();assert.equal(posts.length,0,'a server-side version conflict never approves unseen content');
  await page.evaluate(()=>window.setOrg(8));await panel.getByRole('button',{name:t.refresh,exact:true}).waitFor();assert.equal(await button.isDisabled(),true);assert.equal(posts.length,0,'unseen newer version cannot be approved');
  await panel.getByRole('button',{name:t.refresh,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-testid="expense-approval-actions"] .MuiAlert-standardWarning'));
  await button.click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:t.approve,exact:true}).click();
  await dialog.waitFor({state:'hidden'});await panel.getByText(t.approved,{exact:true}).first().waitFor();assert.deepEqual(posts,[{version:2}]);
  await panel.getByText(/2026/).waitFor();
  await page.getByRole('button',{name:t.inbox,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByText(t.empty).waitFor();await dialog.getByRole('button',{name:t.close,exact:true}).click();
  version=3;approved=false;await page.evaluate(()=>window.setVersion(3));const w=approvalWorkflowText[lang];
  await panel.getByRole('button',{name:w.reject,exact:true}).click();dialog=page.getByRole('dialog');
  const reject=dialog.getByRole('button',{name:w.reject,exact:true});assert.equal(await reject.isDisabled(),true);
  await dialog.getByRole('textbox').fill('   ');assert.equal(await reject.isDisabled(),true);
  await dialog.getByRole('button',{name:t.cancel,exact:true}).click();assert.equal(posts.length,1);
  await panel.getByRole('button',{name:w.reject,exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('  Incorrect invoice\nPlease revise.  ');await dialog.getByRole('button',{name:w.reject,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await panel.getByText(w.resubmit).waitFor();assert.equal(await panel.getByRole('button',{name:w.reject,exact:true}).count(),0);assert.equal(await button.count(),0);
  assert.deepEqual(posts[1],{version:3,decision:'REJECTED',reason:'Incorrect invoice\nPlease revise.'});assert.equal(await panel.locator('[data-approval-status="REJECTED"]').count(),1);
  version=4;approved=false;rejected=false;await page.evaluate(()=>{window.setCompact(true);window.setVersion(4);});await button.waitFor();assert.equal(await panel.getByText(t.title,{exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:t.history,exact:true}).count(),0);assert.equal(await panel.locator('[data-approval-status]').count(),0);
  await panel.getByRole('button',{name:w.reject,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill('Compact rejection');await dialog.getByRole('button',{name:w.reject,exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByText(w.resubmit).waitFor();assert.deepEqual(posts[2],{version:4,decision:'REJECTED',reason:'Compact rejection'});
  await page.setViewportSize({width:390,height:844});assert.equal(await panel.isVisible(),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Approval actions passed: visible approval, inbox review, confirmation/cancel, unsaved and unseen-version blocking, exact reviewed version, timestamps, completion and ko/en/vi mobile.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
