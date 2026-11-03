import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {approvalSettingsText} from '../frontend/src/constants/approvalSettings.js';
import {approvalBandText} from '../frontend/src/constants/approvalBands.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/approval-settings-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Settings from '/src/pages/App/ApprovalSettings.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Settings))));</script></body></html>`);
const port=43219,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/approval-settings-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];let saved;
  page.on('pageerror',e=>errors.push(e.message));const posts=[];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const settings={limits:{VND:{senior:'20000000',lead:'100000000'},USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'}},seniorGradeId:10,leadGradeId:20,seniorEmployeeId:2,leadEmployeeId:3,adminEmployeeId:4};
  const data={settings,drafter:{id:1,name:'Current user',orgRole:'ADMIN'},canEdit:true,grades:[{id:1,code:'CL1',name:'Staff',nameEn:'Staff'},{id:10,code:'CL2',name:'Senior',nameEn:'Senior'},{id:20,code:'CL3',name:'Lead',nameEn:'Lead'}],candidates:[{id:2,name:'Senior accountant',orgRole:'ACCOUNTANT',gradeId:10},{id:3,name:'Lead accountant',orgRole:'ACCOUNTANT',gradeId:20},{id:4,name:'Administrator',orgRole:'ADMIN'}]};
  await page.route('**/expense-approval-settings?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers});if(r.request().method()==='PUT'){saved=r.request().postDataJSON();posts.push(saved);return r.fulfill({headers,json:{ok:true}});}return r.fulfill({headers,json:data});});
  await page.goto(`http://127.0.0.1:${port}/approval-settings-acceptance.html`);
  const t=approvalSettingsText[lang],band=approvalBandText[lang],initialUrl=page.url();
  await page.getByRole('heading',{name:t.title,exact:true}).waitFor();
  const first=page.locator('[data-approval-band="0"]'),rows=page.locator('[data-approval-band]');
  await first.getByRole('textbox',{name:band.amount+' USD 1',exact:true}).waitFor();
  assert.equal(await rows.count(),3);assert.equal(await first.locator('[data-band-stage]').count(),1);
  assert.ok((await first.boundingBox()).height<110,'Approval rows remain compact');
  assert.equal(await page.getByText(band.future,{exact:true}).count(),0);
  assert.equal(await page.locator('.app-page-header').getByRole('button',{name:band.addCondition,exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:/규칙 추가|예시|Add rule|Add example|Ví dụ/}).count(),0);
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(posts.length,0);
  const bounds=await page.getByTestId('approval-settings-page').boundingBox();assert.ok(bounds.width>=width-70,'Settings use the full work area');
  await first.getByRole('textbox',{name:band.amount+' USD 1',exact:true}).fill('1500');
  await first.locator('[data-add-middle]').last().click();await first.locator('[data-add-middle]').last().click();
  assert.equal(await first.locator('[data-band-stage]').count(),3);assert.equal(await page.getByRole('button',{name:t.save,exact:true}).isDisabled(),true);
  const choose=async(control,name)=>{await control.click();await page.getByRole('option',{name,exact:true}).click();};
  const stage=(index,field)=>first.locator('[data-band-stage="'+index+'"]').getByRole('combobox').nth(field);
  await choose(stage(0,1),'Lead');await choose(stage(1,0),band.ACCOUNTANT);await choose(stage(1,1),'Senior');await choose(stage(2,0),band.ADMIN);
  const dragStage=async(position,key)=>{
   const controls=await first.locator('[data-band-stage] .MuiSelect-select').allTextContents(),pairs=Array.from({length:controls.length/2},(_,index)=>controls.slice(index*2,index*2+2));pairs.splice(position+(key==='ArrowLeft'?-1:1),0,pairs.splice(position,1)[0]);
   const handle=first.locator(`[data-stage-drag-handle="${position}"]`);await handle.scrollIntoViewIfNeeded();await handle.focus();await page.keyboard.press('Space');await page.keyboard.press(key);await page.keyboard.press('Space');
   await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('[data-approval-band="0"] [data-band-stage] .MuiSelect-select')].map(element=>element.textContent))===JSON.stringify(expected),pairs.flat());
   await page.waitForFunction(()=>![...document.querySelectorAll('[data-stage-drag-handle]')].some(element=>getComputedStyle(element.closest('[data-rfd-draggable-id]')).transform!=='none'));
  };
  await dragStage(1,'ArrowLeft');
  assert.equal(await stage(0,0).textContent(),band.ACCOUNTANT);
  await dragStage(0,'ArrowRight');
  await dragStage(2,'ArrowLeft');assert.equal(await stage(2,0).textContent(),band.ACCOUNTANT);await dragStage(1,'ArrowRight');
  assert.equal(await first.getByRole('button',{name:band.left,exact:true}).count(),0);assert.equal(await first.getByRole('button',{name:band.right,exact:true}).count(),0);
  assert.equal(posts.length,0);assert.equal(page.url(),initialUrl);assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();
  assert.equal(saved.revision,0);assert.equal(saved.rules.length,9);assert.equal(saved.rules[0].max,'1500');assert.equal(saved.rules[1].min,'1500.01');
  assert.deepEqual(saved.rules[0].stages,[{role:'OPERATOR',gradeId:20},{role:'ACCOUNTANT',gradeId:10},{role:'ADMIN',gradeId:null}]);
  assert.ok(saved.rules.every(row=>!('__bounded' in row)));assert.equal(saved.limits.USD.senior,'1000');
  await page.waitForFunction(()=>{const nodes=[...document.querySelectorAll('[data-approval-band="0"] [data-band-drafter],[data-approval-band="0"] [data-band-stage]')].map(element=>element.getBoundingClientRect());return nodes.every((node,index)=>!index||Math.abs(node.x-nodes[index-1].x-nodes[index-1].width-32)<1);});
  const nodes=await first.locator('[data-band-drafter],[data-band-stage]').evaluateAll(elements=>elements.map(element=>{const rect=element.getBoundingClientRect();return {x:rect.x,width:rect.width};}));
  for(let i=1;i<nodes.length;i++)assert.ok(Math.abs(nodes[i].x-nodes[i-1].x-nodes[i-1].width-32)<1,'Every connection uses the same gap: '+JSON.stringify(nodes));
  const connector=first.locator('[data-band-connector]').first(),arrow=await connector.locator('svg').first().boundingBox(),plus=await connector.getByRole('button').boundingBox();assert.ok(plus.y>=arrow.y+arrow.height,'Add button sits below the arrow');
  assert.equal(await first.getByText(band.under,{exact:true}).count(),0);assert.equal(await first.getByText(band.over,{exact:true}).count(),0);
  assert.equal(await page.getByRole('tab').count(),0);assert.equal(await page.locator('[data-currency-heading]').count(),3);
  await first.getByRole('textbox',{name:band.amount+' VND 1',exact:true}).fill('25000000');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();
  assert.equal(saved.revision,1);assert.equal(saved.rules.length,9);assert.equal(saved.rules.find(row=>row.currency==='VND').max,'25000000');assert.equal(saved.rules.filter(row=>row.currency==='VND')[1].min,'25000001');
  assert.equal(saved.rules.find(row=>row.currency==='USD').max,'1500');
  await page.getByRole('button',{name:band.addCondition,exact:true}).click();assert.equal(await rows.count(),4);
  assert.equal(await page.getByRole('button',{name:t.save,exact:true}).isDisabled(),true);
  assert.equal(await page.getByText(band.orderError,{exact:true}).count(),0);assert.equal(await page.locator('.Mui-error').count(),0,'Adding an unfinished band does not show an error');
  const added=page.locator('[data-approval-band="2"]');for(const [currency,max] of [['USD','750'],['KRW','500000'],['VND','15000000']])await added.getByRole('textbox',{name:band.amount+' '+currency+' 3',exact:true}).fill(max);
  await page.getByText(band.orderError,{exact:true}).waitFor();
  const handle=added.locator('[data-band-drag-handle]');await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');
  await page.getByText(band.orderError,{exact:true}).waitFor({state:'hidden'});assert.equal(await page.locator('[data-approval-band="0"]').getByRole('textbox',{name:band.amount+' USD 1',exact:true}).inputValue(),'750');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();assert.equal(saved.rules.length,12);
  assert.equal(saved.rules.filter(row=>row.currency==='VND')[3].min,'100000001');assert.equal(saved.rules.find(row=>row.currency==='USD').max,'750');
  await page.locator('[data-approval-band="0"]').getByRole('button',{name:band.remove,exact:true}).first().click();assert.equal(await rows.count(),3);
  const scopes=page.getByRole('group',{name:band.drafterRole,exact:true});for(const role of ['OPERATOR','ACCOUNTANT','ADMIN'])assert.equal(await scopes.getByRole('button',{name:band[role],exact:true}).count(),1);
  for(const [role,grade] of [['ACCOUNTANT','Staff'],['ADMIN','Lead']]){
   await scopes.getByRole('button',{name:band[role],exact:true}).click();await choose(page.getByRole('combobox',{name:band.drafterGrade,exact:false}),grade);await page.getByRole('button',{name:band.addCondition,exact:true}).click();
   const scoped=page.locator('[data-approval-band="0"]');for(const [currency,max] of [['USD','2000'],['KRW','2000000'],['VND','30000000']])await scoped.getByRole('textbox',{name:band.amount+' '+currency+' 1',exact:true}).fill(max);
   assert.equal(await scoped.locator('[data-band-drafter]').getByRole('textbox').first().inputValue(),band[role]);await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();
   assert.equal(saved.rules.filter(row=>row.drafterRole===role&&row.drafterGradeId===(role==='ACCOUNTANT'?1:20)).length,3);assert.equal(saved.rules.filter(row=>row.drafterRole==='OPERATOR').length,9);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: full-width inline amount conditions, two intermediate approvers, role/grade editing and ordering, separate currencies, amount-band insertion/removal, no dialogs or navigation, ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
