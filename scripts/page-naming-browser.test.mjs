import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {PAGE_ROUTES} from '../frontend/src/utils/pageNaming.mjs';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/page-naming-acceptance.html');assert.ok(!existsSync(fixture));
const modulePath=path.resolve('frontend/page-naming-fixture.jsx');assert.ok(!existsSync(modulePath));
writeFileSync(fixture,'<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/page-naming-fixture.jsx"></script></body></html>');
writeFileSync(modulePath,`
import React from 'react';import {createRoot} from 'react-dom/client';
import {LanguageProvider,useLanguage} from '/src/context/LanguageContext.jsx';
import {PageNamingProvider} from '/src/context/PageNamingContext.jsx';
import AppPageContainer from '/src/components/AppPageContainer.jsx';
import PageSectionHeader from '/src/components/PageSectionHeader.jsx';
import {resolvePageNaming} from '/src/utils/pageNaming.mjs';
import {getUiMessage} from '/src/constants/uiMessages.js';
function App(){const{languageCode,setLanguageCode}=useLanguage();const[paths,setPaths]=React.useState(['/outsourcing-record','/outsourcing-record/new']),[active,setActive]=React.useState(0);window.setScreen=(path)=>{setPaths(current=>[current[0],path]);setActive(1)};
const title=path=>resolvePageNaming(path,languageCode,key=>getUiMessage(key,key,languageCode))?.title;
return <><nav>{['ko','en','vi'].map(lang=><button key={lang} onClick={()=>setLanguageCode(lang)}>{lang}</button>)}{paths.map((path,index)=><button key={index} role="tab" data-testid={'tab-'+index} onClick={()=>setActive(index)}>{title(path)}</button>)}</nav>{paths.map((path,index)=><section key={index} data-testid={'screen-'+index} style={{display:active===index?'block':'none'}}><PageNamingProvider path={path}><AppPageContainer title="Legacy inconsistent title" description="Record context"><input aria-label="Draft" defaultValue=""/><PageSectionHeader title="An inner section"/><AppPageContainer><span>Embedded without heading</span></AppPageContainer></AppPageContainer></PageNamingProvider></section>)}<section data-testid="custom-header"><PageNamingProvider path="/work-history/new"><AppPageContainer header={<PageSectionHeader title="Old custom heading" titleComponent="h1"/>}/></PageNamingProvider></section></>};createRoot(document.getElementById('root')).render(<LanguageProvider><App/></LanguageProvider>);
`);
const port=43211,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/page-naming-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/page-naming-acceptance.html`);
  for(const lang of ['ko','en','vi']){
    await page.getByRole('button',{name:lang,exact:true}).click();
    for(const route of [...PAGE_ROUTES.map(row=>row[0]),'/outsourcing-record/new','/outsourcing-record/edit/request/17','/order/new','/order/12','/style/12','/work-history/12','/attendance/1/2026-10-21','/invoices/new?revision=2','/production-analysis/2026-10/1/2']){
      await page.evaluate(route=>window.setScreen(route),route);
      const screen=page.getByTestId('screen-1');
      await page.waitForFunction(()=>document.querySelector('[data-testid="screen-1"] h1')?.textContent===document.querySelector('[data-testid="tab-1"]')?.textContent);
      assert.equal(await screen.getByRole('heading',{level:1}).count(),1);
      assert.equal(await screen.getByRole('heading',{name:'An inner section',exact:true}).count(),1);
      assert.ok(!(await screen.getByRole('heading',{level:1}).innerText()).includes('menu.'));
    }
  }
  await page.getByRole('button',{name:'ko',exact:true}).click();
  await page.evaluate(()=>window.setScreen('/outsourcing-record/edit/request/17'));
  await page.getByTestId('screen-1').getByLabel('Draft').fill('unsaved value');
  await page.getByTestId('tab-0').click();
  assert.equal(await page.getByTestId('screen-0').getByRole('heading',{level:1}).innerText(),'비용 신청 목록');
  await page.getByRole('button',{name:'en',exact:true}).click();
  await page.getByTestId('tab-1').click();
  assert.equal(await page.getByTestId('screen-1').getByRole('heading',{level:1}).innerText(),'Edit Payment Request');
  assert.equal(await page.getByTestId('screen-1').getByLabel('Draft').inputValue(),'unsaved value');
  assert.equal(await page.getByTestId('custom-header').getByRole('heading',{level:1}).innerText(),'Create Work Logs');
  assert.deepEqual(errors,[]);
  console.log('Screen naming passed: every registered screen in ko/en/vi, matching tabs and h1 headings, isolated embedded/section headers, cached drafts and language switching.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);unlinkSync(modulePath);}
