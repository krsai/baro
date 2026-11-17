import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const file='frontend/material-settings-acceptance.html',entry='frontend/acceptance/materialSettingsFixture.jsx';
assert.ok(!existsSync(file)&&!existsSync(entry));
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'@mui/material';import theme from'/src/theme';import Settings from'/src/components/AccountingInputSettings';import{MATERIAL_SETTINGS_TEXT}from'/src/components/MaterialCodeSettings';import{EXPENSE_TEXT}from'/src/constants/expenseTypes';import{ITEM_ATTRIBUTE_TEXT}from'/src/constants/itemAttributes';function App(){const lang=new URLSearchParams(location.search).get('lang'),[value,setValue]=React.useState({requiredFields:[],attributeInputs:{},...(new URLSearchParams(location.search).has('material')?{materialSettings:{enabled:true,stockFields:['unit'],colorInput:'HIDDEN',unitInput:'REQUIRED'}}:{}),orderInput:'HIDDEN',styleInput:'HIDDEN',processInput:'HIDDEN'});window.settings=value;window.ownerLabels=ITEM_ATTRIBUTE_TEXT[lang];window.labels=MATERIAL_SETTINGS_TEXT[lang];window.modes=EXPENSE_TEXT[lang];return <ThemeProvider theme={theme}><Settings value={value} onChange={setValue} languageCode={lang} disabled={new URLSearchParams(location.search).has('disabled')}/></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
writeFileSync(file,'<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/acceptance/materialSettingsFixture.jsx"></script></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43423','--strictPort'],{cwd:'frontend',stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43423/material-settings-acceptance.html')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:43423/material-settings-acceptance.html?lang=${lang}&material`);await page.waitForFunction(()=>window.labels);
  const t=await page.evaluate(()=>window.labels),m=await page.evaluate(()=>window.modes),a=await page.evaluate(()=>window.ownerLabels);
  assert.equal(await page.getByRole('switch').count(),0);const ownership=page.getByRole('table',{name:({ko:'소유 정보',en:'Ownership',vi:'Thông tin sở hữu'})[lang],exact:true});await ownership.waitFor();
  const table=page.getByRole('table',{name:t.title,exact:true});await table.waitFor();
  const stock=key=>table.getByRole('checkbox',{name:`${t[key]} · ${t.stock}`,exact:true});
  assert.equal(await table.getByText(a.owner,{exact:true}).count(),0);await ownership.getByRole('combobox',{name:a.owner,exact:true}).click();await page.getByRole('option',{name:m.REQUIRED,exact:true}).click();assert.equal(await page.evaluate(()=>window.settings.attributeInputs.owner),'REQUIRED');assert.equal(await stock('unit').isChecked(),true);assert.equal(await stock('unit').isDisabled(),true);
  for(const key of ['type','color']){
   await table.getByRole('combobox',{name:`${t[key]} · ${t.input}`,exact:true}).click();await page.getByRole('option',{name:m.REQUIRED,exact:true}).click();await stock(key).check();
  }
  assert.deepEqual(await page.evaluate(()=>window.settings.materialSettings.stockFields),['unit','type','color']);
  await table.getByRole('combobox',{name:`${t.color} · ${t.input}`,exact:true}).click();await page.getByRole('option',{name:m.HIDDEN,exact:true}).click();assert.equal(await stock('color').isChecked(),false);
  const search=page.getByRole('textbox').first();await search.fill(t.color);assert.equal(await table.getByRole('combobox').count(),1);await search.fill('');
  await page.getByRole('combobox').first().click();await page.getByRole('option',{name:({ko:'필수',en:'Required',vi:'Bắt buộc'})[lang],exact:true}).click();assert.equal(await table.getByRole('combobox').count(),2);
  assert.equal(await stock('type').isChecked(),true);assert.ok(!(await page.evaluate(()=>window.settings.materialSettings.stockFields)).includes('owner'));
  assert.deepEqual(errors,[]);await page.close();console.log('PASS material settings eligibility, required modes, stock keys, unit, preservation',lang,width);
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:43423/material-settings-acceptance.html?lang=en&disabled&material');assert.equal(await page.getByRole('switch').count(),0);assert.equal(await page.getByRole('combobox',{name:'Material owner',exact:true}).isDisabled(),true);await page.close();
}finally{await browser?.close();server.kill();unlinkSync(file);unlinkSync(entry);}
