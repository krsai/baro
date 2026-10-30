import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
import {ENTITY_TEXT} from '../frontend/src/constants/entityProfile.js';

const fixture=path.resolve('frontend/expense-payee-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Box} from '@mui/material';import theme from '/src/theme';import Picker from '/src/components/ExpensePayeePicker.jsx';
const options=[{id:11,code:'P001',name:'Vendor',type:'PROCESS_OUTSOURCING',isActive:true},{id:'EMP:31',employeeId:31,code:'E031',name:'Employee One',type:'EMPLOYEE',isActive:true,bankName:'Payroll bank',bankAccountNumber:'old-payroll'},{id:'EMP:32',employeeId:32,code:null,name:'No Code Employee',type:'EMPLOYEE',isActive:true},{id:12,code:'DUP',name:'Duplicate Vendor',type:'MATERIAL_SUPPLIER',isActive:true},{id:'EMP:33',employeeId:33,code:'DUP',name:'Duplicate Employee',type:'EMPLOYEE',isActive:true}];
function App(){const[value,setValue]=React.useState(null);window.currentPayee=value;return React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Box,{sx:{p:2,maxWidth:400}},React.createElement(Picker,{orgId:1,languageCode:new URLSearchParams(location.search).get('lang'),options,value,onChange:(row,accounts)=>{setValue(row);window.currentAccounts=accounts;},onSaved:()=>{}})));}createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`);
const port=43271,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-payee-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  const t=expenseHeaderActions[lang],b=ENTITY_TEXT[lang],headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};let employeeAccounts=[];
  await page.route('**/entities/11/bank-accounts?*',r=>r.fulfill({headers,json:{accounts:[{id:'vendor-bank',bankName:'Vendor Bank',accountNumber:'001',accountHolder:'Vendor',currencyCode:'USD'}]}}));
  await page.route('**/expense-payees/employees/*/bank-accounts?*',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='POST'){const body=r.request().postDataJSON();writes.push(body);employeeAccounts=[{id:'employee-bank',...body}];return r.fulfill({headers,json:employeeAccounts[0]});}return r.fulfill({headers,json:{accounts:r.request().url().includes('/31/')?employeeAccounts:[]}});});
  await page.goto(`http://127.0.0.1:${port}/expense-payee-acceptance.html?lang=${lang}`);
  const input=page.getByRole('combobox',{name:t.payee,exact:true});
  await page.getByRole('button',{name:t.choosePayee,exact:true}).click();let picker=page.getByRole('dialog');await picker.getByTestId('payee-details').waitFor();assert.equal(await picker.getByRole('button',{name:t.information,exact:true}).isDisabled(),true);assert.equal(await picker.getByRole('button',{name:t.apply,exact:true}).isDisabled(),true);await picker.getByRole('button',{name:t.cancel,exact:true}).click();
  await input.fill('P001');await page.waitForFunction(()=>window.currentPayee?.id===11);assert.equal(await page.getByRole('dialog').count(),0);
  await input.fill('DUP');await page.waitForFunction(()=>window.currentPayee===null);assert.equal(await page.getByRole('option').count(),2);
  await input.fill('E031');picker=page.getByRole('dialog');await picker.getByTestId('payee-details').getByText('Employee One',{exact:true}).waitFor();await picker.getByText(t.noAccount,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.currentPayee),null);
  await picker.getByRole('button',{name:t.information,exact:true}).click();const bank=page.getByRole('dialog').last();assert.equal(await bank.getByLabel(b.number,{exact:false}).inputValue(),'old-payroll');
  const currency=bank.getByRole('combobox');await currency.click();await page.getByRole('option',{name:'USD',exact:true}).click();await bank.getByLabel(b.number,{exact:false}).fill('new-expense-account');await bank.getByRole('button',{name:({ko:'저장',en:'Save',vi:'Lưu'})[lang],exact:true}).click();
  await picker.getByText('new-expense-account',{exact:true}).waitFor();await picker.getByRole('button',{name:t.apply,exact:true}).click();await page.waitForFunction(()=>window.currentPayee?.employeeId===31);assert.equal(writes[0].currencyCode,'USD');assert.equal(writes[0].accountNumber,'new-expense-account');assert.equal(await page.evaluate(()=>window.currentPayee.bankAccountNumber),'old-payroll');
  await input.fill('No Code');await page.getByRole('option').getByText('No Code Employee',{exact:false}).click();picker=page.getByRole('dialog');await picker.getByTestId('payee-details').getByText('No Code Employee',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await picker.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Payee lookup passed ko/en/vi: empty detail fields, exact and duplicate codes, code-free employee search, missing-bank modal, explicit employee bank registration and payroll preservation.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
