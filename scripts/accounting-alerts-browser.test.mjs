import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {accountingAlertText} from '../frontend/src/constants/accountingAlerts.js';
const html='frontend/accounting-alerts-test.html',jsx='frontend/accounting-alerts-test.jsx',port=43474;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/accounting-alerts-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Alerts from'/src/components/AccountingAlerts';function Demo(){const[org,setOrg]=React.useState(2),[settings,setSettings]=React.useState({});window.switchOrg=setOrg;window.changeSettings=setSettings;return <ThemeProvider theme={theme}><CssBaseline/><Alerts key={org} orgId={org} settings={settings} languageCode={new URLSearchParams(location.search).get('lang')} showEmpty onNavigate={path=>window.destination=path}/></ThemeProvider>;}createRoot(document.getElementById('root')).render(<Demo/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/accounting-alerts-test.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,430]){
  const page=await browser.newPage({viewport:{width,height:900}}),text=accountingAlertText[lang],errors=[],reads=[],acks=[];let failLoad=true,failAck=true;
  page.on('pageerror',error=>errors.push(error.message));
  const values={2:[{signature:'a'.repeat(64),kind:'DIRECTION',sourceKind:'LEDGER',sourceId:'1',date:'2026-11-11',path:'/bank-ledger/edit/1',code:'INCE',partyName:'Scoped partner',expectedDirection:'IN',actualDirection:'OUT'},{signature:'b'.repeat(64),kind:'PARTNER_INDUSTRY',sourceKind:'EXPENSE',sourceId:'2',date:'2026-11-11',path:'/outsourcing-record/edit/request/2',code:'CODE',partyName:'Scoped partner'}],3:[]};
  await page.route(/\/dashboard\/accounting-alerts(?:\/acknowledge)?\?/,async r=>{const request=r.request(),url=new URL(request.url()),org=Number(url.searchParams.get('orgId')),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};assert.ok([2,3].includes(org));if(request.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(request.method()==='POST'){const body=request.postDataJSON();assert.deepEqual(Object.keys(body),['signature']);acks.push(body.signature);if(failAck){failAck=false;return r.fulfill({headers,status:409,json:{error:'ACCOUNTING_ALERT_CHANGED'}});}values[org]=values[org].filter(row=>row.signature!==body.signature);return r.fulfill({headers,json:{acknowledged:true}});}
   reads.push(Object.fromEntries(url.searchParams));if(failLoad){failLoad=false;return r.fulfill({headers,status:500,json:{error:'TEST_LOAD'}});}const rows=values[org].filter(row=>url.searchParams.get('kinds').split(',').includes(row.kind));return r.fulfill({headers,json:{rows,total:rows.length,page:0}});
  });
  await page.goto('http://127.0.0.1:'+port+'/accounting-alerts-test.html?lang='+lang);await page.getByRole('alert').waitFor();assert.equal(await page.getByText(text.empty,{exact:true}).count(),0);await page.getByRole('button',{name:text.retry,exact:true}).click();
  const direction=page.locator('[data-accounting-alert="DIRECTION"]'),industry=page.locator('[data-accounting-alert="PARTNER_INDUSTRY"]');await direction.waitFor();await industry.waitFor();await direction.getByRole('button').first().click();assert.equal(await page.evaluate(()=>window.destination),'/bank-ledger/edit/1');
  const refreshed=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/dashboard/accounting-alerts'));await direction.getByRole('button',{name:text.confirm,exact:true}).click();await refreshed;await page.waitForFunction(()=>document.querySelectorAll('[data-accounting-alert]').length===2&&!document.querySelector('[data-accounting-alert] button:last-child').disabled);await direction.getByRole('button',{name:text.confirm,exact:true}).click();await direction.waitFor({state:'hidden'});assert.equal(acks.length,2);
  await industry.getByRole('button',{name:text.confirm,exact:true}).click();await page.getByText(text.empty,{exact:true}).waitFor();
  const filtered=page.waitForResponse(response=>new URL(response.url()).searchParams.get('kinds')==='PARTNER_INDUSTRY');await page.evaluate(()=>window.changeSettings({'accounting-direction':false}));await filtered;assert.equal(reads.at(-1).kinds,'PARTNER_INDUSTRY');
  const switched=page.waitForResponse(response=>new URL(response.url()).searchParams.get('orgId')==='3');await page.evaluate(()=>window.switchOrg(3));await switched;await page.getByText(text.empty,{exact:true}).waitFor();assert.equal(await page.getByText('Scoped partner',{exact:false}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS accounting alerts: ko/en/vi desktop/mobile, both kinds, failed load retry, stale acknowledgement retry, navigation, settings and isolated company switches.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
