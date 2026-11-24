import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {shippingOperationText} from '../frontend/src/constants/shippingOperations.js';
const html='frontend/shipping-master-board-test.html',jsx='frontend/shipping-master-board-test.jsx',port=43561;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/shipping-master-board-test.jsx"></script></html>');
writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Board from '/src/components/ShippingWorkDocuments';
const master={id:'master-a',jobId:'one',kind:'MASTER',number:'MASTER A',issuer:'CARRIER',linkedJobCount:2,data:{vessel:'SHARED VESSEL',voyage:'0230W',etd:'2026-12-01',eta:'2026-12-07'}};
function App(){const [job,setJob]=React.useState({id:'two',version:1,mode:'SEA',service:'GENERAL',receiptStatus:'ACCEPTED',status:'DRAFT',bills:[]});window.refreshMaster=()=>setJob(j=>({...j,version:j.version+1,bills:[master,{id:'house-c',jobId:'two',kind:'HOUSE',number:'HOUSE C',masterId:master.id,data:{}}]}));return <Board job={job} orgId={7} languageCode={new URLSearchParams(location.search).get('lang')} onChanged={()=>window.refreshMaster()} onOpen={id=>window.openedBill=id} onCreate={(kind,id)=>window.createdBill={kind,id}}/>;}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><App/></ThemeProvider>);`);
let browser;const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-master-board-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),t=shippingOperationText[lang],writes=[],errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({showNotification:()=>{},removeNotification:()=>{}});'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[{acronym:'MBL'},{acronym:'HBL'}]}}));
  await page.route('**/freight/**',r=>{const req=r.request();if(req.method()==='OPTIONS')return r.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});const headers={'Access-Control-Allow-Origin':'*'};if(req.method()==='GET')return r.fulfill({headers,json:{rows:[{id:'master-a',number:'MASTER A',issuer:'CARRIER',linked:false,data:{vessel:'SHARED VESSEL'}}]}});writes.push({path:new URL(req.url()).pathname,body:req.postDataJSON()});return writes.length===1?r.fulfill({headers,status:503,json:{error:'UNCONFIRMED'}}):r.fulfill({headers,json:{version:2}});});
  await page.goto(`http://127.0.0.1:${port}/shipping-master-board-test.html?lang=${lang}`);
  await page.getByRole('button',{name:t.newHouse,exact:true}).click();assert.equal(await page.evaluate(()=>window.createdBill.kind),'HOUSE');
  await page.getByRole('button',{name:t.linkMaster,exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'MASTER A',exact:true}).click();await dialog.getByRole('button',{name:t.link,exact:true}).click();
  await dialog.getByRole('button',{name:t.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(writes[0],writes[1]);assert.ok(writes[0].path.endsWith('/two/master-links/master-a'));
  await page.getByText('SHARED VESSEL · 0230W',{exact:true}).waitFor();await page.getByText(t.sharedCount.replace('{count}',2),{exact:false}).waitFor();
  await page.getByRole('button',{name:'HOUSE C',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedBill),'house-c');
  await page.getByRole('button',{name:t.newHouse,exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.createdBill),{kind:'HOUSE',id:'master-a'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  console.log('PASS shared master board, explicit link and exact uncertain retry, own HBL actions',lang,width);await page.close();
 }
}finally{await browser?.close();server.kill();for(const path of [html,jsx])if(existsSync(path))unlinkSync(path);}
