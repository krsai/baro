import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {freightText} from '../frontend/src/constants/freight.js';
const fixture=path.resolve('frontend/freight-acceptance.html'),port=43421;
assert.ok(!existsSync(fixture));writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import {MemoryRouter} from 'react-router-dom';import theme from '/src/theme';import {Workspace} from '/src/pages/App/FreightWorkspace.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,null,React.createElement(Workspace,{orgId:7}))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/freight-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync);browser=await chromium.launch({executablePath,headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const t=freightText[lang],page=await browser.newPage({viewport:{width,height:1000}}),errors=[],jobs=[],docs=[];let savedMaster,savedDispatch;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/freight/**',async route=>{
   const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers});const url=new URL(req.url()),p=url.pathname.split('/freight/')[1];let json;
   if(p==='options')json=[{id:11,name:'Customer A'},{id:12,name:'Customer B'}];
   else if(p==='masters'&&req.method()==='POST'){const body=req.postDataJSON();savedMaster={...body,id:'master',number:'MASTER-1',version:1,history:[]};json=savedMaster;}
   else if(p==='masters')json={rows:savedMaster?[savedMaster]:[],total:savedMaster?1:0};
   else if(p==='masters/master')json={...savedMaster,jobs};
   else if(p==='dispatches'&&req.method()==='POST'){savedDispatch={...req.postDataJSON(),id:'dispatch',number:'DSP-001',version:1,history:[],documents:[],packages:[]};json=savedDispatch;}
   else if(p==='dispatches')json={rows:savedDispatch?[savedDispatch]:[],total:savedDispatch?1:0};
   else if(p==='dispatches/dispatch')json=savedDispatch;
   else if(p==='jobs'&&req.method()==='POST'){const body=req.postDataJSON();const row={...body,id:'job'+(jobs.length+1),number:'SHP-00'+(jobs.length+1),version:1,revision:'rev',master:savedMaster,history:[{version:1,actor:'Admin'}],packages:[],documents:[],data:{...body.data,customer:{name:body.customerId===11?'Customer A':'Customer B'}}};jobs.push(row);json=row;}
   else if(p==='jobs')json={rows:jobs,total:jobs.length};
   else if(/^jobs\/job\d$/.test(p))json={...jobs.find(row=>p.endsWith(row.id)),documents:docs};
   else if(p.endsWith('/packages')&&req.method()==='POST'){const row=jobs.find(row=>p.includes(row.id)),pack={...req.postDataJSON(),version:1};row.packages.push(pack);json=pack;}
   else if(p.endsWith('/documents')&&req.method()==='POST'){const body=req.postDataJSON(),source=jobs.find(row=>p.includes(row.id));const doc={id:'doc',number:'AN-001',kind:body.kind,sourceVersion:1,snapshot:{issuer:{name:'DEX LOGIS'},source,draft:true}};docs.push(doc);json=doc;}
   else if(p==='documents/doc')json=docs[0];
   else json={rows:[],total:0};
   await route.fulfill({headers,json});
  });
  await page.goto(`http://127.0.0.1:${port}/freight-acceptance.html`);
  await page.getByRole('tab',{name:t.masters,exact:true}).click();await page.getByRole('button',{name:t.new,exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:t.number,exact:true}).fill('MASTER-1');await dialog.getByRole('button',{name:t.next,exact:true}).click();
  await dialog.getByRole('textbox',{name:t.origin,exact:true}).fill('ICN');await dialog.getByRole('textbox',{name:t.destination,exact:true}).fill('HAN');await dialog.getByRole('button',{name:t.next,exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByText(t.children+' · 0',{exact:true}).waitFor();
  for(const [customer,house] of [['Customer A','HOUSE-A'],['Customer B','HOUSE-B']]){
   await page.getByRole('tab',{name:t.jobs,exact:true}).click();await page.getByRole('button',{name:t.new,exact:true}).click();dialog=page.getByRole('dialog');
   await dialog.getByRole('combobox',{name:t.customer,exact:true}).fill(customer);await page.getByRole('option',{name:customer,exact:true}).click();
   await dialog.getByRole('combobox',{name:t.houseStatus,exact:false}).click();await page.getByRole('option',{name:t.HOUSE,exact:true}).click();await dialog.getByRole('textbox',{name:t.houseNumber,exact:true}).fill(house);
   await dialog.getByRole('combobox',{name:t.master,exact:true}).fill('MASTER');await page.getByRole('option',{name:'MASTER-1',exact:true}).click();
   await dialog.getByRole('button',{name:t.next,exact:true}).click();await dialog.getByRole('textbox',{name:t.origin,exact:true}).fill('ICN');await dialog.getByRole('textbox',{name:t.destination,exact:true}).fill('HAN');await dialog.getByRole('button',{name:t.next,exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.masterId==='master'));assert.equal(jobs[0].data.quantity,'0');
  await page.getByRole('tab',{name:t.dispatches,exact:true}).click();await page.getByRole('button',{name:t.new,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:t.next,exact:true}).click();await dialog.getByRole('textbox',{name:t.origin,exact:true}).fill('ICN');await dialog.getByRole('textbox',{name:t.destination,exact:true}).fill('HAN');await dialog.getByRole('button',{name:t.next,exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('tab',{name:t.jobs,exact:true}).click();await page.getByRole('button',{name:'SHP-002',exact:true}).click();await page.getByRole('button',{name:t.addPackage,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:t.label,exact:true}).fill('PKG-001');await dialog.getByRole('combobox',{name:t.dispatch,exact:true}).fill('DSP');await page.getByRole('option',{name:'DSP-001',exact:true}).click();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'PKG-001',exact:true}).waitFor();
  await page.getByRole('button',{name:t.AN+' · '+t.createDocument,exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'AN-001 · '+t.draft,exact:true}).waitFor();assert.ok(await dialog.locator('iframe').count());await dialog.getByRole('button',{name:t.close,exact:true}).click();
  await page.getByRole('tab',{name:t.masters,exact:true}).click();await page.getByRole('button',{name:'MASTER-1',exact:true}).click();await page.getByText(t.children+' · 2',{exact:true}).waitFor();await page.getByRole('cell',{name:'HOUSE-A',exact:true}).waitFor();await page.getByRole('cell',{name:'HOUSE-B',exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS forwarding master / two houses / wizard / draft '+lang+' '+width);await page.close();
 }
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
