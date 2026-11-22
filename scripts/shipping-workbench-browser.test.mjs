import {shippingTradeText} from '../frontend/src/constants/shippingTrade.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
import {freightText} from '../frontend/src/constants/freight.js';
const file='frontend/shipping-workbench-test.html',port=43543;
assert.ok(!existsSync(file));
const fixture=readFileSync('scripts/shipping-overview-browser.test.mjs','utf8').match(/writeFileSync\(file,`([\s\S]*?)`\);/)[1].replace("initialEntries:['/shipping']","initialEntries:['/shipping?id=job1']");
writeFileSync(file,fixture);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-workbench-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=shippingWorkbenchText[lang],f=freightText[lang];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
  await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:7,activeOrgType:'SERVICE'});"}));
  await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'const a={markTabChanged(){},clearTabChanged(){},showNotification(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){}};export const useAppActions=()=>a;'}));
  const party={name:'SENDER',address:'HANOI ROAD',phone:'00123'},receiver={name:'RECEIVER',address:'SEOUL ROAD'};
  let job={id:'job1',number:'JOB-001',orgId:7,mode:'SEA',service:'GENERAL',receiptStatus:'ACCEPTED',status:'DRAFT',version:1,data:{customer:party,shipperParty:party,consigneeParty:receiver,notifyParty:receiver,notifySameAsConsignee:true,cargo:'Jackets',quantity:'10',weightKg:'20',cbm:'1.20',origin:'HANOI',destination:'SEOUL',routeLocations:{ORIGIN_DOOR:'HANOI',ORIGIN_TERMINAL:'HAIPHONG',DESTINATION_TERMINAL:'INCHEON',DESTINATION_DOOR:'SEOUL'},workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},documentSetup:{composition:'MASTER_HOUSE',documentType:'BILL_OF_LADING'}},bills:[{id:'m1',kind:'MASTER',number:'M-001',issuer:'CARRIER'},{id:'h1',kind:'HOUSE',number:'H-001',issuer:'DEX',masterId:'m1'}],documents:[]},progressRequests=[],copies=[],charges=[],chargeRequests=[];
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/freight/**',route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname.split('/freight/')[1];if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});let json;
   if(p==='options')json=[];else if(p==='transport-jobs/options')json={forwarder:{id:7,name:'DEX'},employees:[{id:9,name:'Operator',employeeNo:'OPS'}]};
   else if(p==='transport-jobs/job1')json={...job,documents:copies};
   else if(p==='transport-jobs/job1/progress'){
    const input=req.postDataJSON();progressRequests.push(input);if(progressRequests.length===1)return route.fulfill({headers,status:503,json:{error:'RESPONSE_UNKNOWN'}});
    assert.deepEqual(input,progressRequests[0]);job={...job,version:job.version+1,status:input.status,data:{...job.data,operations:{tasks:input.tasks}}};json=job;
   }else if(p==='transport-jobs/job1/documents'){
    const input=req.postDataJSON();assert.equal(input.fields.vessel,'TEST VESSEL');json={id:'doc1',kind:input.kind,number:'AN-COPY',sourceVersion:job.version,createdAt:new Date().toISOString(),snapshot:{layout:'transport-v1',issuer:{name:'DEX',address:'HANOI'},source:{...job,data:{shipper:'SENDER',consignee:'RECEIVER',cargo:'Jackets',origin:'HANOI',destination:'SEOUL',weightKg:'20'}},draft:true}};copies=[json];
   }else if(p==='documents/doc1')json=copies[0];else throw Error('Unexpected freight request '+p);
   return route.fulfill({headers,json});
  });
  await page.route('**/shipping-requests/job1/charges*',route=>{const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});if(req.method()==='POST'){const input=req.postDataJSON();chargeRequests.push(input);const row={...input,version:1};charges=[...charges.filter(p=>p.id!==row.id),row];return route.fulfill({headers,json:row});}return route.fulfill({headers,json:{rows:charges,currencies:[{code:'USD'},{code:'VND'}]}});});
  await page.goto(`http://127.0.0.1:${port}/shipping-workbench-test.html`);await page.getByRole('tab',{name:shippingTradeText[lang].work,exact:true}).waitFor();assert.equal(await page.getByRole('tab').count(),2);
  assert.equal(await page.locator('[data-route-node]:visible').count(),0,'large route cards are collapsed');assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
  if(lang==='ko'&&width===1440)await page.screenshot({path:path.join(tmpdir(),'baro-shipping-waybill.png')});
  await page.getByRole('button',{name:t.add,exact:true}).click();const row=page.locator('[data-progress-task]').first();await row.getByRole('textbox',{name:t.title,exact:true}).fill('Departure check');await row.getByLabel(t.due,{exact:true}).fill('2026-01-01T12:00');const assignee=row.getByRole('textbox',{name:t.owner,exact:true});await assignee.fill('OPS');await assignee.press('Enter');
  await row.getByRole('combobox',{name:t.state,exact:true}).click();await page.getByRole('option',{name:t.DOING,exact:true}).click();await page.getByRole('button',{name:t.save,exact:true}).click();const retry=page.getByRole('button',{name:t.retry,exact:true});await retry.waitFor();assert.equal(await row.getByRole('textbox',{name:t.title,exact:true}).isDisabled(),true);await retry.click();await page.waitForFunction(()=>!document.querySelector('[data-progress-task] input')?.disabled);assert.equal(progressRequests.length,2);assert.equal(progressRequests[0].tasks[0].assigneeId,9);assert.ok(progressRequests[0].tasks[0].dueAt.endsWith('Z'));
  await page.getByRole('tab',{name:shippingTradeText[lang].documents,exact:true}).click();await page.getByRole('button',{name:new RegExp(t.outputFields)}).click();await page.getByRole('textbox',{name:f.vessel,exact:true}).fill('TEST VESSEL');await page.getByRole('button',{name:t.create,exact:true}).click();const preview=page.getByRole('dialog');await preview.waitFor();await preview.locator('iframe').waitFor();assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/ARRIVAL NOTICE/);assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/DRAFT \/ FOR REVIEW/);await preview.getByRole('button',{name:t.close,exact:true}).click();
  await page.getByRole('button',{name:t.addCharge,exact:true}).click();const entry=page.locator('[data-charge-draft]');await entry.getByRole('textbox',{name:t.description,exact:true}).fill('Ocean freight');await entry.getByRole('combobox',{name:t.currency,exact:true}).click();await page.getByRole('option',{name:'USD',exact:true}).click();await entry.getByRole('textbox',{name:t.amount,exact:true}).fill('100.25');await entry.getByRole('button',{name:t.save,exact:true}).click();await entry.getByRole('textbox',{name:t.description,exact:true}).and(page.locator('[value=""]')).waitFor();assert.equal(chargeRequests[0].direction,'PURCHASE');assert.equal(chargeRequests[0].amount,'100.25');assert.equal(await entry.getByRole('combobox',{name:t.currency,exact:true}).textContent(),'USD');assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS workbench summary, uncertain progress retry, assignee, documents, continuous charges',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
