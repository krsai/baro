import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/code-item-attributes-acceptance.html',entry='frontend/acceptance/codeItemAttributesFixture.jsx';
assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,Table,TableBody}from'@mui/material';import theme from'/src/theme';import Line from'/src/components/ExpenseRequestLine';import Settings from'/src/components/AccountingInputSettings';import{newExpenseLine,validExpenseLine,expenseLinePayload}from'/src/utils/expenseRequest.mjs';import{EXPENSE_REQUEST_TEXT}from'/src/constants/expenseRequest';import{EXPENSE_TEXT}from'/src/constants/expenseTypes';import{ITEM_ATTRIBUTE_TEXT}from'/src/constants/itemAttributes';import{accountingCompactText}from'/src/constants/accountingCompact';import{NoticeHost}from'/src/context/AppContext.jsx';
const lang=new URLSearchParams(location.search).get('lang');window.text={...EXPENSE_TEXT[lang],...ITEM_ATTRIBUTE_TEXT[lang],...accountingCompactText[lang]};
function App(){const [line,setLine]=React.useState({...newExpenseLine(),transactionCodeId:7,quantity:'1',unitPrice:'10',details:{reference:'DOC',evidenceFile:'receipt.pdf'}}),[settings,setSettings]=React.useState({requiredFields:[],orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'});const onChange=React.useCallback((key,patch)=>setLine(row=>({...row,...patch})),[]),onStatus=React.useCallback(value=>{},[]);const code={id:7,baseId:70,code:'LBLE',vatEnabled:false,base:{entryMode:'GENERAL',...settings}};window.line=line;window.payload=expenseLinePayload(line);window.settings=settings;window.valid=validExpenseLine(line,code,'VND');return <ThemeProvider theme={theme}><Settings value={settings} onChange={setSettings} languageCode={lang}/><Table><TableBody><Line line={line} index={0} codes={[code]} orders={[]} orgId={1} settings={{}} labels={EXPENSE_REQUEST_TEXT[lang]} languageCode={lang} orgId={1} onChange={onChange} onStatus={onStatus} validationAttempt={1}/></TableBody></Table><NoticeHost/></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
writeFileSync(file,'<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/acceptance/codeItemAttributesFixture.jsx"></script></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43421','--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43421/code-item-attributes-acceptance.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';import ReactDOM from'/node_modules/.vite/deps/react-dom.js';const{createPortal}=ReactDOM;let notice=null;const listeners=new Set();const showNotification=(message,severity,options)=>{notice={message,options};listeners.forEach(fn=>fn());};const removeNotification=()=>{notice=null;listeners.forEach(fn=>fn());};const actions={showNotification,removeNotification};export const useAppActions=()=>actions;export const NoticeHost=()=>{const current=React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>notice);return current?createPortal(React.createElement('div',{role:'alert',style:{position:'fixed',top:16,left:'30%',zIndex:99999,background:'white'}},current.message,current.options?.action),document.body):null;};`}));
  let failLoad=true,failSave=true,types=[{id:31,nameEn:'Main',nameKo:'메인',nameVi:'Chính'}];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route(/\/code-item-(?:options|types)(?:\?|$)/,route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
   if(req.method()==='POST'){assert.equal(req.postDataJSON().baseId,70);if(failSave){failSave=false;return route.fulfill({headers,status:500,json:{error:'FAILED'}});}const type={id:32,...req.postDataJSON()};types.push(type);return route.fulfill({headers,json:type});}
   if(failLoad){failLoad=false;return route.fulfill({headers,status:500,json:{error:'FAILED'}});}
   return route.fulfill({headers,json:{customers:[{id:21,code:'THES',name:'THE SAN',nameKo:'더산',nameVi:'THE SAN'},{id:22,code:'URDK',name:'URD',nameKo:'URD',nameVi:'URD'}],types}});
  });
  await page.goto('http://127.0.0.1:43421/code-item-attributes-acceptance.html?lang='+lang);await page.waitForFunction(()=>window.text);const t=await page.evaluate(()=>window.text);
  for(const key of ['customer','type']){await page.getByRole('combobox',{name:t[key],exact:true}).click();await page.getByRole('option',{name:t.REQUIRED,exact:true}).click();}
  assert.equal(await page.evaluate(()=>window.valid),false);
  const search=page.getByRole('textbox',{name:t.search,exact:true});await search.fill(t.type);assert.equal(await page.getByRole('table',{name:({ko:'자재·규격',en:'Material specifications',vi:'Quy cách vật tư'})[lang],exact:true}).getByRole('combobox').count(),1);await search.fill('');
  await page.getByRole('button',{name:t.link,exact:true}).click();await page.getByRole('button',{name:t.retry,exact:true}).click();
  const customer=page.getByRole('textbox',{name:t.customer,exact:false});await customer.waitFor();await customer.fill('TH');await customer.press('Enter');
  const lookup=page.getByRole('dialog').last();await lookup.getByText('THES',{exact:true}).dblclick();await page.waitForFunction(()=>window.line.itemCustomerId===21);
  const typeField=page.getByRole('textbox',{name:t.type,exact:false});await typeField.fill(lang==='ko'?'메인':lang==='vi'?'Chính':'Main');await typeField.press('Tab');await page.waitForFunction(()=>window.line.itemTypeId===31&&window.valid);
  assert.equal(await page.evaluate(()=>window.payload.itemCustomerId),21);assert.equal(await page.evaluate(()=>window.payload.itemTypeId),31);
  await page.getByRole('button',{name:t.addType,exact:true}).click();const dialog=page.getByRole('dialog').last();const input=dialog.locator('input');await input.nth(0).fill('Care');await input.nth(1).fill('케어');await input.nth(2).fill('Chăm sóc');await dialog.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('alert').filter({hasText:t.saveError}).waitFor();assert.equal(await input.nth(0).inputValue(),'Care');await dialog.getByRole('button',{name:t.save,exact:true}).click();await page.waitForFunction(()=>window.line.itemTypeId===32);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS code attributes: required modes, search, customer FK, type creation/retry, preserved draft',lang,width);
 }
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
