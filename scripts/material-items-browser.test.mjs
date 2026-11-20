import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {transformSync} from '../frontend/node_modules/esbuild/lib/main.js';
import {chromium} from 'playwright-core';
import {materialItemText} from '../frontend/src/constants/materialItems.js';
import {EXPENSE_TEXT} from '../frontend/src/constants/expenseTypes.js';
const file='frontend/material-items-acceptance.html',port=43542;assert.ok(!existsSync(file));
writeFileSync(file,`<html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import{MemoryRouter}from'react-router-dom';import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Table,TableBody,Button}from'@mui/material';import theme from'/src/theme';import Master from'/src/components/MaterialMasterList';import Line from'/src/components/ExpenseRequestLine';import Grid from'/src/components/LedgerEntryGrid';import{newExpenseLine}from'/src/utils/expenseRequest.mjs';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest';
const lang=new URLSearchParams(location.search).get('lang'),base={id:1,code:'TST',nameEn:'TEST BOX',nameKo:'테스트 박스',nameVi:'Hộp thử',entryMode:'GENERAL',orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN',attributeInputs:{},requiredFields:['length','width'],materialRevision:1,materialSettings:{enabled:true,stockFields:['unit','dimensions'],colorInput:'HIDDEN',unitInput:'REQUIRED'},industryLinks:[{industry:{id:5,isActive:true,materialManagement:true,materialManagementRevision:1}}]},code={id:7,baseId:1,code:'TSTE',vatEnabled:false,isActive:true,base};window.testCode=code;
function App(){const[view,setView]=React.useState('MASTER'),[open,setOpen]=React.useState(false),[line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,currency:'USD',quantity:'1',unitPrice:'10',details:{evidenceFile:'proof.pdf'}}),[rows,setRows]=React.useState([{clientKey:'bank',entryKind:'BANK',accountId:'a',accountingCodeId:7,transactionDate:'2026-11-19',direction:'OUT',amount:'10',purpose:'Purchase',evidenceType:'FILE',evidenceNumber:'proof.pdf',counterparty:{kind:'PARTNER',id:11,name:'Vendor'},expenseItems:[]}]);window.expenseLine=line;window.ledgerRows=rows;const change=React.useCallback((key,patch)=>setLine(old=>({...old,...patch})),[]),status=React.useCallback((key,valid)=>{window.expenseValid=valid;},[]);return <ThemeProvider theme={theme}><CssBaseline/>{['MASTER','EXPENSE','LEDGER'].map(name=><Button key={name} onClick={()=>setView(name)}>{name}</Button>)}{view==='MASTER'?<><Button onClick={()=>setOpen(true)}>ADD</Button><Master open={open} onClose={()=>setOpen(false)}/></>:view==='EXPENSE'?<Table><TableBody><Line line={line} index={0} codes={[code]} orders={[]} units={[{id:1,code:'EA',nameEn:'Each',isActive:true}]} settings={{defaultVatRate:'0'}} orgId={1} languageCode={lang} labels={EXPENSE_REQUEST_TEXT[lang]} onChange={change} onStatus={status} onRemove={()=>{}}/></TableBody></Table>:<Grid rows={rows} accounts={[{id:'a',currencyCode:'USD',bankName:'Bank',accountNumber:'001',openingDate:'2026-01-01'}]} codes={[code]} parties={[]} languageCode={lang} orgId={1} locked={false} expanded={{}} setExpanded={()=>{}} edit={(key,patch)=>setRows(old=>old.map(row=>row.clientKey===key?{...row,...patch}:row))} resetEvidence={()=>{}} selectDocument={()=>{}} addChild={()=>{}} mutate={setRows}/>}</ThemeProvider>;}createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);
</script></html>`);
writeFileSync(file,readFileSync(file,'utf8').replace(/<script type="module">([\s\S]*?)<\/script>/,(_,source)=>'<script type="module">'+transformSync(source,{loader:'jsx',format:'esm'}).code+'</script>'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:'+port+'/material-items-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[],items=[],unit={id:1,code:'EA',nameEn:'Each',nameKo:'개',nameVi:'Cái',isActive:true,sortOrder:0},t=materialItemText[lang],d=EXPENSE_TEXT[lang];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:'+JSON.stringify(lang)+'});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const showNotification=message=>{let node=document.querySelector('[role=alert]');if(!node){node=document.createElement('div');node.setAttribute('role','alert');document.body.appendChild(node);}node.textContent=message;};export const useAppActions=()=>({setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},showNotification,removeNotification:()=>document.querySelector('[role=alert]')?.remove()});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'*','Access-Control-Allow-Headers':'*'};
  await page.route('**/material-items**',async r=>{
   const req=r.request(),url=new URL(req.url());if(url.pathname.endsWith('material-items-acceptance.html'))return r.continue();assert.equal(url.searchParams.get('orgId'),'1');
   if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(req.method()==='POST'){
    const body=req.postDataJSON();writes.push(body);if(writes.length===1)return r.fulfill({headers,status:503,json:{error:'UNAVAILABLE'}});
    const source=(await page.evaluate(()=>window.testCode)).base;assert.equal(body.nameEn,undefined);const item={id:'material-1',orgId:1,baseId:1,industryId:5,unitId:1,data:{nameEn:source.nameEn,nameKo:source.nameKo,nameVi:source.nameVi,unit,details:body.details,inputSettings:{requiredFields:['length','width']}}};items.push(item);return r.fulfill({headers,status:201,json:item});
   }
   if(url.pathname.endsWith('/catalogue'))return r.fulfill({headers,json:{codes:[await page.evaluate(()=>{
    const code=window.testCode;
    return {...code,base:{...code.base,materialSettings:{...code.base.materialSettings,colorInput:'REQUIRED'}}};
   })],units:[unit]}});
   return r.fulfill({headers,json:items});
  });
  await page.goto('http://127.0.0.1:'+port+'/material-items-acceptance.html?lang='+lang);await page.getByText(t.empty,{exact:true}).waitFor().catch(async e=>{throw Error(errors.join(' | ')||await page.locator('body').innerText()||e.message)});await page.getByRole('button',{name:'ADD',exact:true}).click();
  const dialog=page.getByRole('dialog'),code=dialog.getByRole('textbox',{name:t.productSearch,exact:false});await code.fill('TST');await code.press('Enter');
  const names={ko:['이름 (영어 · 대표)','이름 (한국어)','이름 (베트남어)'],en:['Name (English · primary)','Name (Korean)','Name (Vietnamese)'],vi:['Tên (tiếng Anh · chính)','Tên (tiếng Hàn)','Tên (tiếng Việt)']}[lang];
  for(const [i,value] of ['TEST BOX','테스트 박스','Hộp thử'].entries())await dialog.getByLabel(names[i],{exact:true}).evaluate((input,expected)=>{if(!input.readOnly||input.value!==expected)throw Error('Expected read-only SYSTEM name');},value);
  const unitField=dialog.getByRole('textbox',{name:t.unit,exact:false});await unitField.fill('EA');await unitField.press('Tab');
  assert.equal(await dialog.getByRole('textbox',{name:t.color,exact:false}).count(),0);
  for(const key of ['length','width','height'])assert.equal(await dialog.getByRole('textbox',{name:d[key],exact:false}).getAttribute('required'),'');
  await dialog.getByRole('textbox',{name:d.length,exact:false}).fill('100');await dialog.getByRole('textbox',{name:d.width,exact:false}).fill('200');await dialog.getByRole('button',{name:t.save,exact:true}).click();assert.equal(writes.length,0,'height is required before posting');
  await dialog.getByRole('textbox',{name:d.height,exact:false}).fill('300');await dialog.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('alert').filter({hasText:t.failed}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:d.height,exact:false}).inputValue(),'300');
  await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(writes[0],writes[1],'retry retains the exact identity and draft');await page.getByRole('cell',{name:'TEST BOX',exact:true}).or(page.getByRole('cell',{name:'테스트 박스',exact:true})).or(page.getByRole('cell',{name:'Hộp thử',exact:true})).waitFor();
  for(const view of ['EXPENSE','LEDGER']){
   await page.getByRole('button',{name:view,exact:true}).click();await page.locator('button[title="proof.pdf"]').click();
   const evidence=page.getByRole('dialog'),picker=evidence.getByRole('textbox',{name:t.title,exact:false});await picker.fill('TEST BOX');await picker.press('Enter');
   if(view==='EXPENSE'){await page.waitForFunction(()=>window.expenseLine.materialItemId==='material-1'&&window.expenseValid);assert.equal(await page.evaluate(()=>window.expenseLine.details.height),'300');}
   else {await page.waitForFunction(()=>window.ledgerRows[0].materialItemId==='material-1');assert.equal(await page.locator('[data-ledger-entry-row]').count(),1,'no auxiliary material row');}
   for(const key of ['length','width','height'])assert.equal(await evidence.getByRole('textbox',{name:d[key],exact:false}).count(),0,'specifications come from the selected master');
   await page.keyboard.press('Escape');await evidence.waitFor({state:'hidden'});
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.close();console.log('PASS material master registration/retry and expense/bank selection',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);}
