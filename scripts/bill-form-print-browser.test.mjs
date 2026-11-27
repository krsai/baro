import {billFormHtmlV3} from '../frontend/src/utils/billFormPrintV3.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
import {billFormHtml} from '../frontend/src/utils/billFormPrint.mjs';
const require=createRequire(import.meta.url),{dexlBillLogo}=require('../backend/dist/assets/dexlBillLogo');
const directory=path.join(tmpdir(),'baro-bl-preview');mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const layout of ['v2','v3'])for(const kind of ['HOUSE','MASTER']){
  const document={number:'COPY-1',sourceVersion:3,kind:kind+'_DRAFT',snapshot:{issuer:{name:'DEX LOGIS'},source:{bill:{number:'DEXL2611001',kind},mode:'SEA',documentType:'BILL_OF_LADING',data:{logoDataUrl:dexlBillLogo,shipper:'Example Shipper\n115 Example Street\nHanoi, Vietnam',consignee:'Example Consignee\nSeoul, Korea',notify:'Same As Consignee',preCarriage:'',placeOfReceipt:'Haiphong Vietnam',vessel:'POS QINGDAO',voyage:'1073N',origin:'Haiphong Vietnam',destination:'Incheon Korea',placeOfDelivery:'Incheon Korea',finalDestination:'Incheon Korea',marks:'CFS/CFS\nSTYLE NO:\nCOLOR:\nMEN:\nWOMEN:\nCTN:',quantity:'77',unit:'CARTONS',cargo:Array.from({length:10},(_,i)=>'Garment Description '+(i+1)).join('\n'),weightKg:'1,040.00',cbm:'5.440',totalPackagesWords:'Seventy Seven (77) Cartons Only',freightTerms:'Freight Prepaid',prepaid:'As Arranged',freightPayableAt:'Haiphong Vietnam',originalCount:'0',issuePlace:'Haiphong Vietnam',issueDate:'2026-11-27',deliveryAgent:'Example Delivery Agent\nSeoul, Korea\nops@example.test',onBoardDate:'2026-11-27',surrenderStatus:'CONFIRMED',surrenderConfirmedAt:'2026-11-27',surrenderReference:'Carrier Confirmation REF-1'}}}};
  const page=await browser.newPage({viewport:{width:1000,height:1400}});await page.setContent((layout==='v3'?billFormHtmlV3:billFormHtml)(document));
  assert.equal(await page.locator(layout==='v3'?'.identity > div':'.header > div').count(),2);assert.equal(await page.locator(layout==='v3'?'.cargo > .cell':'.cargo > .field').count(),5);
  assert.equal(await page.locator('img.logo').evaluate(n=>n.complete&&n.naturalWidth===600),true);
  const overflowing=await page.locator(layout==='v3'?'.cell':'.field').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));assert.deepEqual(overflowing,[]);
  assert.equal(await page.getByText('DRAFT / FOR REVIEW',{exact:true}).count(),1);assert.equal(await page.locator('.surrender').count(),layout==='v2'||kind==='HOUSE'?1:0);
  const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  const pages=[...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.equal(pages,1,'The supplied BL structure with representative cargo must fit one A4 page');
  writeFileSync(path.join(directory,kind.toLowerCase()+'-'+layout+'.pdf'),pdf);await page.screenshot({path:path.join(directory,kind.toLowerCase()+'-'+layout+'.png'),fullPage:true});await page.close();
  console.log('PASS A4 BL print',layout,kind,directory);
 }
}finally{await browser.close();}
