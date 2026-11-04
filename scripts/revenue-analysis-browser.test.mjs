import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {profitScenarioText} from '../frontend/src/constants/profitScenario.js';
import {calculateProfitScenario,trialProfitInputs} from '../frontend/src/utils/profitScenario.mjs';
import {formatCurrency} from '../frontend/src/utils/currencyFormat.js';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);assert.ok(executablePath);
const fixture=path.resolve('frontend/revenue-analysis-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Analysis from '/src/pages/App/RevenueAnalysis.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Analysis))));</script></body></html>`);
const port=43249,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/revenue-analysis-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  console.log('Checking profit analysis',lang,width);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const t=profitScenarioText[lang];let settings={revision:0,defaults:{},stylePackaging:{},scenarios:[]},rejectNextSave=false;
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/revenue-analysis/catalog?*',r=>r.fulfill({headers,json:{rows:[{key:'2:3',orderId:2,styleId:3,orderNumber:'ORDER-2',styleCode:'STYLE-3',customer:'Buyer',quantity:1000,salePrice:40000,currency:'VND',invoiceNumber:'INV-1'}]}}));
  await page.route('**/revenue-analysis/sources?*',r=>r.fulfill({headers,json:{times:{ST:600,PT:500},version:2,costs:[{id:'cost-1',date:'2026-11-04',description:'Outsource',code:{code:'OUT',nameEn:'Outsource'},currency:'VND',subtotal:'320000',amount:'352000',quantity:'1000',exact:true,approved:true,requestId:18}],averages:[{key:'avg-1',code:{code:'OUT',nameEn:'Outsource'},unit:{nameEn:'Piece'},partner:'Vendor',currency:'VND',quantity:1000,count:2,unitPrice:320}]}}));
  await page.route('**/revenue-analysis/scenarios?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   if(r.request().method()==='PUT'){if(rejectNextSave){rejectNextSave=false;return r.fulfill({headers,status:409,json:{error:'PROFIT_SETTINGS_CHANGED'}});}const body=r.request().postDataJSON();assert.equal(body.revision,settings.revision);writes.push(body);settings={...body,revision:body.revision+1};}
   return r.fulfill({headers,json:settings});
  });
  await page.goto(`http://127.0.0.1:${port}/revenue-analysis-acceptance.html`);
  const profit=page.locator('[data-profit-metric="profit"]');await profit.waitFor();assert.equal(await profit.textContent(),'—');assert.equal(writes.length,0);
  await page.getByRole('button',{name:t.trial,exact:true}).click();
  const expected=calculateProfitScenario(trialProfitInputs());assert.equal(await profit.textContent(),formatCurrency(expected.profit,{currencyCode:'VND',languageCode:lang}));
  await page.getByRole('button',{name:'120%',exact:true}).click();
  assert.equal(await page.locator('[data-profit-metric="hours"]').textContent(),calculateProfitScenario({...trialProfitInputs(),productivity:120}).workloadHours.toLocaleString(lang,{maximumFractionDigits:2}));
  await page.getByRole('button',{name:t.saveDefaults,exact:true}).click();await page.getByText(t.savedOk,{exact:true}).waitFor();assert.equal(settings.defaults.productivity,120);
  const choose=async(label,value)=>{await page.getByRole('combobox',{name:label,exact:false}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  await choose(t.order,'ORDER-2 · STYLE-3 · Buyer');
  await page.waitForFunction(label=>{const el=[...document.querySelectorAll('input')].find(el=>el.labels?.[0]?.textContent===label);return el&&!el.disabled&&el.value==='600';},t.stSeconds);
  await page.getByRole('spinbutton',{name:t.polyUsage,exact:true}).fill('2');
  await page.getByRole('button',{name:t.saveStyle,exact:true}).click();await page.getByText(t.savedOk,{exact:true}).waitFor();assert.equal(settings.stylePackaging['3'].polyUsage,'2');
  await choose(t.costMode,t.linked);assert.equal(await page.getByRole('checkbox',{name:t.packaging,exact:true}).isChecked(),false);
  assert.equal(await page.locator('[data-profit-metric="costDirect"]').textContent(),formatCurrency(320000,{currencyCode:'VND',languageCode:lang}));
  await page.getByRole('textbox',{name:t.name,exact:true}).fill('Saved scenario');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.savedOk,{exact:true}).waitFor();assert.equal(settings.scenarios[0].orderId,2);assert.equal(settings.scenarios[0].styleId,3);
  const storedProfit=await profit.textContent();await page.getByRole('button',{name:t.new,exact:true}).click();
  await choose(t.saved,'Saved scenario');await page.getByRole('spinbutton',{name:t.stSeconds,exact:true}).waitFor();
  await page.waitForFunction(label=>{const el=[...document.querySelectorAll('input')].find(el=>el.labels?.[0]?.textContent===label);return el&&!el.disabled;},t.stSeconds);
  assert.equal(await profit.textContent(),storedProfit);
  await choose(t.currency,'USD');assert.equal(await page.getByRole('spinbutton',{name:t.salePrice,exact:true}).inputValue(),'');assert.equal(await profit.textContent(),'—');
  rejectNextSave=true;await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.changed,{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:t.name,exact:true}).inputValue(),'Saved scenario');assert.equal(await page.getByRole('spinbutton',{name:t.quantity,exact:true}).inputValue(),'1000');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: missing data, trial math, productivity, linked costs, style packaging, company defaults, save/reload, currency isolation; ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
