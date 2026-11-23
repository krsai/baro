import {exactLabel} from './helpers/case-insensitive-label.mjs';
import {titleCaseWords} from '../frontend/src/utils/humanTextCase.mjs';
import {shippingBillText} from '../frontend/src/constants/shippingBills.js';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {shippingTradeText} from '../frontend/src/constants/shippingTrade.js';
import {shippingWorkbenchText} from '../frontend/src/constants/shippingWorkbench.js';
const file='frontend/shipping-trade-test.html',port=43546;assert.ok(!existsSync(file));
const fixture=readFileSync('scripts/shipping-overview-browser.test.mjs','utf8').match(/writeFileSync\(file,`([\s\S]*?)`\);/)[1].replace("initialEntries:['/shipping']","initialEntries:['/shipping?id=job1&stage=documents']");writeFileSync(file,fixture);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/shipping-trade-test.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],t=shippingTradeText[lang],w=shippingWorkbenchText[lang];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useAuth=()=>({activeOrgId:7,activeOrgType:'SERVICE'});"}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const a={markTabChanged(){},clearTabChanged(){},showNotification(){},setUnsavedChangesGuard(){},clearUnsavedChangesGuard(){}};export const useAppActions=()=>a;'}));
  const p={name:'EXPORTER',address:'HANOI, VIETNAM',phone:'00123',contactName:'CONTACT',email:'contact@example.test'},buyer={...p,name:'IMPORTER',address:'SEOUL, KOREA'};
  let job={id:'job1',number:'JOB-001',version:1,receiptStatus:'ACCEPTED',status:'DRAFT',mode:'SEA',service:'GENERAL',data:{shipperParty:p,consigneeParty:buyer,notifyParty:buyer,notifySameAsConsignee:true,customer:p,origin:'HANOI',destination:'SEOUL',cargo:'JACKETS',documentSetup:{composition:'MASTER_HOUSE',documentType:'BILL_OF_LADING'}},bills:[{id:'h1',kind:'HOUSE',number:'H-001',issuer:'DEX',masterId:null,version:1}]},docs=[],requests=[],attempts=0;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  await page.route('**/freight/**',r=>{const req=r.request(),route=new URL(req.url()).pathname.split('/freight/')[1];if(req.method()==='OPTIONS')return r.fulfill({headers,status:204});let json;
   if(route==='options')json=[];else if(route==='transport-jobs/options')json={forwarder:{id:7,name:'DEX'},employees:[],currencies:[{code:'USD'},{code:'VND'}]};
   else if(route==='transport-jobs/job1')json={...job,documents:docs.map(({snapshot,...meta})=>({...meta,sourceMode:snapshot.tradeDocument.sourceMode}))};
   else if(route==='transport-jobs/job1/bills/h1'){job={...job,bills:[{...req.postDataJSON(),version:2}]};json=job.bills[0];}
   else if(route==='transport-jobs/job1/trade-documents'){
    const input=req.postDataJSON();if(input.sourceMode==='FORM'){assert.equal('total' in input.fields,false);assert.equal('totals' in input.fields,false);}requests.push(input);attempts++;if(attempts===1)return r.fulfill({headers,status:503,json:{error:'RESPONSE_UNKNOWN'}});
    if(attempts===2)assert.deepEqual(input,requests[0]);
    const tradeDocument=input.sourceMode==='FILE'?{sourceMode:'FILE',file:input.file}:{sourceMode:'FORM',fields:{...input.fields,lines:input.fields.lines.map(line=>({...line,...(input.kind==='COMMERCIAL_INVOICE'?{amount:'1.01'}:{})})),...(input.kind==='COMMERCIAL_INVOICE'?{total:'1.01'}:{totals:{packages:'2',netWeightKg:'1.1',grossWeightKg:'1.2',cbm:'0.23'}})}};
    json={id:'doc-'+attempts,kind:input.kind,number:input.fields?.number||input.file.name,sourceVersion:job.version,createdAt:new Date().toISOString(),snapshot:{layout:'trade-v1',tradeDocument,source:{id:'job1',number:'JOB-001'}}};docs=[json,...docs];
   }else if(route.startsWith('documents/'))json=docs.find(doc=>doc.id===route.split('/')[1]);else throw Error('Unexpected request '+route);return r.fulfill({headers,json});
  });
  await page.route('**/shipping-requests/job1/charges*',r=>r.fulfill({headers,json:{rows:[],currencies:[{code:'USD'}]}}));
  await page.goto(`http://127.0.0.1:${port}/shipping-trade-test.html`);await page.getByRole('button',{name:exactLabel(t.write)}).click();const form=page.locator('[data-shipping-trade-form]');await form.getByRole('textbox',{name:exactLabel(t.number)}).fill('CI-001');await form.getByRole('combobox',{name:exactLabel(t.currency)}).click();await page.getByRole('option',{name:'USD',exact:true}).click();
  const item=form.locator('[data-trade-line]').first();for(const [key,value]of [['description','JACKETS'],['quantity','3'],['unit','PCS'],['unitPrice','0.3350']])await item.getByRole('textbox',{name:titleCaseWords(t[key]),exact:true}).fill(value);
  await page.getByRole('tab',{name:exactLabel(shippingBillText[lang].transportDetails)}).click();assert.equal(await form.getByRole('textbox',{name:exactLabel(t.number)}).inputValue(),'CI-001');assert.equal(await item.getByRole('textbox',{name:exactLabel(t.unitPrice)}).inputValue(),'0.3350');
  if(lang==='ko'&&width===1440)await page.screenshot({path:path.join(tmpdir(),'baro-commercial-invoice-form.png'),fullPage:true});
  await form.getByRole('button',{name:exactLabel(t.save)}).click();await page.getByRole('button',{name:exactLabel(t.retry)}).click();const preview=page.getByRole('dialog');await preview.locator('iframe').waitFor();assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/COMMERCIAL INVOICE/);assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/1\.01/);await preview.getByRole('button',{name:exactLabel(t.close)}).click();
  await page.getByRole('combobox',{name:exactLabel(t.kind)}).click();await page.getByRole('option',{name:t.PACKING_LIST,exact:true}).click();await page.getByRole('button',{name:exactLabel(t.write)}).click();await form.getByRole('textbox',{name:exactLabel(t.number)}).fill('PL-001');const pack=form.locator('[data-trade-line]').first();for(const [key,value]of [['description','JACKETS'],['quantity','3'],['unit','PCS'],['packages','2'],['netWeightKg','1.1'],['grossWeightKg','1.2'],['cbm','0.23']])await pack.getByRole('textbox',{name:titleCaseWords(t[key]),exact:true}).fill(value);await form.getByRole('button',{name:exactLabel(t.save)}).click();await preview.locator('iframe').waitFor();assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/PACKING LIST/);await preview.getByRole('button',{name:exactLabel(t.close)}).click();
  await page.getByRole('combobox',{name:exactLabel(t.kind)}).click();await page.getByRole('option',{name:t.COMMERCIAL_INVOICE,exact:true}).click();const bytes=Buffer.from('%PDF-1.4\nORIGINAL CUSTOMER FILE\n%%EOF');await page.locator('input[type=file]').setInputFiles({name:'customer-original.pdf',mimeType:'application/pdf',buffer:bytes});await page.getByRole('cell',{name:'customer-original.pdf',exact:true}).waitFor();const downloaded=page.waitForEvent('download');await page.getByRole('row').filter({has:page.getByRole('cell',{name:'customer-original.pdf',exact:true})}).getByRole('button',{name:exactLabel(t.download)}).click();assert.equal((await downloaded).suggestedFilename(),'customer-original.pdf');assert.deepEqual(Buffer.from(requests.at(-1).file.base64,'base64'),bytes);
  const copyRow=page.getByRole('row').filter({has:page.getByRole('cell',{name:'CI-001',exact:true})});await copyRow.getByRole('button',{name:exactLabel(t.copy)}).click();await form.getByRole('textbox',{name:exactLabel(t.number)}).fill('CI-002');await form.getByRole('button',{name:exactLabel(t.save)}).click();await preview.locator('iframe').waitFor();assert.match(await preview.locator('iframe').getAttribute('srcdoc'),/CI-002/);await preview.getByRole('button',{name:exactLabel(t.close)}).click();assert.equal(requests.at(-1).fields.number,'CI-002');
  await page.getByRole('tab').first().waitFor();assert.equal(await page.getByRole('tab').count(),2);assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS CI/PL form, original file/download, retry, shared-page draft preservation',lang,width);
 }
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
