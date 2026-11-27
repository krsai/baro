import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {invoiceBillToName,invoiceListDescription,compactInvoiceList} from '../frontend/src/utils/invoiceListPresentation.mjs';
const {invoiceListItemSummary}=createRequire(import.meta.url)('../backend/dist/services/invoiceListSummary');

test('bill-to follows the active language and shared fallback, while old payloads keep their frozen name',()=>{
 const row={buyerName:'Frozen',buyerDisplayNames:{name:'English',nameKo:'한국어',nameVi:'Tiếng Việt'}};
 assert.equal(invoiceBillToName(row,'ko'),'한국어');assert.equal(invoiceBillToName(row,'en'),'English');assert.equal(invoiceBillToName(row,'vi'),'Tiếng Việt');
 assert.equal(invoiceBillToName({...row,buyerDisplayNames:{name:'English',nameKo:''}},'ko'),'English');
 assert.equal(invoiceBillToName({buyerName:'Frozen'},'vi'),'Frozen');
});

test('issued style counts use snapshot identities and add all invoiced size/color quantities once',()=>{
 const snapshot={lines:[{styleId:1,styleName:'Frozen Shirt',quantity:100},{styleId:1,styleName:'Frozen Shirt',quantity:200},{styleId:2,styleName:'Frozen Shirt',quantity:50}]};
 const before=JSON.stringify(snapshot),itemSummary=invoiceListItemSummary(snapshot);
 assert.equal(itemSummary.firstDescription,'Frozen Shirt');assert.equal(itemSummary.additionalCount,1,'equal names do not merge distinct style IDs');
 assert.deepEqual(itemSummary.quantities,[{unit:'GARMENT',quantity:'350.0000'}]);assert.equal(JSON.stringify(snapshot),before);
 const row={invoiceNumber:'INV-HIDDEN',orders:[{sourceOrderNumber:'26AW2'}],itemSummary};
 assert.equal(invoiceListDescription(row,'ko'),'26AW2 / Frozen Shirt 외 1개, 350장');
 assert.match(invoiceListDescription(row,'en'),/26AW2.*Frozen Shirt.*1 More.*350 Pcs/);
 assert.match(invoiceListDescription(row,'vi'),/26AW2.*350 Chiếc/);
 assert.doesNotMatch(invoiceListDescription(row,'ko'),/INV-HIDDEN/);
 assert.equal(compactInvoiceList(['CMTE','CMTE','PBGE','MPPE'],'ko'),'CMTE 외 2개');
});

test('general invoice quantities retain their individual units and exact decimals; missing legacy values stay unknown',()=>{
 const summary=invoiceListItemSummary({lines:[{description:'Packaging',unit:'Pcs',quantity:'0.1'},{description:'Packaging',unit:'Pcs',quantity:'0.2'},{description:'Fabric',unit:'M',quantity:'12.5'}]},'GENERAL');
 assert.equal(summary.additionalCount,1);
 assert.deepEqual(summary.quantities,[{unit:'Pcs',quantity:'0.3000'},{unit:'M',quantity:'12.5000'}]);
 assert.equal(invoiceListDescription({itemSummary:summary},'en'),'Packaging + 1 More, 0.3 Pcs / 12.5 M');
 assert.match(invoiceListDescription({itemSummary:summary},'vi'),/0,3 Pcs \/ 12,5 M/);
 assert.deepEqual(invoiceListItemSummary({lines:[{styleCode:'LEGACY',quantity:null}]}).quantities,[]);
 assert.deepEqual(invoiceListItemSummary({}).quantities,[]);
 assert.equal(invoiceListDescription({descriptions:['Old Description'],orders:[{sourceOrderNumber:'OLD'}]},'ko'),'OLD / Old Description');
});
