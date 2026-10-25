import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/version-boards-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Salary from'/src/pages/App/SalarySystem.jsx';import Factory from'/src/pages/App/organization/factoryDetail/FactoryDetail.jsx';import Process from'/src/pages/App/style/styleDetail/ProcessVersionManager.jsx';
import MonthBoard from '/src/components/MonthVersionBoard.jsx';
const factory={id:1,orgId:1,name:'Factory',factoryCode:'F1',managementStartDate:'2026-04-01',defaultVersionStartMonth:'2026-10',productionAllowanceVersions:[{id:1,versionNumber:1,effectiveMonth:'2026-04',confirmedAt:'2026-04-01',wagePerSecond:10},{id:2,versionNumber:2,effectiveMonth:'2026-10',confirmedAt:'2026-10-01',wagePerSecond:20}]};const noop=()=>{};
const screen=new URLSearchParams(location.search).get('screen');
function TouchBoard(){const [boundaries,setBoundaries]=React.useState({2:'2026-10'});return React.createElement(MonthBoard,{versions:factory.productionAllowanceVersions,months:['2026-10','2026-11'],boundaries,languageCode:'ko',versionForMonth:month=>factory.productionAllowanceVersions[month>=(boundaries[2]||'9999-12')?1:0],onAssign:(version,month)=>{window.touchDrop=[version.id,month];setBoundaries({[version.id]:month});}});}
const element=screen==='touch'?React.createElement(TouchBoard):screen==='factory'?React.createElement(Factory,{open:true,factory,onClose:noop,onSave:noop,onRefresh:noop}):screen==='process'?React.createElement(Process,{open:true,styleId:1,orgId:1,onClose:noop,notify:noop}):React.createElement(Salary);
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/salary-system']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),element)));
</script></body></html>`);
const port=43240,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
async function drag(page,source,target){await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();const from=await source.boundingBox(),to=await target.boundingBox();assert.ok(from&&to);await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2+8,from.y+from.height/2);await page.waitForTimeout(75);await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:16});await page.waitForTimeout(75);if(await target.getAttribute('aria-disabled')!=='true' && await target.getAttribute('data-dragover')!=='true'){console.log({from,to,hit:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,400),{x:to.x+to.width/2,y:to.y+to.height/2})});await page.screenshot({path:'logs/version-board-debug.png'});}if(await target.getAttribute('aria-disabled')!=='true')assert.equal(await target.getAttribute('data-dragover'),'true','drop target must highlight before release: '+await target.getAttribute('data-version-target'));await page.mouse.up();await page.waitForTimeout(100);}
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/version-boards-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const screen of ['salary','factory','process']){
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],writes=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeProfile:{orgRole:"ADMIN",entryType:"ORG"}});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>actions;'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  const versions=[{id:1,versionNumber:1,name:'Ver.1',confirmedAt:'2026-04-01',confirmedDate:'2026-04-01',effectiveMonth:'2026-04',processCount:1,items:[]},{id:2,versionNumber:2,name:'Ver.2',confirmedAt:'2026-10-01',confirmedDate:'2026-10-01',effectiveMonth:'2026-10',processCount:2,items:[]}];
  await page.route('**/factories?*',r=>r.fulfill({headers,json:[{id:1,name:'Factory',managementStartDate:'2026-04-01'}]}));
  await page.route('**/employees?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/factories/1/warehouses*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/employee-grades?*',r=>r.fulfill({headers,json:[]}));
  await page.route('**/salary-system/revision?*',r=>r.fulfill({headers,json:{editRevision:'r1'}}));
  await page.route('**/salary-system?*',r=>r.fulfill({headers,json:{items:[],rates:[],versions,editRevision:'r1',defaultVersionStartMonth:'2026-10'}}));
  for(const route of ['**/salary-system/version-boundaries?*','**/factories/1/production-allowance-version-boundaries','**/styles/1/process-*'])await page.route(route,r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(r.request().method()==='PUT'){writes.push(r.request().postDataJSON());return r.fulfill({headers,json:{versions,editRevision:'r2'}});}
   return r.fulfill({headers,json:{versions,assignments:[{assignmentPlanId:1,orderNo:'O-A',assignedAt:'2026-04-01',assignmentQuantity:10,versionId:1},{assignmentPlanId:2,orderNo:'O-B',assignedAt:'2026-04-02',assignmentQuantity:10,versionId:1,isVersionLocked:true},{assignmentPlanId:3,orderNo:'O-C',assignedAt:'2026-10-01',assignmentQuantity:10,versionId:1}]}});
  });
  await page.goto(`http://127.0.0.1:${port}/version-boards-acceptance.html?screen=${screen}`);
  if(screen!=='process')await page.getByRole('button',{name:screen==='salary'?{ko:'버전 관리',en:'Version history',vi:'Lịch sử phiên bản'}[lang]:{ko:'버전 관리',en:'Version Management',vi:'Quản lý phiên bản'}[lang],exact:true}).click();
  const board=page.locator('[data-version-board]');await board.waitFor();
  const dialog=board.locator('xpath=ancestor::*[@role="dialog"][1]');
  assert.equal(await dialog.locator('input[type=month],select,[role=combobox]').count(),0,'version range editor has no selectors');
  assert.deepEqual(await board.locator('[data-version-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.versionId)),['2','1']);
  const source=board.locator('[data-version-id="2"]');
  const target=id=>board.locator('[data-version-target="'+id+'"]');
  if(screen==='process'){
   await drag(page,source,target(2));assert.equal(await target(2).getByText('Ver.1',{exact:true}).count(),1);
   assert.equal(await dialog.getByRole('button',{name:{ko:'저장',en:'Save',vi:'Lưu'}[lang],exact:true}).isDisabled(),true);
   await drag(page,source,target(1));
   assert.equal(await target(1).getByText('Ver.2',{exact:true}).count(),1);assert.equal(await target(3).getByText('Ver.2',{exact:true}).count(),1);assert.equal(await target(2).getByText('Ver.1',{exact:true}).count(),1);
  }else{
   await source.focus();await page.keyboard.press('Space');await page.waitForTimeout(100);await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);await page.keyboard.press('Space');await page.waitForTimeout(100);
   assert.equal(await target('2026-11').getByText('Ver.2',{exact:true}).count(),1);
   assert.equal(await target('2026-10').getByText('Ver.1',{exact:true}).count(),1,'keyboard moves the boundary to November');
   await drag(page,source,target('2026-04'));assert.equal(await target('2026-04').getByText('Ver.2',{exact:true}).count(),1);
   await drag(page,source,board.locator('[data-version-unapply]'));assert.equal(await target('2026-04').getByText('Ver.1',{exact:true}).count(),1);
   await page.getByRole('button',{name:{ko:'이후 12개월',en:'Next 12 months',vi:'12 tháng tiếp'}[lang],exact:true}).click();
   assert.equal(await target('2027-11').count(),1,'future months stay available without a date picker');
   await drag(page,source,target('2026-04'));assert.equal(await target('2026-04').getByText('Ver.2',{exact:true}).count(),1);
  }
  assert.equal(writes.length,0,'dragging must not save automatically');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1),false,'the open version dialog must fit mobile width');
  await page.setViewportSize({width:1440,height:1100});
  await dialog.getByRole('button',{name:{ko:'저장',en:'Save',vi:'Lưu'}[lang],exact:true}).click();await page.waitForTimeout(200);
  assert.equal(writes.length,1);assert.ok(writes[0].boundaries.some(row=>row.versionId===2&&(screen==='process'?row.startAssignmentPlanId===1:row.startMonth==='2026-04')));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);console.log(`${lang}/${screen}: drag, locked/fixed rules, explicit save and original FK payload OK`);await page.close();
 }
 const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const touchPage=await touchContext.newPage();await touchPage.goto(`http://127.0.0.1:${port}/version-boards-acceptance.html?screen=touch`);
 const touchSource=touchPage.locator('[data-version-id="2"]'),touchTarget=touchPage.locator('[data-version-target="2026-11"]');await touchSource.waitFor();
 const from=await touchSource.boundingBox(),to=await touchTarget.boundingBox(),session=await touchContext.newCDPSession(touchPage);
 const point={x:from.x+from.width/2,y:from.y+from.height/2,id:1};
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await touchPage.waitForTimeout(250);
 for(let index=1;index<=12;index++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:point.x+(to.x+to.width/2-point.x)*index/12,y:point.y+(to.y+to.height/2-point.y)*index/12}]});
 await touchPage.waitForTimeout(100);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchPage.waitForTimeout(100);
 assert.deepEqual(await touchPage.evaluate(()=>window.touchDrop),[2,'2026-11']);
 assert.equal(await touchPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await touchContext.close();
 console.log('Mobile touch drag passed with the shared month board.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
