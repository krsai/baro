import test from 'node:test';
import assert from 'node:assert/strict';
import {formatEditableDecimal,normalizeEditableDecimal} from '../frontend/src/utils/editableDecimal.mjs';
import {normalizeEditableDecimal as serverNormalize} from '../backend/src/utils/editableDecimal.js';
import {createRequire} from 'node:module';
const {billData}=createRequire(import.meta.url)('../backend/dist/services/freightBillData.js');
test('bill save canonicalizes quantities while preserving document identifiers and party text',()=>{
 const data=billData({quantity:'0012345.2500',weightKg:'0100',cbm:'000.0050',voyage:'0012',shipper:'COMPANY 001',containers:[{size:'20',type:'DC',count:'001'}]});
 assert.equal(data.quantity,'12345.2500');assert.equal(data.weightKg,'100');assert.equal(data.cbm,'0.0050');assert.equal(data.voyage,'0012');assert.equal(data.shipper,'COMPANY 001');assert.equal(data.containers[0].count,'1');
});
test('numeric formatting removes leading zeros without losing precision or unfinished input',()=>{
 for(const [raw,canonical,display] of [['0100','100','100'],['000','0','0'],['0012345.2500','12345.2500','12,345.2500'],['000.0050','0.0050','0.0050'],['9999999999999999.0001','9999999999999999.0001','9,999,999,999,999,999.0001'],['0.','0.','0.'],['','',''],['-001234.00','-1234.00','-1,234.00']]){
  assert.equal(normalizeEditableDecimal(raw),canonical);assert.equal(serverNormalize(raw),canonical);assert.equal(formatEditableDecimal(raw),display);
 }
});
