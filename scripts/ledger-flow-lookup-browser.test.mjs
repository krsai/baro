import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {ledgerFlowText} from '../frontend/src/constants/ledgerFlow.js';
import {PARTNER_CLASSIFICATION_TEXT} from '../frontend/src/utils/partnerClassification.mjs';

const html='frontend/ledger-flow-lookup-test.html',jsx='frontend/ledger-flow-lookup-test.jsx',port=43498;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/ledger-flow-lookup-test.jsx"></script></html>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Field from'/src/components/LedgerFlowField';const role={id:1,nameKo:'유통',nameEn:'Distribution',nameVi:'Phân phối'},industry={id:2,partnerRoleId:1,partnerRole:role,nameKo:'장비',nameEn:'Equipment',nameVi:'Thiết bị'},classification={roleIds:[1],industryIds:[2],industries:[industry]};const options=[{kind:'PARTNER',id:11,code:'THRE',name:'NGUYEN THI MINH NGUYET',classification},{kind:'EMPLOYEE',id:12,employeeNo:'EMP001',name:'Other employee'}];function Demo(){const account={id:'own',entityAccountId:'bank',displayName:'Own bank',currencyCode:'VND'},[row,setRow]=React.useState({entryKind:'BANK',evidenceType:'FILE',accountId:'own',direction:'OUT',counterparty:options[0]});window.row=row;return <ThemeProvider theme={theme}><CssBaseline/><Field side="to" row={row} account={account} accounts={[account]} options={options} languageCode={new URLSearchParams(location.search).get('lang')} onChange={patch=>setRow(r=>({...r,...patch}))}/></ThemeProvider>;}createRoot(document.getElementById('root')).render(<Demo/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ledger-flow-lookup-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],text=ledgerFlowText[lang],labels=PARTNER_CLASSIFICATION_TEXT[lang];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/ledger-flow-lookup-test.html?lang=${lang}`);
  const input=page.getByRole('textbox',{name:text.to,exact:true});assert.equal(await input.inputValue(),'THRE / NGUYEN THI MINH NGUYET');
  await page.getByRole('button').click();const dialog=page.getByRole('dialog');await dialog.getByRole('cell',{name:'THRE',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('textbox').inputValue(),'THRE / NGUYEN THI MINH NGUYET');
  await dialog.getByRole('columnheader',{name:labels.category,exact:true}).waitFor();await dialog.getByRole('columnheader',{name:labels.industry,exact:true}).waitFor();
  await dialog.getByRole('cell',{name:{ko:'유통',en:'Distribution',vi:'Phân phối'}[lang],exact:true}).waitFor();
  await dialog.getByRole('cell',{name:{ko:'장비',en:'Equipment',vi:'Thiết bị'}[lang],exact:true}).waitFor();
  for(const query of ['THRE','NGUYEN THI MINH NGUYET','THRE / NGUYEN THI MINH NGUYET']){await dialog.getByRole('textbox').fill(query);await dialog.getByRole('cell',{name:'THRE',exact:true}).waitFor();}
  await dialog.getByRole('row').filter({hasText:'THRE'}).getByRole('button').click();await dialog.waitFor({state:'hidden'});
  assert.equal((await page.evaluate(()=>window.row.counterparty)).id,11);
  await input.fill('TH');await input.press('Enter');await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await input.fill('THRE');await input.press('Tab');assert.equal(await input.inputValue(),'THRE / NGUYEN THI MINH NGUYET');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS ledger flow lookup: selected code/name finds itself, code/name searches, category and industry columns, partial confirmation and exact Tab; ko/en/vi desktop/mobile.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
