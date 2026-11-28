import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {evidenceAttachmentText} from '../frontend/src/utils/evidenceAttachments.mjs';
const html='frontend/evidence-attachments-test.html',jsx='frontend/evidence-attachments-test.jsx',port=43589;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/evidence-attachments-test.jsx"></script>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{AppProvider}from'/src/context/AppContext';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import{createAppTheme}from'/src/theme';import Evidence from'/src/components/DocumentEvidenceFiles';import{setRequestContext}from'/src/utils/apiClient';const q=new URLSearchParams(location.search);setRequestContext({accessToken:'test',userEmail:'test@example.test',orgId:7});function App(){const[value,setValue]=React.useState([{path:'C:/Evidence/legacy.pdf',reference:'OLD'}]),[busy,setBusy]=React.useState(false),[org,setOrg]=React.useState(7);return <ThemeProvider theme={createAppTheme(q.get('theme'))}><CssBaseline/><Button onClick={()=>setOrg(n=>n===7?8:7)}>Company</Button><Button data-save disabled={busy}>Save</Button><Evidence orgId={org} purpose="EXPENSE" languageCode={q.get('lang')} value={value} onChange={setValue} onBusyChange={setBusy}/><pre data-values style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(value)}</pre></ThemeProvider>}createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider theme={createAppTheme(q.get("theme"))}><AppProvider><App/></AppProvider></ThemeProvider></MemoryRouter>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}/evidence-attachments-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const theme of ['standard','compact'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width===390}),a=evidenceAttachmentText[lang],requests=[],errors=[];let configured=false,fail=true;
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(15000);
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
  await page.route('**/evidence-attachments/status?**',r=>r.fulfill({json:{configured:new URL(r.request().url()).searchParams.get('orgId')==='7'&&configured,maxBytes:5242880}}));
  await page.route('**/evidence-attachments?**',async r=>{const body=r.request().postDataJSON();requests.push(body);if(fail){fail=false;return r.fulfill({status:503,json:{error:'EVIDENCE_STORAGE_UNAVAILABLE'}});}await new Promise(resolve=>setTimeout(resolve,150));return r.fulfill({json:{path:'/nas-evidence/'+body.clientKey+'/'+encodeURIComponent(body.fileName),reference:''}});});
  await page.goto(`http://127.0.0.1:${port}/evidence-attachments-test.html?lang=${lang}&theme=${theme}`,{waitUntil:'domcontentloaded'});
  await page.getByText(a.notConfigured,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:a.attach,exact:true}).isDisabled(),true);assert.equal(await page.locator('[data-values]').textContent(),'[{"path":"C:/Evidence/legacy.pdf","reference":"OLD"}]');
  configured=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:a.attach,exact:true}).waitFor();await page.waitForFunction(label=>[...document.querySelectorAll('[data-document-evidence] button')].some(button=>button.textContent===label&&!button.disabled),a.attach);
  const file={name:'영수증 원본.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nEvidence')};
  await page.locator('input[type=file]').setInputFiles(file);await page.getByText(a.unknown,{exact:true}).waitFor();assert.equal(await page.locator('[data-save]').isDisabled(),true);assert.equal(await page.getByRole('button',{name:a.attach,exact:true}).isDisabled(),true);
  const retry=page.getByRole('button',{name:a.retry,exact:true});if(width===390)await retry.tap();else{await retry.focus();await retry.press('Enter');}
  await page.getByText(file.name,{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-save]').disabled);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
  const data=JSON.parse(await page.locator('[data-values]').textContent());assert.equal(data.length,2);assert.equal(data[0].path,'C:/Evidence/legacy.pdf');assert.ok(data[1].path.endsWith(encodeURIComponent(file.name)));assert.equal(await page.locator('[data-document-evidence]').getByText(data[1].path,{exact:true}).count(),0);
  const download=page.waitForEvent('download');await page.route('**/evidence-attachments/*/content?**',r=>r.fulfill({json:{fileName:file.name,contentType:'application/pdf',contentBase64:file.buffer.toString('base64')}}));await page.getByRole('button',{name:a.download,exact:true}).click();assert.equal((await download).suggestedFilename(),file.name);
  await page.getByRole('button',{name:'Company',exact:true}).click();await page.getByText(a.notConfigured,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:a.attach,exact:true}).isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);console.log('PASS evidence attachments',lang,theme,width);await page.close();
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
