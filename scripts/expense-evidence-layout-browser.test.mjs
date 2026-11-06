import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {ledgerEvidenceText} from '../frontend/src/constants/ledgerEvidence.js';
const fixture=path.resolve('frontend/expense-evidence-acceptance.html'),entry=fixture.replace('.html','.jsx');
assert.ok(!existsSync(fixture)&&!existsSync(entry));
writeFileSync(fixture,'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/expense-evidence-acceptance.jsx"></script></body></html>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Table,TableBody}from'@mui/material';import theme from'/src/theme';import Line from'/src/components/ExpenseRequestLine';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest';
const languageCode=new URLSearchParams(location.search).get('lang'),code={id:7,code:'LOGV',nameEn:'Logistics',vatEnabled:true,cashDirection:'OUT',base:{entryMode:'GENERAL',nameEn:'Logistics',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',requiredFields:['transportDate','origin','destination']}};
function App(){const[line,setLine]=React.useState({key:'one',transactionCodeId:7,currency:'VND',quantity:'1',unitPrice:'100',vatRate:'10',styleProcessIds:[],workOrderId:'',styleId:'',details:{reference:'MJ-001',transportDate:'2026-11-03',origin:'SHANGHAI',destination:'HAI PHONG'},enabled:{}}),[valid,setValid]=React.useState(false);window.line=line;return <ThemeProvider theme={theme}><CssBaseline/><Table><TableBody><Line line={line} index={0} codes={[code]} orders={[]} settings={{defaultVatRate:'10'}} orgId={1} labels={EXPENSE_REQUEST_TEXT[languageCode]} languageCode={languageCode} onChange={(_,patch)=>setLine(current=>({...current,...patch}))} onStatus={React.useCallback((_,state)=>setValid(state),[])} onRemove={()=>{}} onAdd={()=>{}}/></TableBody></Table><output>{String(valid)}</output></ThemeProvider>;}createRoot(document.getElementById('root')).render(<App/>);`);
const port=43317,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-evidence-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi']){
  const page=await browser.newPage({viewport:{width:1720,height:1000}}),errors=[],t=ledgerEvidenceText[lang];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
  await page.goto(`http://127.0.0.1:${port}/expense-evidence-acceptance.html?lang=${lang}`);
  const links=page.getByTestId('expense-line-links');await links.waitFor();assert.equal(await links.locator('h6').count(),0);assert.equal(await links.locator('td').first().innerText(),'\u2514');
  assert.equal(await page.locator('output').innerText(),'false');assert.equal(await links.getByLabel(t.supplierReference,{exact:false}).inputValue(),'MJ-001');
  const file=links.getByLabel(t.reference,{exact:false});assert.equal(await file.getAttribute('required'),'');await file.fill('server/MJ/Invoice-001.pdf');
  await page.waitForFunction(()=>document.querySelector('output').textContent==='true');assert.equal(await page.evaluate(()=>window.line.details.reference),'MJ-001');assert.equal(await page.evaluate(()=>window.line.details.evidenceFile),'server/MJ/Invoice-001.pdf');
  const fields=await links.locator('input').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().y));assert.ok(Math.max(...fields)-Math.min(...fields)<2,'linked fields share one compact row at desktop width');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi compact linked detail row, supplier invoice reference and mandatory server evidence path.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);unlinkSync(entry);}
