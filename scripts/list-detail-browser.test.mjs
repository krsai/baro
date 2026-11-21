import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/list-detail-acceptance.html'),source=html.replace('.html','.jsx'),port=43325;
assert.ok(!existsSync(html)&&!existsSync(source));
writeFileSync(html,'<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/list-detail-acceptance.jsx"></script>');
writeFileSync(source,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Lookup from '/src/components/LookupSearchDialog';import Dictionary from '/src/pages/App/system/StaticOptionBoard';import Process from '/src/pages/App/attribute/ProcessMasterBoard';
const params=new URLSearchParams(location.search),language=params.get('lang'),mode=params.get('mode');
const text={ko:['코드','이름','금액'],en:['Code','Name','Amount'],vi:['Mã','Tên','Số tiền']}[language];
function App(){const [query,setQuery]=React.useState(''),[open,setOpen]=React.useState(true);return <ThemeProvider theme={theme}><CssBaseline/><MemoryRouter>{mode==='dictionary'?<Dictionary/>:mode==='process'?<Process viewKey="targets"/>:<Lookup open={open} title="Records" languageCode={language} query={query} onQueryChange={setQuery} options={[{id:1,code:'A',name:'Alpha',amount:'123,456,789.00',privateMemo:'DO NOT EXPOSE'},{id:2,code:'B',name:'Beta',amount:'0'}]} columns={[{key:'code',label:text[0],value:r=>r.code},{key:'name',label:text[1],value:r=>r.name},{key:'amount',label:text[2],value:r=>r.amount}]} onClose={()=>setOpen(false)} onSelect={row=>{window.selected=row;setOpen(false);}}/>}</MemoryRouter></ThemeProvider>};createRoot(document.getElementById('root')).render(<App/>);`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/list-detail-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const language of ['ko','en','vi'])for(const width of [1920,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:${JSON.stringify(language)}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;'}));
  await page.route('**/src/utils/attributeApi*',r=>r.fulfill({contentType:'application/javascript',body:`export async function fetchProcessMasterOptions(){return {targets:[{id:1,code:'T1',nameKo:'가 대상',nameEn:'A Target',nameVi:'A Target'},{id:2,code:'T2',nameKo:'나 대상',nameEn:'B Target',nameVi:'B Target'}],targetSpecs:[{id:3,code:'S1',nameKo:'규격',nameEn:'Specification',nameVi:'Specification'}],targetToTargetSpecs:[{parentCode:'T1',childCode:'S1'}],actions:[],actionSpecs:[],actionToActionSpecs:[]};}export async function updateProcessMasterOptions(value){window.saved=value;return value;}`}));
  await page.goto('http://127.0.0.1:'+port+'/list-detail-acceptance.html?mode=lookup&lang='+language);
  const detail=page.locator('[data-record-details]');await detail.waitFor();assert.ok((await detail.textContent()).includes('123,456,789.00'));assert.equal(await page.getByText('DO NOT EXPOSE').count(),0);
  const listBox=await page.locator('[data-list-detail-list]').boundingBox(),detailBox=await page.locator('[data-list-detail-content]').boundingBox();
  if(width>900)assert.ok(detailBox.x>=listBox.x+listBox.width);else assert.ok(detailBox.y>=listBox.y+listBox.height);
  await page.getByRole('textbox').press('Enter');assert.equal(await page.evaluate(()=>window.selected),undefined,'Preview does not commit');
  await page.locator('tbody tr').filter({hasText:'Beta'}).locator('td').first().click();assert.ok((await detail.textContent()).includes('Beta'));assert.equal(await page.evaluate(()=>window.selected),undefined);
  await page.getByRole('textbox').focus();await page.getByRole('textbox').press('Enter');await page.waitForFunction(()=>window.selected?.id===2);
  await page.goto('http://127.0.0.1:'+port+'/list-detail-acceptance.html?mode=dictionary&lang='+language);
  const nav=page.locator('nav');await nav.waitFor();const count=await nav.getByRole('button').count();assert.ok(count>2);await nav.getByRole('button').nth(1).click();assert.equal(await page.locator('[data-list-detail-content] table').count(),1);assert.equal(await nav.locator('[aria-current="true"]').count(),1);
  await page.goto('http://127.0.0.1:'+port+'/list-detail-acceptance.html?mode=process&lang='+language);
  const section=page.locator('[data-process-master-section="targets"]');await section.locator('input[value="T1"]').waitFor();await section.locator('input[value="T1"]').click();
  const specs=section.locator('[data-list-detail-content]');await specs.locator('input[value="S1"]').waitFor();
  const left=await section.locator('[data-list-detail-list]').boundingBox(),right=await specs.boundingBox();if(width>1500)assert.ok(right.x>=left.x+left.width);else assert.ok(right.y>=left.y+left.height);
  await specs.locator('input[value="Specification"]').first().fill('Edited specification');
  await section.locator('input[value="T2"]').click();await section.locator('input[value="T1"]').click();assert.equal(await specs.locator('input[value="Edited specification"]').count(),1,'Switching selection retains the draft');
  assert.equal(await page.evaluate(()=>window.saved),undefined,'Selection and editing never save automatically');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Wide tables scroll inside their pane');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS list/detail '+language+' '+width);
 }
}finally{await browser?.close();vite.kill();unlinkSync(html);unlinkSync(source);}
