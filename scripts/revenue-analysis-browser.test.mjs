import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {revenueUxText} from '../frontend/src/constants/revenueUx.js';
import {revenueSelectionText} from '../frontend/src/constants/revenueSelection.js';
import {orderProfitText} from '../frontend/src/constants/orderProfit.js';
import {profitScenarioText} from '../frontend/src/constants/profitScenario.js';
import {orderCostDefaults,orderStyleProfit,orderProfitTotals} from '../frontend/src/utils/orderProfit.mjs';
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
  console.log('Checking saved-order profit analysis',lang,width);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const t=orderProfitText[lang],p=profitScenarioText[lang],u=revenueUxText[lang],s=revenueSelectionText[lang],rates={USD:'1',VND:'25000',KRW:'1300'};
  const common={...orderCostDefaults(),baseMonthly:'',allowanceMonthly:'',supportMonthly:'',rentMonthly:20000000,workdays:25};
  const laborBasis={id:1,name:'Factory payroll',currencyCode:'VND',directCount:10,employeeCount:12,supportCount:2,baseHourly:30000,allowanceHourly:5000,supportHourly:45000,productionPerSecond:0,versionNumber:1};
  laborBasis.company={employeeCount:100,activeCount:100,excludedCount:0,unresolvedCount:0,counts:{GENERAL:10,OUTPUT_FIXED:30,OUTPUT:60},pools:[{currencyCode:'VND',officeFixedMonthly:30000000,productionFixedMonthly:60000000,variableBaseMonthly:90000000,variableAllowanceMonthly:15000000,variableProductionMonthly:30000000}]};
  let settings={revision:0,defaults:common,stylePackaging:{},scenarios:[]},reject=false;
  const order={id:2,orderNumber:'SAVED-ORDER-2',customer:'Buyer',quantity:300,styleCount:2,salesAmount:'3000',currency:'USD',priceSource:'CURRENT_PRICE'};
  const costs=[{id:'cost-A',exact:true,approved:true,subtotal:'300000',amount:'330000',currency:'VND',requestId:18,reference:'EXP-18',description:'Outsourcing A'},{id:'cost-B',exact:true,approved:true,subtotal:'100000',amount:'110000',currency:'VND',requestId:19,reference:'EXP-19',description:'Outsourcing B'}];
  const styles=[{styleId:3,styleCode:'STYLE-A',styleName:'First style',quantity:100,salesAmount:1000,salePrice:10,currency:'USD',sources:{times:{ST:600,PT:500},averages:[],costs:costs.map((row,index)=>({...row,exact:index===0}))}},{styleId:4,styleCode:'STYLE-B',styleName:'Second style',quantity:200,salesAmount:2000,salePrice:10,currency:'USD',sources:{times:{ST:300,PT:null},averages:[],costs:costs.map((row,index)=>({...row,exact:index===1}))}}];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:7});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/revenue-analysis/catalog?*',r=>r.fulfill({headers,json:{orders:[order,{...order,id:5,orderNumber:'SAVED-ORDER-5',styleCount:0,salesAmount:null}],rows:[]}}));
  await page.route('**/revenue-analysis/orders/*?*',r=>{assert.equal(r.request().method(),'GET');const id=Number(new URL(r.request().url()).pathname.split('/').at(-1));return r.fulfill({headers,json:id===2?{order,styles}:{order:{...order,id:5,orderNumber:'SAVED-ORDER-5',salesAmount:null},styles:[]}});});
  await page.route('**/revenue-analysis/labor-basis?*',r=>r.fulfill({headers,json:{factories:[laborBasis],company:laborBasis.company}}));
  await page.route('**/revenue-analysis/styles?*',r=>r.fulfill({headers,json:{styles:[{id:3,code:'STYLE-A',name:'First style',customer:'Buyer'}]}}));
  await page.route('**/revenue-analysis/style-analysis?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   const body=r.request().postDataJSON();assert.equal(body.styleId,3);assert.ok(body.quantity>0);
   return r.fulfill({headers,json:{order:{id:null,orderNumber:'STYLE-A',customer:'Buyer',quantity:body.quantity,currency:'USD',salesAmount:body.quantity*12,analysisMode:'STYLE'},styles:[{...styles[0],quantity:body.quantity,salePrice:12,salesAmount:body.quantity*12,analysisMode:'STYLE',sources:{times:{ST:400,PT:350},costs:[],averages:[],estimatedPurchases:[{currency:'VND',unitCost:300,quantityBasis:1000,orderCount:2}]}}]}});
  });
  await page.route('**/revenue-analysis/exchange-rates?*',r=>r.fulfill({headers,json:{rates,date:'2026-11-04'}}));
  await page.route('**/revenue-analysis/scenarios?*',r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({headers});
   if(r.request().method()==='PUT'){if(reject){reject=false;return r.fulfill({headers,status:409,json:{error:'PROFIT_SETTINGS_CHANGED'}});}const body=r.request().postDataJSON();assert.equal(body.revision,settings.revision);writes.push(body);settings={...body,revision:body.revision+1};}
   return r.fulfill({headers,json:settings});
  });
  const totalMoney=value=>formatCurrency(value,{currencyCode:'VND',languageCode:lang});
  await page.goto(`http://127.0.0.1:${port}/revenue-analysis-acceptance.html`);
  await page.locator('[data-style-id="4"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-order-metric="profit"]')?.textContent!=='—');
  assert.equal(await page.locator('[data-style-id]').count(),2);assert.equal(writes.length,0);
  const expected=orderProfitTotals(styles.map(style=>orderStyleProfit(style,common,{},undefined,rates,laborBasis)));
  assert.equal(await page.locator('[data-order-metric="sales"]').textContent(),totalMoney(75000000));
  assert.equal(await page.locator('[data-order-metric="purchase"]').textContent(),totalMoney(400000));
  assert.equal(await page.locator('[data-order-metric="profit"]').textContent(),totalMoney(expected.profit));
  assert.equal(await page.locator('[data-profit-totals]').count(),1);await page.getByText(`${s.office} 10 ${s.people}`,{exact:true}).waitFor();await page.getByText(`${s.productionFixed} 30 ${s.people}`,{exact:true}).waitFor();await page.getByText(`${s.productionVariable} 60 ${s.people}`,{exact:true}).waitFor();
  assert.equal(await page.getByRole('spinbutton',{name:p.quantity,exact:true}).count(),0);assert.equal(await page.getByRole('spinbutton',{name:p.salePrice,exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:p.trial,exact:true}).count(),0);
  const choose=async(name,value)=>{await page.getByRole('combobox',{name,exact:false}).click();await page.getByRole('option',{name:value,exact:true}).click();};
  await page.getByRole('spinbutton',{name:p.productivity,exact:true}).fill('120');
  const faster=orderProfitTotals(styles.map(style=>orderStyleProfit(style,{...common,productivity:120},{},undefined,rates,laborBasis)));
  assert.equal(await page.locator('[data-order-metric="days"]').textContent(),faster.days.toLocaleString(lang,{maximumFractionDigits:2}));
  await choose(p.basis,'PT');assert.equal(await page.locator('[data-order-metric="profit"]').textContent(),'—');
  await page.locator('[data-style-id="4"]').getByRole('button',{name:t.detail,exact:true}).click();
  await page.getByRole('spinbutton',{name:p.ptSeconds,exact:true}).fill('250');assert.notEqual(await page.locator('[data-order-metric="profit"]').textContent(),'—');
  await page.getByRole('button',{name:t.close,exact:true}).click();
  await page.getByRole('button',{name:u.costBasis,exact:true}).click();
  const salaryBefore=await page.locator('[data-order-metric="salary"]').textContent();
  await page.getByRole('spinbutton',{name:p.rentMonthly,exact:true}).fill('');
  assert.equal(await page.locator('[data-order-metric="profit"]').textContent(),'—');assert.equal(await page.locator('[data-order-metric="salary"]').textContent(),salaryBefore);
  await page.getByRole('spinbutton',{name:p.rentMonthly,exact:true}).fill('20000000');
  await page.getByRole('spinbutton',{name:t.usdVnd,exact:true}).fill('26000');assert.equal(await page.locator('[data-order-metric="sales"]').textContent(),totalMoney(78000000));
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.saved,{exact:true}).waitFor();
  assert.equal(settings.defaults.productivity,'120');assert.equal(settings.scenarios[0].orderId,2);assert.equal(settings.scenarios[0].styleId,4);assert.equal(settings.scenarios[0].inputs.ptSeconds,'250');
  assert.notEqual(await page.locator('[data-order-metric="salary"]').textContent(),'?');
  const storedProfit=await page.locator('[data-order-metric="profit"]').textContent();
  await page.reload();await page.locator('[data-style-id="4"]').waitFor();await page.waitForFunction(()=>document.querySelector('[data-order-metric="profit"]')?.textContent!=='—');assert.equal(await page.locator('[data-order-metric="profit"]').textContent(),storedProfit);
  reject=true;await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByText(t.changed,{exact:true}).waitFor();assert.equal(await page.getByRole('spinbutton',{name:p.productivity,exact:true}).inputValue(),'120');
  await page.getByRole('button',{name:s.choose,exact:true}).click();
  const picker=page.getByRole('dialog',{name:s.title});await picker.getByRole('tab',{name:s.styles,exact:true}).click();
  await picker.locator('[data-style-option="3"]').click();assert.equal(await picker.getByRole('button',{name:s.apply,exact:true}).isDisabled(),true);
  await picker.getByRole('spinbutton',{name:s.quantity,exact:true}).fill('500');await picker.getByRole('button',{name:s.apply,exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-style-id]').length===1);assert.equal(await page.locator('[data-order-metric="sales"]').textContent(),totalMoney(156000000));assert.equal(await page.locator('[data-order-metric="purchase"]').textContent(),totalMoney(150000));
  await page.getByRole('button',{name:s.choose,exact:true}).click();await picker.getByRole('spinbutton',{name:s.quantity,exact:true}).fill('1000');await picker.getByRole('button',{name:s.apply,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-profit-totals]')?.textContent.includes('1,000')||document.querySelector('[data-profit-totals]')?.textContent.includes('1.000'));
  assert.equal(await page.locator('[data-order-metric="sales"]').textContent(),totalMoney(312000000));assert.equal(await page.locator('[data-order-metric="purchase"]').textContent(),totalMoney(300000));
  await page.getByRole('button',{name:s.choose,exact:true}).click();await picker.getByRole('tab',{name:s.orders,exact:true}).click();await picker.locator('[data-order-option="5"]').click();await picker.getByRole('button',{name:s.apply,exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-style-id]').length===0);assert.equal(await page.locator('[data-order-metric="sales"]').textContent(),'—');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: saved orders drive all styles, quantities and sales; automatic purchases, shared cost assumptions, periods, FX, missing PT, save/reload and conflicts; ko/en/vi desktop/mobile.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
