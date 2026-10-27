import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/order-layout-drag-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{ThemeProvider,CssBaseline}from'@mui/material';import theme from'/src/theme';import Order from'/src/pages/App/order/OrderList.jsx';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/order/order-1']},React.createElement(Routes,null,React.createElement(Route,{path:'/order/:orderId',element:React.createElement(Order)})))));</script></body></html>`);
const port=43246,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/order-layout-drag-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgType:"MANUFACTURER",activeProfile:{entryType:"ORG",orgRole:"ADMIN"}});'}));
 await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:"en"});'}));
 await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification:(...args)=>{(window.notices??=[]).push(args);},navigateToPath:()=>{},markTabChanged:()=>{},clearTabChanged:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}};export const useAppActions=()=>a;export const useAppState=()=>({});'}));
 const colors=Array.from({length:14},(_,i)=>({id:i+1,code:`C${i+1}`,name:`Color ${i+1}`}));
 const styles=[{id:'s1',name:'Zulu',styleCode:'Z',customerId:2},{id:'s2',name:'Alpha',styleCode:'A',customerId:2}];
 let order={id:'order-1',orderNumber:'PO-1',buyerOrgId:2,buyerOrgName:'Customer',sellerOrgId:1,sellerOrgName:'BARO',sizeSetCode:'LEGACY_APPAREL',createdAt:'2026-10-01',items:[...colors.flatMap(color=>['M','W'].map(gender=>({id:`z-${color.id}-${gender}`,styleId:'s1',styleName:'Zulu',styleCode:'Z',colorId:color.id,colorCode:color.code,colorName:color.name,gender,sizeSetCode:'LEGACY_APPAREL',sizeQuantities:{S:10},totalQuantity:10}))),{id:'a-1',styleId:'s2',styleName:'Alpha',styleCode:'A',colorId:1,colorCode:'C1',colorName:'Color 1',gender:'M',sizeSetCode:'LEGACY_APPAREL',sizeQuantities:{S:10},totalQuantity:10}]},saved;
 await page.route('**/src/utils/orderApi.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const fetchOrders=async()=>JSON.parse(localStorage.getItem('dragOrder')||${JSON.stringify(JSON.stringify([order]))});export const updateOrder=async(id,payload)=>{window.savedOrder=payload;localStorage.setItem('dragOrder',JSON.stringify([payload]));return payload;};export const createOrder=updateOrder;export const deleteOrder=async()=>{};`}));
 await page.route('**/src/utils/styleApi.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const fetchStyles=async()=>${JSON.stringify(styles)};`}));
 await page.route('**/src/utils/attributeApi.js*',r=>r.fulfill({contentType:'application/javascript',body:`export const fetchAttributes=async()=>({colors:${JSON.stringify(colors)}});export const createColorAttribute=async()=>{};`}));
 await page.route('**/order-parties?*',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{buyerOrgOptions:[{id:2,name:'Customer'}],sellerOrgOptions:[{id:1,name:'BARO'}],currentOrg:{id:1,name:'BARO'},roleHint:'MANUFACTURER',relationshipPairs:[{brandOrgId:2,manufacturerOrgId:1}]}}));
 await page.goto(`http://127.0.0.1:${port}/order-layout-drag-acceptance.html`);
 const rows=page.locator('[data-order-style-item-row]'),scroll=page.locator('[data-order-items-scroll]');
 await page.getByRole('button',{name:'Reorder color',exact:true}).first().waitFor();
 const assertHandlePositions=async()=>{
  assert.equal(await rows.locator('td:first-child [data-order-color-drag]').count(),0,'Number cells contain no drag handles');
  for(const name of ['Reorder style','Reorder color']){
   const positions=await page.getByRole('button',{name,exact:true}).first().evaluate(button=>{
    const input=button.closest('td').querySelector('input');
    const a=button.getBoundingClientRect(),b=input.getBoundingClientRect();
    return {left:a.right<=b.left,centerDifference:Math.abs(a.y+a.height/2-b.y-b.height/2)};
   });
   assert.ok(positions.left,`${name} sits left of its selector`);
   assert.ok(positions.centerDifference<3,`${name} and its selector share one line`);
  }
 };
 await assertHandlePositions();
 assert.equal(await rows.count(),15,'One horizontal row per color, genders remain together');
 assert.equal(await rows.first().getByRole('combobox').first().inputValue(),'Zulu','Stored style order replaces alphabetical sorting');
 const header=scroll.locator('thead'),before=await header.boundingBox(),fields=await page.locator('input[name="orderNumber"]').boundingBox();
 await scroll.evaluate(node=>node.scrollTop=300);
 assert.ok(Math.abs((await header.locator('tr').first().locator('th').first().boundingBox()).y-before.y)<2);
 assert.equal((await page.locator('input[name="orderNumber"]').boundingBox()).y,fields.y);
 await scroll.evaluate(node=>node.scrollTop=0);
 const drag=async(from,to)=>{const a=await from.boundingBox(),b=await to.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2,a.y+a.height/2+8,{steps:3});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.mouse.up();};
 await drag(page.getByRole('button',{name:'Reorder color',exact:true}).nth(0),page.getByRole('button',{name:'Reorder color',exact:true}).nth(1));
 await page.waitForFunction(()=>document.querySelectorAll('[data-order-style-item-row]')[0].querySelectorAll('input')[1]?.value==='Color 2',{},{timeout:3000});
 // Move the last style above the first using keyboard dragging (Space / arrows / Space).
 await scroll.evaluate(node=>node.scrollTop=node.scrollHeight);
 const styleHandle=page.getByRole('button',{name:'Reorder style',exact:true}).last();
 await styleHandle.focus();await page.keyboard.press('Space');
 for(let i=0;i<12;i++)await page.keyboard.press('ArrowUp');
 await page.keyboard.press('Space');
 await scroll.evaluate(node=>node.scrollTop=0);
 await page.getByRole('button',{name:/^(Save|\uC800\uC7A5)$/}).first().click({timeout:5000});
 try{await page.waitForFunction(()=>!!window.savedOrder,{},{timeout:5000});}catch(error){throw new Error(JSON.stringify({notices:await page.evaluate(()=>window.notices),errors}));}
 saved=await page.evaluate(()=>window.savedOrder);
 assert.equal(saved.items[0].styleId,'s2');
 assert.deepEqual(saved.items.filter(row=>row.styleId==='s1').slice(0,4).map(row=>row.id),['z-2-M','z-2-W','z-1-M','z-1-W']);
 assert.ok(saved.items.every(row=>row.sizeQuantities.S===10));
 await page.reload();await page.getByRole('button',{name:'Reorder style',exact:true}).first().waitFor();
 assert.equal(await rows.first().getByRole('combobox').first().inputValue(),'Alpha');
 await page.getByRole('button',{name:'Vertical',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-order-style-item-row]').length===29);
 await assertHandlePositions();
 assert.equal(await page.getByRole('button',{name:'Reorder style',exact:true}).count(),2);
 assert.equal(await page.getByRole('button',{name:'Reorder color',exact:true}).count(),15);
 await drag(page.getByRole('button',{name:'Reorder style',exact:true}).first(),page.getByRole('button',{name:'Reorder style',exact:true}).last());
 await page.waitForFunction(()=>document.querySelector('[data-order-style-item-row] input')?.value==='Zulu');
 await page.getByRole('button',{name:/^(Save|\uC800\uC7A5)$/}).first().click();
 await page.waitForFunction(()=>window.savedOrder?.items[0]?.styleId==='s1');
 await page.evaluate(()=>{const [order]=JSON.parse(localStorage.getItem('dragOrder'));order.isModificationLocked=true;localStorage.setItem('dragOrder',JSON.stringify([order]));});
 await page.reload();await page.getByRole('button',{name:'Reorder style',exact:true}).first().waitFor();
 assert.ok(await page.locator('[data-order-color-drag]').evaluateAll(nodes=>nodes.every(node=>node.disabled)));
 assert.deepEqual(errors,[]);
 console.log('Order layout passed: sticky header, manual style/color dragging, complete gender blocks, save and reload preserve order and quantities.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
