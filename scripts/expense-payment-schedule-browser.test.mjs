import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {expensePaymentText} from '../frontend/src/constants/expensePaymentSchedule.js';
const html='frontend/expense-payment-schedule-test.html',jsx='frontend/expense-payment-schedule-test.jsx';
writeFileSync(html,'<div id="root"></div><script type="module" src="/expense-payment-schedule-test.jsx"></script>');
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Stack,Button} from '@mui/material';import theme from '/src/theme';import Line from '/src/components/ExpenseRequestLine';import {ExpensePaymentScheduleView} from '/src/components/ExpensePaymentSchedule';import Grid from '/src/components/LedgerEntryGrid';import {syncSingleExpenseAllocations} from '/src/utils/ledgerExpenseAllocation.mjs';import {EXPENSE_REQUEST_TEXT} from '/src/constants/expenseRequest';import {newExpenseLine,expenseLinePayload} from '/src/utils/expenseRequest.mjs';import {paymentScheduleError} from '/src/utils/expensePaymentSchedule.mjs';
const lang=new URLSearchParams(location.search).get('lang');
function App(){const[items,setItems]=React.useState([1,2].map(index=>({...newExpenseLine(),key:'line'+index,currency:'VND',quantity:'1',unitPrice:'100000000',vatRate:'0'})));const[locked,setLocked]=React.useState(false);const[bank,setBank]=React.useState([{clientKey:'bank1',entryKind:'BANK',accountId:'account1',direction:'OUT',amount:'',purpose:'',accountingCodeId:'',evidenceType:'EXPENSE',expenseItems:[],document:{id:1,reference:'EXP-1',paymentSchedule:[{id:'advance1',expenseItemId:'cost1',label:'Advance',scheduledDate:'2026-11-30',currency:'VND',remaining:'40000000'}],items:[{id:'cost1',line:1,description:'Machine',remaining:'100000000'},{id:'cost2',line:2,description:'Rent',remaining:'5000000'}]}}]);const mutate=fn=>setBank(current=>syncSingleExpenseAllocations(fn(current)));window.bank=bank;window.items=items;window.serialized=items.map(expenseLinePayload);return <ThemeProvider theme={theme}><CssBaseline/><Stack spacing={2} sx={{p:2}}><table><tbody>{items.map((line,index)=><Line key={line.key} line={line} index={index} codes={[]} orders={[]} units={[]} settings={{}} orgId={1} labels={EXPENSE_REQUEST_TEXT[lang]} languageCode={lang} disabled={locked} onStatus={()=>{}} onChange={(key,patch)=>setItems(current=>current.map(item=>item.key===key?{...item,...patch}:item))}/>)}</tbody></table><Button onClick={()=>{window.errors=items.map(item=>paymentScheduleError(item.paymentSchedule,[{currency:item.currency,amount:'100000000'}]));}}>Validate</Button><Button onClick={()=>setLocked(value=>!value)}>Lock</Button><Grid rows={bank} accounts={[{id:'account1',currencyCode:'VND'}]} codes={[]} languageCode={lang} orgId={1} locked={locked} edit={(key,patch)=>mutate(current=>current.map(row=>row.clientKey===key?{...row,...patch}:row))} mutate={mutate}/><ExpensePaymentScheduleView languageCode={lang} rows={items[0].paymentSchedule.map(row=>({...row,paid:'0',remaining:row.amount}))}/></Stack></ThemeProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
const port=43291,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/${path.basename(html)}`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
  await page.goto(`http://127.0.0.1:${port}/${path.basename(html)}?lang=${lang}`,{timeout:45000});
  const t=expensePaymentText[lang],lines=page.getByTestId('expense-line'),editors=page.getByTestId('expense-payment-schedule');
  await lines.nth(0).getByTestId('expense-payment-mode').waitFor();assert.equal(await page.getByTestId('expense-line-payment-details').count(),0);assert.equal(await lines.getByRole('combobox',{name:t.mode}).count(),2);
  await lines.nth(0).getByRole('combobox',{name:t.mode}).click();await page.getByRole('option',{name:t.split,exact:true}).click();
  await editors.nth(0).getByRole('textbox',{name:t.label,exact:true}).first().waitFor();
  assert.equal(await page.getByTestId('expense-line-payment-details').count(),1);assert.equal(await lines.nth(1).getByRole('combobox',{name:t.mode}).textContent(),t.single);assert.equal(await page.getByRole('combobox',{name:t.mode}).count(),2);
  await editors.nth(0).getByLabel(t.date,{exact:true}).nth(0).fill('2026-11-30');await editors.nth(0).getByLabel(t.date,{exact:true}).nth(1).fill('2026-12-10');
  await editors.nth(0).getByRole('textbox',{name:t.amount,exact:true}).nth(0).fill('40000000');await editors.nth(0).getByRole('textbox',{name:t.amount,exact:true}).nth(1).fill('60000000');
  const originalIds=await page.evaluate(()=>window.items[0].paymentSchedule.map(row=>row.id));await editors.nth(0).getByRole('button',{name:t.add,exact:true}).first().click();
  assert.equal(await page.evaluate(()=>window.items[0].paymentSchedule.length),3);assert.equal(await page.evaluate(()=>window.items[0].paymentSchedule[2].id),originalIds[1]);await editors.nth(0).getByRole('button',{name:t.remove,exact:true}).nth(1).click();assert.deepEqual(await page.evaluate(()=>window.items[0].paymentSchedule.map(row=>row.id)),originalIds);assert.equal(await editors.nth(0).getByRole('button',{name:t.remove,exact:true}).first().isDisabled(),true);
  await page.getByRole('button',{name:'Validate',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.errors),[null,null]);
  assert.equal(await page.evaluate(()=>window.serialized[0].paymentSchedule.length),2);assert.equal(await page.evaluate(()=>window.serialized[1].paymentSchedule.length),0);
  await page.getByRole('combobox',{name:new RegExp('^'+t.select)}).click();await page.getByRole('option',{name:/#1.*Advance/}).click();
  assert.equal(await page.evaluate(()=>window.bank[0].paymentScheduleId),'advance1');assert.equal(await page.evaluate(()=>window.bank[0].expenseItems[0].itemId),'cost1');assert.equal(await page.evaluate(()=>window.bank[0].amount),'40000000');
  await page.getByRole('combobox',{name:new RegExp('^'+t.select)}).click();await page.getByRole('option',{name:new RegExp('#2.*'+t.single)}).click();assert.equal(await page.evaluate(()=>window.bank[0].expenseItems[0].itemId),'cost2');assert.equal(await page.evaluate(()=>window.bank[0].paymentScheduleId),'');
  await page.getByRole('button',{name:'Lock',exact:true}).click();assert.equal(await editors.nth(0).getByRole('textbox',{name:t.amount,exact:true}).first().isDisabled(),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Expense item payment schedules: ko/en/vi, desktop/mobile, independent modes, exact totals, payload and read-only state passed.');
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
