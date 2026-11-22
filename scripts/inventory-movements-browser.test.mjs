import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';

const fixture='frontend/inventory-movement-acceptance.html',port=43293;
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Route,Routes} from 'react-router-dom';import {InventoryEntry,InventoryRows} from '/src/pages/App/inventory/InventoryMovements.jsx';
import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(MemoryRouter,{initialEntries:['/inventory/movements/new']},React.createElement(Routes,null,React.createElement(Route,{path:'/inventory/movements/new',element:React.createElement(InventoryEntry)}),React.createElement(Route,{path:'/inventory/movements',element:React.createElement(InventoryRows,{view:'history'})})))));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/inventory-movement-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 const master={id:'box',data:{nameEn:'Carton Box',nameKo:'Carton Box',nameVi:'Carton Box',baseSnapshot:{code:'CTN'},unit:{nameEn:'Each',nameKo:'Each',nameVi:'Each'}}};
 const people=[{id:3,employeeNo:'E003',name:'Drafter'},{id:4,employeeNo:'E004',name:'Warehouse user'}];
 const items=[{id:'own',masterId:'box',baseId:1,revision:2,master:master.data,attributes:{owner:{id:1,name:'BARO'},type:{nameEn:'10x10x10'},color:{code:'RED',nameEn:'Red'},dimensions:{}}},{id:'other',masterId:'box',baseId:1,revision:1,master:master.data,attributes:{owner:{id:2,name:'THE SAN'},type:{nameEn:'20x20x20'},color:null,dimensions:{}}}];
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
 const {materialItemText}=await import('../frontend/src/constants/materialItems.js');
 const {inventoryEntryText}=await import('../frontend/src/constants/inventoryEntry.js');
 const {inventoryApprovalText}=await import('../frontend/src/constants/inventoryApproval.js');
 const {EXPENSE_LOOKUP_TEXT}=await import('../frontend/src/constants/expenseLookup.js');
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const mode of ['other','self','issue']){
  const page=await browser.newPage({viewport:{width,height:900}}),writes=[],errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const t=materialItemText[lang],e=inventoryEntryText[lang],a=inventoryApprovalText[lang],l=EXPENSE_LOOKUP_TEXT[lang],item=items[mode==='self'?0:1];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useLanguage=()=>({languageCode:'+JSON.stringify(lang)+'});'}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const noop=()=>{};const a={showNotification:noop,setUnsavedChangesGuard:noop,clearUnsavedChangesGuard:noop,markTabChanged:noop,clearTabChanged:noop};export const useAppActions=()=>a;'}));
  await page.route('**/inventory-entry**',r=>{
   const req=r.request(),path=new URL(req.url()).pathname;if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});
   if(path.endsWith('/approval-preview')){const drafter={id:3,name:'Drafter',orgRole:'ADMIN',gradeId:1,grade:{id:1,name:'Director',nameEn:'Director',nameKo:'Director',nameVi:'Director'}};return r.fulfill({headers,json:{policy:{revision:1},drafter,automatic:true,stages:[{employeeId:3,name:'Drafter',role:'ADMIN',key:'final-self',candidates:[drafter]}]}});}
   if(path.endsWith('/approvals'))return r.fulfill({headers,json:[]});
   if(path.endsWith('/purchase-expenses'))return r.fulfill({headers,json:[{expenseItemId:'purchase-line',requestId:1,version:1,managementNumber:'EXP-1',requestDate:'2026-11-19',line:1,description:'Carton purchase',quantity:'100'}]});
   if(path.endsWith('/items'))return r.fulfill({headers,json:items.map(row=>({...row,materialSettings:{masterInputs:{color:mode==='other'?'REQUIRED':'HIDDEN'}}}))});
   if(path.endsWith('/options'))return r.fulfill({headers,json:{colors:[{id:1,code:'WHT',nameEn:'White',nameKo:'White',nameVi:'White'}]}});
   if(path.endsWith('/employees'))return r.fulfill({headers,json:{currentEmployeeId:3,employees:people}});
   if(path.endsWith('/history'))return r.fulfill({headers,json:[{id:'one',status:'PENDING',revision:1,date:'2026-11-20',quantity:mode==='issue'?'-1250.0000':'1250.0000',remark:'Remark test',master:master.data,attributes:item.attributes,userSnapshot:people[1]}]});
   if(req.method()!=='POST')throw Error('Unexpected endpoint '+path);
   writes.push(req.postDataJSON());return r.fulfill({headers,status:201,json:{id:'one'}});
  });
  await page.goto('http://127.0.0.1:'+port+'/inventory-movement-acceptance.html',{timeout:60000});
  await page.getByRole('heading',{name:a.register,exact:true}).waitFor();
  const header=page.getByTestId('document-entry-header'),lines=page.getByTestId('inventory-entry-lines');
  assert.equal(await header.getByRole('textbox',{name:e.user,exact:true}).count(),0);
  assert.equal(await header.getByRole('combobox').count(),0,'header contains date and approval summary only');
  assert.deepEqual(await lines.locator('thead th').allTextContents(),[e.user,e.direction,e.material,({ko:'수량',en:'Quantity',vi:'Số lượng'})[lang],t.unit]);
  const user=lines.getByRole('textbox',{name:e.user,exact:true});await user.fill('E004');await user.press('Enter');assert.match(await user.inputValue(),/Warehouse user/);
  if(mode==='issue'){await lines.getByRole('combobox',{name:e.direction,exact:true}).click();await page.getByRole('option').nth(1).click();}
  const material=lines.getByRole('textbox',{name:e.material,exact:true});await material.fill('CTN');await material.press('Enter');
  const chooser=page.getByRole('dialog');await chooser.waitFor();
  assert.equal(writes.length,0);assert.ok((await lines.locator('input[aria-label]').evaluateAll(nodes=>nodes.map(node=>node.value))).includes('CTN'),'code alone must not select a stock item');
  const target=chooser.getByRole('row').filter({has:page.getByRole('cell',{name:mode==='self'?'BARO':'THE SAN',exact:true})});
  await target.getByRole('button',{name:l.select,exact:true}).click();await chooser.waitFor({state:'hidden'});
  assert.match(await material.inputValue(),mode==='self'?/10x10x10/:/20x20x20/);
  if(mode==='other'){const color=lines.getByRole('textbox',{name:t.color,exact:true});await color.fill('WHT');await color.press('Enter');}
  else assert.equal(await lines.getByRole('textbox',{name:t.color,exact:true}).count(),0);
  const unit=lines.getByRole('textbox',{name:t.unit,exact:true});assert.equal(await unit.inputValue(),'Each');assert.equal(await unit.getAttribute('readonly'),'');
  if(mode==='self'){await page.getByRole('textbox',{name:a.purchase,exact:true}).fill('EXP-1-1');await page.getByRole('textbox',{name:a.purchase,exact:true}).press('Enter');}
  else assert.equal(await page.getByRole('textbox',{name:a.purchase,exact:true}).count(),0);
  await lines.locator('tbody td').nth(mode==='other'?4:3).getByRole('textbox').fill('1250');await page.getByRole('textbox',{name:e.remark,exact:true}).fill('Remark test');
  if(width===1440){const boxes=await lines.locator('tbody td').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().y));assert.ok(Math.max(...boxes)-Math.min(...boxes)<1);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'table scroll stays inside page');
  if(lang==='ko'&&width===1440&&mode==='other')await page.screenshot({path:'logs/inventory-entry-preview.png'});
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByTestId('approval-dialog-flow').waitFor();assert.equal(writes.length,0);
  await page.getByRole('dialog').getByText(/Warehouse user/).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:a.cancel,exact:true}).click();assert.equal(await page.getByRole('textbox',{name:e.remark,exact:true}).inputValue(),'Remark test');
  await page.getByRole('button',{name:t.save,exact:true}).click();await page.getByRole('button',{name:a.submit,exact:true}).click();
  await page.getByRole('cell',{name:mode==='issue'?'-1,250':'1,250',exact:true}).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].colorId,mode==='other'?1:null);assert.equal(writes[0].masterId,'box');assert.equal(writes[0].variantId,item.id);assert.equal(writes[0].variantRevision,item.revision);assert.equal(writes[0].userEmployeeId,4);assert.equal(writes[0].quantity,mode==='issue'?'-1250':'1250');assert.equal(writes[0].remark,'Remark test');assert.equal(writes[0].expenseItemId,mode==='self'?'purchase-line':null);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS ko/en/vi PC/mobile: date header, employee/direction/item/quantity/unit row, registered item picker, read-only unit, remark, purchase and approval flow.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
