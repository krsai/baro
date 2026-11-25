import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const file=path.resolve('frontend/invoice-pdf-layout-test.html');assert.ok(!existsSync(file));
writeFileSync(file,`<div></div><script type="module">import {buildIssuedInvoicePdfBlob} from '/src/utils/issuedInvoicePdf.js';window.generate=buildIssuedInvoicePdfBlob;</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','43519','--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const invoice={status:'ISSUED',invoiceNumber:'INV-2026-000003',snapshot:{templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',currencyCode:'KRW',subtotal:'590000',vatAmount:'0',total:'590000',orders:[],fields:{number:'INV-2026-000003',date:'2026-11-25',seller:{name:'BARO GARMENT',address:'115 Ngoc Truc 57, Ngoc Truc Village, Dai Mo, Hanoi, Vietnam',contactName:'Jeong Dongwon',phone:'+84 0855500100',email:'krsailer82@gmail.com'},buyer:{name:'THE SAN',taxId:'3498800301',address:'26-3, Eonju-Ro 170-Gil, Gangnam-Gu, Seoul, Republic Of Korea'},notes:'',bankAccounts:[1,2,3].map(n=>({id:String(n),snapshot:{bankName:'Bank '+n,accountNumber:'8224010418137'+n,accountHolder:'BARO GARMENT',currencyCode:'KRW',swiftCode:'ASCBVNVX'}}))},lines:[{description:'Poly Bag / 30 x 40 x 0.08',unit:'Piece',quantity:'10000',currencyCode:'KRW',unitPrice:'44',vatRate:'0',vatAmount:'0',amount:'440000'},{description:'Tissue Paper / 35 x 25',unit:'Piece',quantity:'20000',currencyCode:'KRW',unitPrice:'7.5',vatRate:'0',vatAmount:'0',amount:'150000'}]}};
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:43519/'+path.basename(file))).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage();
 await page.addInitScript(()=>{window.layouts=[];const remove=Element.prototype.remove;Element.prototype.remove=function(){if(this.title==='Invoice PDF renderer'){const d=this.contentDocument,main=d.querySelector('main'),width=d.body.clientWidth;window.layouts.push({width,scroll:d.body.scrollWidth,lang:d.documentElement.lang,title:d.querySelector('h1').textContent,number:d.querySelector('.invoice-document-identifiers').innerText,overflows:[...d.querySelectorAll('table,td,th,.invoice-total,.invoice-bank-card')].filter(el=>el.getBoundingClientRect().right>width+1||el.scrollWidth>el.clientWidth+1).map(el=>el.textContent),currencyLabels:[...d.querySelectorAll('.invoice-summary .invoice-cell-label')].some(el=>el.textContent==='Currency')});}return remove.call(this);};});
 await page.goto('http://127.0.0.1:43519/'+path.basename(file));await page.waitForFunction(()=>window.generate);
 for(const documentKind of ['GENERAL','ORDER'])for(const lang of ['ko','en','vi']){
  const encoded=await page.evaluate(async({invoice,lang})=>{const blob=await window.generate(invoice,lang);return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});},{invoice:{...invoice,snapshot:{...invoice.snapshot,documentKind}},lang});
  const pdf=Buffer.from(encoded,'base64');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  if(lang==='ko'&&documentKind==='GENERAL'){writeFileSync('logs/invoice-pdf-layout-preview.pdf',pdf);const start=pdf.indexOf(Buffer.from([255,216,255])),end=pdf.indexOf(Buffer.from([255,217]),start);assert.ok(start>0&&end>start);writeFileSync('logs/invoice-pdf-layout-preview.jpg',pdf.subarray(start,end+2));}
 }
 for(const layout of await page.evaluate(()=>window.layouts)){assert.equal(layout.lang,'en');assert.equal(layout.title,'INVOICE');assert.match(layout.number,/INV-2026-000003/);assert.equal(layout.width,688);assert.equal(layout.scroll,688);assert.deepEqual(layout.overflows,[]);assert.equal(layout.currencyLabels,false);}
 assert.equal(await page.locator('iframe').count(),0);console.log('Real html2canvas/jsPDF pipeline: A4 width, full table/totals/three banks and English output for ko/en/vi passed.');
}finally{await browser?.close();server.kill();if(existsSync(file))unlinkSync(file);}
