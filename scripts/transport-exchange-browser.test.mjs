import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {freightText} from '../frontend/src/constants/freight.js';
import {transportExchangeText} from '../frontend/src/constants/transportExchange.js';
const file=path.resolve('frontend/transport-exchange-acceptance.html'),port=43428;
assert.ok(!existsSync(file));writeFileSync(file,`<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/TransportExchange.jsx';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page))));</script></body></html>`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/transport-exchange-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi']){
  const t={...freightText[lang],...transportExchangeText[lang]};let shared=null,version=1,status='PENDING',reply=null;
  for(const [index,service] of [false,true,false].entries()){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({activeOrgId:${service?2:1},activeOrgType:'${service?'SERVICE':'MANUFACTURER'}'});`}));
   await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
   await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={};export const useAppActions=()=>a;'}));
   await page.route('**/transport-exchanges**',async route=>{
    const req=route.request(),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    if(req.method()==='OPTIONS')return route.fulfill({headers});
    const pathname=new URL(req.url()).pathname;let json;
    if(pathname.endsWith('/options'))json={partners:[{id:service?1:2,name:service?'BARO':'DEX'}],customers:[{id:11,name:'BARO local'}],jobs:[{id:'job-1',number:'SHP-001'}]};
    else if(req.method()==='GET')json=shared?[{id:'exchange-1',incoming:service,company:service?'BARO':'DEX',status,version,updatedAt:'2026-11-07T10:00:00Z',sent:service?reply:shared,received:service?shared:reply,ownJobId:service&&status==='ACCEPTED'?'job-1':null}]:[];
    else{
     const body=req.postDataJSON();
     if(pathname.endsWith('/exchange-1')){
      if(body.action==='ACCEPT'){assert.equal(body.customerId,11);assert.equal(body.customerRole,'shipper');status='ACCEPTED';version++;}
      else if(body.action==='PUBLISH'){if(service){assert.equal(body.data,undefined);reply={...shared,status:'BOOKED'};}else{assert.equal(body.data.cargo,'Updated garments');shared={mode:body.mode,status:body.status,data:body.data};}version++;}
      else throw Error('Unexpected action '+body.action);
     }else if(service){assert.equal(body.jobId,'job-1');assert.equal(body.targetOrgId,1);}
     else{assert.equal(body.targetOrgId,2);assert.equal(body.data.cargo,'Garments');shared={mode:body.mode,status:'DRAFT',data:body.data};}
     json={id:'exchange-1'};
    }
    await route.fulfill({headers,json});
   });
   await page.goto(`http://127.0.0.1:${port}/transport-exchange-acceptance.html`);
   await page.getByText(t.privacy,{exact:true}).waitFor();
   if(index===2){
    await page.getByRole('button',{name:t.view,exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByText(t.BOOKED,{exact:false}).waitFor();
    await dialog.getByRole('button',{name:t.publish,exact:true}).click();
    await dialog.getByRole('textbox',{name:new RegExp('^'+t.cargo)}).fill('Updated garments');
    await page.setViewportSize({width:390,height:900});await dialog.getByRole('button',{name:t.publish,exact:true}).click();await dialog.waitFor({state:'hidden'});
   }else if(!service){
    await page.getByRole('button',{name:t.new,exact:true}).click();const dialog=page.getByRole('dialog');
    const partner=dialog.getByRole('textbox',{name:t.partner,exact:true});await partner.fill('DEX');await partner.press('Enter');
    for(const [key,value] of Object.entries({origin:'Hai Phong',destination:'Busan',shipper:'BARO factory',consignee:'Buyer',cargo:'Garments'}))await dialog.getByRole('textbox',{name:new RegExp('^'+t[key])}).fill(value);
    await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await dialog.getByRole('button',{name:t.send,exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText('DEX',{exact:true}).waitFor();
   }else{
    await page.getByRole('button',{name:t.view,exact:true}).click();let dialog=page.getByRole('dialog');
    const customer=dialog.getByRole('textbox',{name:t.customer,exact:true});await customer.fill('BARO');await customer.press('Enter');
    await dialog.getByRole('button',{name:t.accept,exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.getByText(t.ACCEPTED,{exact:true}).waitFor();await page.getByRole('button',{name:t.view,exact:true}).click();
    await dialog.getByRole('link',{name:t.local,exact:true}).waitFor();await dialog.getByRole('button',{name:t.publish,exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.getByRole('button',{name:t.new,exact:true}).click();
    for(const [key,value] of [['partner','BARO'],['job','SHP-001']]){const input=dialog.getByRole('textbox',{name:t[key],exact:true});await input.fill(value);await input.press('Enter');}
    await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await dialog.getByRole('button',{name:t.send,exact:true}).click();await dialog.waitFor({state:'hidden'});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS transport exchange manufacturer/forwarder, mobile',lang);
 }
}finally{await browser?.close();vite.kill();unlinkSync(file);}
