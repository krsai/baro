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
writeFileSync(jsx,`import React,{useMemo} from 'react';import{createRoot}from'react-dom/client';${mui}
import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import{keyboardAction}from'/src/utils/keyboardPolicy.mjs';import CloseIcon from'@mui/icons-material/Close';import TabStateIndicators from'/src/components/TabStateIndicators';
const useLanguage=()=>({languageCode:new URLSearchParams(location.search).get('lang')}),useNetworkLoading=()=>{const[busy,setBusy]=React.useState(false);React.useEffect(()=>{window.setTabBusy=setBusy;},[]);return {scopes:busy?[1]:[]};},buildTabLoadingCounts=scopes=>new Map(scopes.length?[["/page/1",1]]:[]),TAB_BAR_HEIGHT=41;
${tabBar}
function App(){const[tabs,setTabs]=React.useState(Array.from({length:20},(_,i)=>({id:'/page/'+i,label:'Page '+i})));window.markTabs=()=>setTabs(current=>current.map(tab=>({...tab,isEditing:true,hasExternalChanges:true})));return <ThemeProvider theme={theme}><CssBaseline/><WorkspaceTabsBar currentPath={tabs[0]?.id||'/workspace'} tabsForRender={tabs} resolveRenderedTabLabel={tab=>tab.label} onTabChange={()=>{}} onCloseTab={(event,id)=>{window.closedTab=id;setTabs(current=>current.filter(tab=>tab.id!==id));}} onCloseAllTabs={()=>{window.closedAll=true;setTabs([]);}}/></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:600}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}?lang=${lang}`);
  const first=page.getByRole('tab').first();await first.focus();await first.press('Delete');await page.waitForFunction(()=>window.closedTab==='/page/0');await page.getByRole('tab').first().and(page.locator(':focus')).waitFor();assert.equal(await page.getByRole('tab').count(),19);
  const closeName=({ko:'탭 닫기',en:'Close tab',vi:'Đóng tab'})[lang];
  const close=page.getByRole('button',{name:closeName+': Page 1',exact:true});const before=await close.boundingBox();
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.evaluate(()=>{window.setTabBusy(true);window.markTabs();});await page.waitForTimeout(80);const after=await close.boundingBox();
  assert.ok(Math.abs(before.x-after.x)<1,'background refresh must not move the close button during activation');await page.mouse.up();await page.waitForFunction(()=>window.closedTab==='/page/1');assert.equal(await page.getByRole('tab').count(),18);
  const button=page.getByRole('button',{name:({ko:'모든 탭 닫기',en:'Close all tabs',vi:'Đóng tất cả các tab'})[lang],exact:true});await button.waitFor();
  const bounds=await button.boundingBox();assert.ok(bounds.x+ bounds.width<=width&&bounds.x>width-65,'close all remains at the far right with overflowing tabs');
  await page.getByRole('tab').first().press('Tab');await button.and(page.locator(':focus')).waitFor();await page.getByRole('tooltip').waitFor();await button.press('Enter');assert.equal(await page.evaluate(()=>window.closedAll),true);assert.equal(await page.getByRole('tab').count(),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: actual workspace tab bar renders without undefined components; ko/en/vi desktop/mobile close-all tooltip, position and click.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
