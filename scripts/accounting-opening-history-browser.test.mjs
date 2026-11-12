import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {accountingOpeningHistoryText} from '../frontend/src/constants/accountingOpeningHistory.js';
import {accountingOpeningText} from '../frontend/src/constants/accountingOpening.js';
import {ledgerBalanceText} from '../frontend/src/constants/ledgerBalance.js';
import {payrollPayableText} from '../frontend/src/constants/payrollPayable.js';
import {changeApprovalText} from '../frontend/src/constants/changeApprovals.js';
const file=path.resolve('frontend/opening-history-acceptance.html'),entry=file.replace('.html','.jsx');assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Balance from'/src/components/LedgerBalanceDialog';createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Balance orgId={1} languageCode={new URLSearchParams(location.search).get('lang')} onClose={()=>window.closedBalance=true}/></ThemeProvider>);`);
writeFileSync(file,'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/opening-history-acceptance.jsx"></script></body></html>');
const port=43327,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/opening-history-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const t=accountingOpeningHistoryText[lang],o=accountingOpeningText[lang],b=ledgerBalanceText[lang],c=changeApprovalText[lang];
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],voids=[],approvals=[];let failLoad=true,deleted=false,pending=false;
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/hooks/useUnsavedChanges.js*',r=>r.fulfill({contentType:'application/javascript',body:'export default function(){}'}));
  await page.route('**/*',r=>{
   const url=new URL(r.request().url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
   const json=value=>r.fulfill({headers,json:value});
   if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(url.pathname==='/bank-ledger/accounts')return json({accounts:[{id:'a',displayName:'Cash',currencyCode:'USD',currentBalance:'9.00'}]});
   if(url.pathname==='/transaction-codes')return json([]);
   if(url.pathname==='/bank-ledger/opening')return json({documents:[],parties:[],history:[],hasMore:false});
   if(url.pathname==='/bank-ledger/opening/history'){
    if(failLoad){failLoad=false;return r.fulfill({headers,status:503,json:{error:'temporary'}});}
    const base={date:'2026-11-02',side:'AR',party:'THE SAN',code:'SALE',currencyCode:'USD',amount:'53643.90',remaining:'0.00',matched:false,reason:'Collected before management'};
    return json({rows:url.searchParams.get('page')==='1'?[]:[{...base,id:'prior',source:'ARAP',reference:'INV-2026-000001',treatment:'SETTLED',voidedAt:deleted?'2026-11-12':null},{...base,id:'account',source:'ACCOUNT',side:'ACCOUNT',party:'Cash',reference:'',treatment:'ACCOUNT',amount:'-12.34',remaining:null,changePending:pending},{...base,id:'matched',source:'ARAP',reference:'MATCHED-BILL',treatment:'REPLACED',amount:'100',remaining:'60',matched:true}],hasMore:url.searchParams.get('page')!=='1'});
   }
   if(url.pathname==='/bank-ledger/opening/prior/void'){
    voids.push(r.request().postDataJSON());if(voids.length===1)return r.fulfill({headers,status:503,json:{error:'temporary'}});deleted=true;return json({id:'prior'});
   }
   if(url.pathname==='/approval-action-settings')return json({grades:[]});
   if(url.pathname==='/change-approval-preview')return json({complete:true,policy:{totals:[]},stages:[],drafter:{name:'Admin'}});
   if(url.pathname==='/change-approval-requests'){approvals.push(r.request().postDataJSON());pending=true;return json({id:'request',status:'PENDING'});}
   return r.fallback();
  });
  await page.goto(`http://127.0.0.1:${port}/opening-history-acceptance.html?lang=${lang}`);
  await page.getByLabel(b.actual+' Cash',{exact:true}).fill('11');await page.getByLabel(b.reason,{exact:false}).fill('Account draft');
  assert.equal(await page.getByLabel(b.date,{exact:true}).evaluate(el=>!!el.closest('.MuiDialogTitle-root')),true);
  await page.getByRole('tab',{name:o.arapTab,exact:true}).click();
  const panel=page.locator('[data-accounting-opening]');await panel.locator('[data-opening-input] input').first().waitFor();
  assert.equal(await page.getByRole('button',{name:payrollPayableText[lang].importPayroll,exact:true}).count(),0);assert.equal(await page.getByText(o.hint,{exact:true}).count(),0);assert.equal(await page.getByText(b.hint,{exact:true}).count(),0);
  assert.equal(await page.getByLabel(b.reason,{exact:false}).evaluate(el=>!!el.closest('tbody tr')),true);
  await panel.getByLabel(o.amount,{exact:true}).fill('77');await page.getByLabel(b.reason,{exact:false}).fill('AR draft');
  await page.getByRole('tab',{name:o.history,exact:true}).click();
  const history=page.locator('[data-opening-history]');await history.getByRole('alert').waitFor();await history.getByRole('button',{name:b.reload,exact:true}).click();await history.getByText('INV-2026-000001',{exact:true}).waitFor();
  assert.equal(await history.getByRole('columnheader').count(),12);assert.equal(await page.getByRole('button',{name:o.saveAr,exact:true}).count(),0);
  const prior=history.locator('tbody tr').filter({hasText:'INV-2026-000001'}),account=history.locator('tbody tr').filter({hasText:'Cash'});
  assert.equal(await prior.locator('td').nth(4).innerText(),'INV-2026-000001');assert.equal(await prior.locator('td').nth(5).innerText(),t.SETTLED);assert.equal(await prior.locator('td').nth(9).innerText(),'Collected before management');assert.equal(await prior.locator('td').nth(8).innerText(),'$0.00');
  assert.match(await account.locator('td').nth(7).innerText(),/12\.34/);assert.equal(await account.locator('td').nth(8).innerText(),'—');
  assert.equal(await history.locator('tbody tr').filter({hasText:'MATCHED-BILL'}).getByRole('button',{name:t.remove,exact:true}).isDisabled(),true);
  await prior.getByRole('button',{name:t.remove,exact:true}).click();await page.getByLabel(t.removeReason,{exact:false}).fill('Duplicate entry');
  await page.getByRole('button',{name:t.confirm,exact:true}).click();await page.getByText(b.uncertain,{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:o.accountTab,exact:true,includeHidden:true}).isDisabled(),true);
  await page.getByRole('button',{name:b.retry,exact:true}).click();await prior.getByText(t.deleted,{exact:true}).waitFor();assert.deepEqual(voids[0],voids[1]);
  await account.getByRole('button',{name:t.remove,exact:true}).click();await page.getByLabel(c.reason,{exact:false}).fill('Wrong balance');await page.getByRole('button',{name:c.request,exact:true}).click();await account.getByText(t.pending,{exact:true}).waitFor();
  assert.equal(approvals[0].menu,'BANK_LEDGER');assert.equal(approvals[0].operation,'DELETE');assert.equal(approvals[0].sourceId,'account');
  await history.getByRole('button',{name:t.next,exact:true}).click();await history.getByText(t.empty,{exact:true}).waitFor();await history.getByRole('button',{name:t.previous,exact:true}).click();await history.getByText('INV-2026-000001',{exact:true}).waitFor();
  await page.getByRole('tab',{name:o.accountTab,exact:true}).click();assert.equal(await page.getByLabel(b.actual+' Cash',{exact:true}).inputValue(),'11');assert.equal(await page.getByLabel(b.reason,{exact:false}).inputValue(),'Account draft');
  await page.getByRole('tab',{name:o.arapTab,exact:true}).click();assert.equal(await panel.getByLabel(o.amount,{exact:true}).inputValue(),'77');assert.equal(await page.getByLabel(b.reason,{exact:false}).inputValue(),'AR draft');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS opening history ko/en/vi desktop/mobile: unified columns, separate reference/treatment/reason, load retry, deletion approval, audited reversal retry, pagination and draft preservation.');
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
