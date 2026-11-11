import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/table-fit-acceptance.html'),entry=path.resolve('frontend/table-fit-acceptance.jsx');assert.ok(!existsSync(fixture)&&!existsSync(entry));
writeFileSync(fixture,'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/table-fit-acceptance.jsx"></script></body></html>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Box,TableContainer,Table,TableHead,TableBody,TableRow,TableCell,TextField,Button}from'@mui/material';import theme from'/src/theme';import Ledger from'/src/components/LedgerActivityTable';import Partners from'/src/components/PartnerDirectory';import DeleteButton from'/src/components/DeleteActionButton';import{bankLedgerMessages}from'/src/constants/bankLedgerMessages';import{ledgerEntryText}from'/src/constants/ledgerEntry';
const lang=new URLSearchParams(location.search).get('lang'),huge=new URLSearchParams(location.search).has('huge'),t=bankLedgerMessages[lang],l=ledgerEntryText[lang];const rows=Array.from({length:4},(_,i)=>({id:String(i),transactionDate:'2026-11-02',accountName:'VCB / 0611037196497',currencyCode:'VND',amount:huge?'123456789012345678901234567890123456789012345678901234567890':'2049545',direction:'IN',counterpartyName:'BARO',createdByName:'Administrator',accountingCode:{code:'FADE',nameEn:'Funds adjustment',nameKo:'Funds adjustment',nameVi:'Funds adjustment'}}));
function Example({id,wide=false,editable=false,document=false}){return <TableContainer data-testid={id}><Table data-table-layout={document?'document':wide?'wide':undefined} size="small" sx={{minWidth:1800,tableLayout:'fixed'}}><colgroup>{[400,500,450,450].map((width,i)=><col key={i} style={{width}}/>)}</colgroup><TableHead><TableRow>{['Name','Description','Amount','Action'].map(name=><TableCell key={name}>{name}</TableCell>)}</TableRow></TableHead><TableBody><TableRow><TableCell>{editable?<TextField label="Name" value="Editable" onChange={()=>{}}/>:'Ordinary list'}</TableCell><TableCell>Readable text</TableCell><TableCell align="right">123,456,789</TableCell><TableCell><DeleteButton onClick={()=>window.deleted=true}/></TableCell></TableRow></TableBody></Table></TableContainer>}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Box sx={{ml:{xs:0,lg:'240px'},p:3,minWidth:0}}><Ledger rows={rows} text={t} labels={l} currencyLabel="Currency" languageCode={lang} onEdit={()=>window.edited=true} onEditKey={()=>{}} onDelete={()=>window.deleted=true}/><Partners embedded languageCode={lang} rows={[{id:1,code:'BARO',name:'BARO GARMENT',country:'VN',contactName:'Admin',phone:'0123456789',email:'baro@example.com',registeredAt:'2026-11-01',source:{partyKind:'CORPORATE'}}]} onOpen={()=>window.opened=true} onAdd={()=>{}} renderActions={()=><DeleteButton onClick={()=>window.deleted=true}/>}/><Example id="ordinary"/><Example id="wide" wide/><Example id="editable" editable/><Example id="document" document/></Box></ThemeProvider>);`);
const port=43297,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/table-fit-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1920,1718,1440,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(8000);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.goto(`http://127.0.0.1:${port}/table-fit-acceptance.html?lang=${lang}`);
  const ledger=page.getByTestId('ledger-activity-table');await ledger.waitFor();
  for(const table of [ledger,page.getByTestId('partner-directory'),page.getByTestId('ordinary').locator('table')]){
   const overflow=await table.evaluate(element=>{const container=element.closest('.MuiTableContainer-root');return {scroll:container.scrollWidth,width:container.clientWidth};});assert.ok(overflow.scroll<=overflow.width+1,`${lang} ${width}: unnecessary scroll ${JSON.stringify(overflow)}`);
  }
  const incoming=await ledger.locator('tbody tr').first().locator('[data-ledger-amount="IN"]').boundingBox(),outgoing=await ledger.locator('tbody tr').first().locator('[data-ledger-amount="OUT"]').boundingBox();assert.ok(Math.abs(incoming.width-outgoing.width)<2,'in/out keep equal columns even with no outgoing transactions');
  const description=await ledger.locator('tbody tr').first().locator('td').nth(7).boundingBox();assert.ok(incoming.width>description.width,'money columns get more space than the short description');
  assert.ok(await ledger.locator('tbody td').first().evaluate(element=>parseFloat(getComputedStyle(element).fontSize)>=13));
  assert.equal(await ledger.locator('[data-table-action]').first().evaluate(element=>getComputedStyle(element.closest('td')).boxShadow),'none','sticky actions do not draw a vertical separator');
  await ledger.locator('[data-table-action]').first().click();assert.equal(await page.evaluate(()=>window.deleted),true);
  await ledger.locator('tbody tr').first().dblclick();assert.equal(await page.evaluate(()=>window.edited),true);
  for(const id of ['wide','editable','document']){
   const container=page.getByTestId(id);assert.ok(await container.evaluate(element=>element.scrollWidth>element.clientWidth),`${id} retains intentional width`);
   if(id==='document')continue;
   const bounds=await container.boundingBox(),button=await container.locator('[data-table-action]').boundingBox();assert.ok(button.x>=bounds.x&&button.x+button.width<=bounds.x+bounds.width+1,'action visible without scrolling');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow stays inside the table');assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useLanguage=()=>({languageCode:'en'});"}));await page.goto(`http://127.0.0.1:${port}/table-fit-acceptance.html?lang=en&huge=1`);const ledger=page.getByTestId('ledger-activity-table');await ledger.waitFor();
 assert.ok(await ledger.evaluate(element=>element.closest('.MuiTableContainer-root').scrollWidth>element.closest('.MuiTableContainer-root').clientWidth),'genuinely large amounts retain necessary scrolling');
 assert.ok(await ledger.locator('[data-ledger-amount="IN"]').first().evaluate(element=>element.scrollWidth<=element.clientWidth+1),'full large amount fits its cell');
 const bounds=await ledger.evaluate(element=>element.closest('.MuiTableContainer-root').getBoundingClientRect().toJSON()),button=await ledger.locator('[data-table-action]').first().boundingBox();assert.ok(button.x+button.width<=bounds.right+1);await page.close();
 console.log('PASS: ko/en/vi 1280–1920 desktop list fitting, equal money columns, visible actions, large amounts, editable/matrix/document exceptions and interaction preservation.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);unlinkSync(entry);}
