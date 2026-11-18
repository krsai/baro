import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';

const source=readFileSync('frontend/src/layouts/MainLayout.jsx','utf8').replace(/\r\n/g,'\n');
const muiStart=source.indexOf('import {\n  AppBar,');
const mui=source.slice(muiStart,source.indexOf("} from '@mui/material';",muiStart)+"} from '@mui/material';".length);
const component=source.slice(source.indexOf('const WorkspaceTabsBar ='),source.indexOf('\nexport default',source.indexOf('const WorkspaceTabsBar =')));
// Only render the actual tab bar, including its actual MUI imports. A build
// alone accepts unbound JSX names such as the missing Tooltip regression.
const tabBar=component.slice(0,component.indexOf('\n});')+5);
const html=path.resolve('frontend/workspace-tabs-test.html'),jsx=path.resolve('frontend/workspace-tabs-test.jsx'),port=43466;
for(const file of [html,jsx])assert.ok(!existsSync(file));
writeFileSync(html,'<html><meta charset="utf-8"><div id="root"></div><script type="module" src="/workspace-tabs-test.jsx"></script></html>');
writeFileSync(jsx,`import {AppProvider,useAppActions} from '/src/context/AppContext';import React,{useMemo} from 'react';import{createRoot}from'react-dom/client';${mui}
import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{keyboardAction}from'/src/utils/keyboardPolicy.mjs';import CloseIcon from'@mui/icons-material/Close';import TabStateIndicators from'/src/components/TabStateIndicators';
const useLanguage=()=>({languageCode:new URLSearchParams(location.search).get('lang')}),useNetworkLoading=()=>{const[busy,setBusy]=React.useState(false);React.useEffect(()=>{window.setTabBusy=setBusy;},[]);return {scopes:busy?[1]:[]};},buildTabLoadingCounts=scopes=>new Map(scopes.length?[["/page/1",1]]:[]),TAB_BAR_HEIGHT=41;
${tabBar}
function App(){const actions=useAppActions();window.guardFirst=()=>actions.setUnsavedChangesGuard('test',{path:'/page/0',isDirty:true});const[tabs,setTabs]=React.useState(Array.from({length:20},(_,i)=>({id:'/page/'+i,label:'Page '+i})));window.setTabFlags=(editing,refreshed)=>setTabs(current=>current.map(tab=>({...tab,isEditing:editing,hasExternalChanges:refreshed})));window.setFirstTitle=label=>setTabs(current=>current.map((tab,index)=>index===0?{...tab,label}:tab));window.markTabs=()=>setTabs(current=>current.map(tab=>({...tab,isEditing:true,hasExternalChanges:true})));return <ThemeProvider theme={theme}><CssBaseline/><WorkspaceTabsBar currentPath={tabs[0]?.id||'/workspace'} tabsForRender={tabs} resolveRenderedTabLabel={tab=>tab.label} onTabChange={()=>{}} onCloseTab={async(event,id)=>{if(!await actions.confirmDiscardUnsavedChanges({path:id}))return false;actions.clearUnsavedChangesGuard('test');window.closedTab=id;setTabs(current=>current.filter(tab=>tab.id!==id));}} onCloseAllTabs={()=>{window.closedAll=true;setTabs([]);}}/></ThemeProvider>;}createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><AppProvider><App/></AppProvider></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:600}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}?lang=${lang}`);
  const first=page.getByRole('tab').first();await page.evaluate(()=>window.guardFirst());await first.focus();await first.press('Delete');const confirmation=page.locator('[data-page-confirmation]');await confirmation.getByRole('button').first().click();await confirmation.waitFor({state:'hidden'});await first.and(page.locator(':focus')).waitFor();await first.press('Delete');await confirmation.getByRole('button').last().click();await page.waitForFunction(()=>window.closedTab==='/page/0');await page.getByRole('tab').first().and(page.locator(':focus')).waitFor();assert.equal(await page.getByRole('tab').count(),19);
  const closeName=({ko:'탭 닫기',en:'Close tab',vi:'Đóng tab'})[lang];
  assert.ok((await page.getByRole('tab').first().boundingBox()).width<=145,'short workspace tab stays compact with stable status space');const close=page.getByRole('button',{name:closeName+': Page 1',exact:true});let before=await close.boundingBox();
  const closeRest=before;
  for(const editing of [false,true])for(const refreshed of [false,true])for(const loading of [false,true]){
   await page.evaluate(flags=>{window.setTabFlags(flags.editing,flags.refreshed);window.setTabBusy(flags.loading);},{editing,refreshed,loading});
   await page.waitForFunction(flags=>{const tab=document.querySelector('[data-workspace-tab]'),lane=tab.querySelector('[data-tab-indicators]');return lane.querySelectorAll('[role="img"]').length===Number(flags.editing)+Number(flags.refreshed&&!flags.loading)&&Boolean(lane.querySelector('[role="progressbar"]'))===flags.loading;},{editing,refreshed,loading});
   const geometry=await page.getByRole('tab').first().evaluate(tab=>{const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {title:rect(tab.querySelector('[data-tab-title]')),lane:rect(tab.querySelector('[data-tab-indicators]')),marks:[...tab.querySelectorAll('[data-tab-indicators] [role="img"],[data-tab-indicators] [role="progressbar"]')].map(rect)};});
   const center=geometry.title.y+geometry.title.h/2;assert.ok(Math.abs(center-(geometry.lane.y+geometry.lane.h/2))<1);for(const mark of geometry.marks)assert.ok(Math.abs(center-(mark.y+mark.h/2))<1,JSON.stringify(geometry));
   assert.ok(Math.abs((await close.boundingBox()).x-closeRest.x)<1,'all state combinations keep the close control stable');
  }
  await page.evaluate(()=>{window.setTabFlags(false,false);window.setTabBusy(false);window.setFirstTitle('Long title '.repeat(12));});
  const title=page.getByRole('tab').first().locator('[data-tab-title]');await page.waitForFunction(()=>document.querySelector('[data-tab-title]').textContent.startsWith('Long title'));
  assert.ok(await title.evaluate(el=>el.scrollWidth>el.clientWidth));
  assert.ok(await page.getByRole('tab').first().evaluate(tab=>{const bounds=tab.getBoundingClientRect();return [...tab.querySelectorAll('[data-tab-indicators], [role="button"]')].every(el=>{const r=el.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right;});}));
  await page.evaluate(()=>window.setFirstTitle('Page 1'));await page.waitForFunction(()=>document.querySelector('[data-tab-title]').textContent==='Page 1');
  await page.waitForTimeout(350);before=await close.boundingBox();
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.evaluate(()=>{window.setTabBusy(true);window.markTabs();});await page.waitForTimeout(80);const after=await close.boundingBox();
  assert.ok(Math.abs(before.x-after.x)<1,'background refresh must not move the close button during activation');await page.mouse.up();await page.waitForFunction(()=>window.closedTab==='/page/1');assert.equal(await page.getByRole('tab').count(),18);
  const button=page.getByRole('button',{name:({ko:'모든 탭 닫기',en:'Close all tabs',vi:'Đóng tất cả các tab'})[lang],exact:true});await button.waitFor();
  const bounds=await button.boundingBox();assert.ok(bounds.x+ bounds.width<=width&&bounds.x>width-65,'close all remains at the far right with overflowing tabs');
  await page.getByRole('tab').first().press('Tab');await button.and(page.locator(':focus')).waitFor();await page.getByRole('tooltip').waitFor();await button.press('Enter');assert.equal(await page.evaluate(()=>window.closedAll),true);assert.equal(await page.getByRole('tab').count(),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: actual workspace tab bar renders without undefined components; ko/en/vi desktop/mobile close-all tooltip, position and click.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
