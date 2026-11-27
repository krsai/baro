import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{dexlBillLogo}=require('../backend/dist/assets/dexlBillLogo');
import {chromium} from 'playwright-core';
import {billWorkflowText} from '../frontend/src/constants/billWorkflow.js';
import {shippingBillText} from '../frontend/src/constants/shippingBills.js';
const html='frontend/bill-workflow-test.html',jsx='frontend/bill-workflow-test.jsx',port=43573;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/bill-workflow-test.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{ThemeProvider,CssBaseline,DialogTitle,DialogContent,Button}from'@mui/material';import{createAppTheme}from'/src/theme';import AppDialog from'/src/components/AppDialog';import Work from'/src/components/ShippingWorkDocuments';import Bills from'/src/components/ShippingBills';import{requestJSON,setRequestContext}from'/src/utils/apiClient';const q=new URLSearchParams(location.search),lang=q.get('lang');setRequestContext({accessToken:'test',userEmail:'test@example.test',orgId:7});function App(){const[job,setJob]=React.useState(null),[editor,setEditor]=React.useState(null);const load=()=>requestJSON('/test-job',{skipCache:true}).then(setJob);React.useEffect(()=>{load();},[]);const forwarder={id:7,code:'DEXL',name:'DEX LOGIS',address:'Forwarder Address',representative:'Representative'};return <ThemeProvider theme={createAppTheme(q.get('theme'))}><CssBaseline/>{job&&<><Work toolbar job={job} orgId={7} languageCode={lang} forwarder={forwarder} onOpen={id=>setEditor({id,key:crypto.randomUUID()})} onCreate={(kind,masterId,creation)=>setEditor({kind,masterId,...creation,key:crypto.randomUUID()})} onChanged={load}/><AppDialog open={!!editor} fullWidth maxWidth="xl" onClose={()=>setEditor(null)}><DialogTitle>BL Editor <Button onClick={()=>setEditor(null)}>Return</Button></DialogTitle><DialogContent>{editor&&<Bills key={editor.key} job={job} orgId={7} languageCode={lang} forwarder={forwarder} branding={{version:0,canEdit:true,logoDataUrl:${JSON.stringify(dexlBillLogo)}}} initialKind={editor.kind} initialMasterId={editor.masterId} initialBillId={editor.id} partyMode={editor.partyMode} createHouseAfterMaster={editor.createHouse} onChanged={load}/>}</DialogContent></AppDialog></>}</ThemeProvider>;}createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser,currentPage;
try{
 for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}/bill-workflow-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const theme of ['standard','compact'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width===390}),errors=[],saves=[],t=billWorkflowText[lang],bt=shippingBillText[lang];currentPage=page;page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('dialog',d=>d.accept());
  const data={origin:'Haiphong',destination:'Incheon',shipper:'SHIPPER ORIGINAL',consignee:'CONSIGNEE ORIGINAL',notify:'NOTIFY ORIGINAL',cargo:'Original Cargo',quantity:'77',unit:'CTN',weightKg:'1040',cbm:'5.440'};
  if(process.argv.includes('--shared-containers-only'))Object.assign(data,{shipmentType:'FCL',containers:[{size:'20',type:'DC',count:'1'}]});
  let autoNumber=0;const logos=[];
  const job={id:'job',orgId:7,version:1,number:'JOB-1',mode:'SEA',service:'GENERAL',status:'DRAFT',receiptStatus:'ACCEPTED',data,bills:[{id:'m1',jobId:'job',kind:'MASTER',number:'M-1',version:1,data:{}},{id:'m2',jobId:'job',kind:'MASTER',number:'M-2',version:1,data:{}},{id:'h1',jobId:'job',kind:'HOUSE',number:'H-1',masterId:'m1',version:1,data:{}}],documents:[]};
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={showNotification(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){}};export const useAppActions=()=>a;'}));
  await page.route('**/src/components/ShippingChargeDrafts.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export default function(){return null;}'}));
  await page.route('**/text-acronyms',r=>r.fulfill({json:{revision:0,entries:[]}}));
  await page.route('**/freight/transport-jobs/bill-branding*',r=>{logos.push(r.request().postDataJSON());return logos.length===1?r.fulfill({status:503,json:{error:'UNCONFIRMED'}}):r.fulfill({json:{version:1,logoDataUrl:logos[0].logoDataUrl}});});
  await page.route('**/test-job',r=>r.fulfill({json:job}));
  await page.route('**/freight/transport-jobs/job/bills**',r=>{
   const body=r.request().postDataJSON();saves.push(body);const previous=job.bills.find(row=>row.id===body.id);const row={...body,number:body.kind==='HOUSE'&&!body.number?'DEXL2611'+String(++autoNumber).padStart(3,'0'):body.number,jobId:'job',version:(previous?.version||0)+1,houseNumberManaged:body.kind==='HOUSE'};job.bills=job.bills.filter(b=>b.id!==row.id).concat(row);return r.fulfill({json:row});
  });
  await page.goto(`http://127.0.0.1:${port}/bill-workflow-test.html?lang=${lang}&theme=${theme}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('[data-bl-tab=MASTER]').waitFor();
  for(const kind of ['MASTER','HOUSE']){const tab=page.locator('[data-bl-tab='+kind+']');assert.equal(await tab.locator('button').count(),2);assert.equal(await tab.locator('button button').count(),0);const bounds=await tab.boundingBox();for(const button of await tab.locator('button').all()){const b=await button.boundingBox();assert.ok(b.x>=bounds.x&&b.x+b.width<=bounds.x+bounds.width+1);}}
  if(process.argv.includes('--tabs-only')){console.log('PASS BL split tabs '+lang+' '+theme+' '+width);await page.close();continue;}
  await page.getByRole('button',{name:'Master BL (2)',exact:true}).click();
  if(process.argv.includes('--shared-containers-only')){await page.getByRole('button',{name:'M-1',exact:true}).click();const dialog=page.getByRole('dialog');const container=dialog.locator('[data-bl-region=containers] [data-container-row]');await container.waitFor();const count=container.locator('input').first();assert.equal(await count.inputValue(),'1');await count.fill('3');await dialog.getByRole('button',{name:bt.save,exact:true}).click();await page.waitForTimeout(300);assert.equal(saves.length,1);assert.deepEqual(saves[0].data.containers,[{size:'20',type:'DC',count:'3'}]);assert.deepEqual(errors,[]);console.log('PASS BL shared container edit',lang,theme,width);await page.close();continue;}
  await page.getByRole('button',{name:'M-1',exact:true}).waitFor();await page.getByRole('button',{name:'H-1',exact:true}).waitFor();assert.equal(saves.length,0);
  await page.getByRole('button',{name:t.addMaster,exact:true}).click();await page.getByRole('button',{name:t.direct,exact:true}).click();
  const number=page.locator('input[name="billNumber"]');await number.fill('WRONG DRAFT');
  await page.getByRole('button',{name:t.restart,exact:true}).click();await page.getByRole('button',{name:t.combined,exact:true}).click();
  assert.equal(await number.inputValue(),'');assert.match(await page.getByRole('textbox',{name:'Shipper',exact:true}).inputValue(),/DEX LOGIS/);
  await number.fill('M-NEW');await page.getByRole('button',{name:bt.save,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[name="billNumber"]')?.readOnly===true);
  assert.equal(saves.length,1);assert.equal(saves[0].kind,'MASTER');
  assert.match(await page.getByRole('textbox',{name:'Shipper',exact:true}).inputValue(),/SHIPPER ORIGINAL/);
  await page.getByRole('textbox',{name:'Description Of Packages And Goods',exact:true}).fill('House Cargo');
  await page.getByRole('combobox',{name:/^Surrender/}).click();await page.getByRole('option',{name:t.confirmed,exact:true}).click();
  await page.getByLabel(t.confirmDate,{exact:true}).fill('2026-11-27');await page.getByRole('textbox',{name:t.reference,exact:true}).fill('Carrier REF-1');
  await page.getByRole('button',{name:bt.save,exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[name="billNumber"]')?.value==='DEXL2611001');
  assert.equal(saves.length,2);assert.equal(saves[1].number,'');assert.equal(saves[1].masterId,saves[0].id);assert.equal(saves[1].data.surrenderStatus,'CONFIRMED');assert.equal(data.cargo,'Original Cargo');
  for(const region of ['route','cargo','freight','delivery'])assert.equal(await page.locator('[data-bl-region="'+region+'"]').count(),1);
  const bounds=await page.locator('[data-bl-document-layout]').evaluate(n=>({width:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth+2}));assert.equal(bounds.overflow,false,JSON.stringify(bounds));
  await page.locator('summary').filter({hasText:t.logo}).click();await page.getByRole('button',{name:t.saveLogo,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[name=\"cargo\"]')?.disabled===true);
  await page.getByRole('button',{name:bt.retry,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[name=\"cargo\"]')?.disabled===false);
  assert.deepEqual(logos[0],logos[1]);assert.equal(saves.length,2);await page.locator('summary').filter({hasText:t.logo}).click();
  await page.getByRole('textbox',{name:'Shipper',exact:true}).fill('Incorrect Party');
  await page.getByRole('button',{name:t.reapply,exact:true}).click();
  assert.match((await page.getByRole('textbox',{name:'Shipper',exact:true}).inputValue()).toUpperCase(),/SHIPPER ORIGINAL/);
  assert.equal(await number.inputValue(),'DEXL2611001');
  if(lang==='en'&&theme==='standard'){const dir=path.join(tmpdir(),'baro-bl-preview');mkdirSync(dir,{recursive:true});await page.locator('.MuiDialogContent-root').first().evaluate(n=>n.scrollTop=0);await page.screenshot({path:path.join(dir,'editor-'+width+'.png')});}
  await page.getByRole('button',{name:'Return',exact:true}).click();await page.getByRole('button',{name:'House BL (2)',exact:true}).click();
  await page.getByRole('button',{name:'DEXL2611001',exact:true}).waitFor();
  await page.getByRole('button',{name:t.addHouse,exact:true}).click();await page.getByRole('button',{name:t.standalone,exact:true}).click();
  assert.equal(await number.inputValue(),'');await page.getByRole('button',{name:bt.save,exact:true}).click();await page.waitForFunction(()=>document.querySelector('input[name=\"billNumber\"]')?.value==='DEXL2611002');assert.equal(saves.at(-1).masterId,null);
  job.bills=[];await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:t.addMaster,exact:true}).click();await page.getByRole('button',{name:t.direct,exact:true}).click();
  assert.equal(await page.locator('[data-shipping-bills] [data-list-detail-list]').count(),0,'first BL uses the full form without a dummy empty list');
  await page.locator('[data-bl-document-layout]').waitFor();
  if(lang==='en'&&theme==='standard'){const dir=path.join(tmpdir(),'baro-bl-preview');await page.screenshot({path:path.join(dir,'editor-new-'+width+'.png')});}
  assert.deepEqual(errors,[]);console.log('PASS BL workflow',lang,theme,width);await page.close();
 }
}catch(error){if(currentPage&&!currentPage.isClosed())console.log('BL_DIAGNOSTIC',await currentPage.evaluate(()=>({selects:[...document.querySelectorAll('[role="combobox"]')].map(n=>({label:n.getAttribute('aria-label'),labelled:n.getAttribute('aria-labelledby'),text:n.textContent})),surrender:document.querySelector('[data-bl-surrender]')?.textContent,body:document.body.innerText.slice(-1600)})));throw error;}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
