import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {titleCaseWords,textFieldCase,normalizeHumanPayload,titleCasePartyBlock} from '../frontend/src/utils/humanTextCase.mjs';
const require=createRequire(import.meta.url);
const backend=require('../backend/dist/utils/humanTextCase');
const {humanTextCaseInput}=require('../backend/dist/middleware/humanTextCase');

test('words preserve separators, scripts, acronyms, technical references and contractions',()=>{
 for(const [input,expected]of [
  ['nguyen VAN an','Nguyen Van An'],['12 MAIN STREET, HANOI','12 Main Street, Hanoi'],
  ["o'connor and john's shipment","O'Connor And John's Shipment"],
  ['master b/l / house b/l USD AR/AP','Master B/L / House B/L USD AR/AP'],
  ['đẶNG thị hỒng / 한국 이름','Đặng Thị Hồng / 한국 이름'],
  ['contact Test.Name@EXAMPLE.com https://EXAMPLE.com/ExactPath {companyName}','Contact Test.Name@EXAMPLE.com https://EXAMPLE.com/ExactPath {companyName}'],
  ['use HTTPS://EXAMPLE.com/ExactCase','Use HTTPS://EXAMPLE.com/ExactCase'],
  ['  ship\n  at 10AM via SaaS  ','  Ship\n  At 10AM Via SaaS  '],
 ]){
  assert.equal(titleCaseWords(input),expected);assert.equal(backend.titleCaseWords(input),expected);
  assert.equal(titleCaseWords(expected),expected);
 }
 assert.equal(readFileSync('frontend/src/utils/humanTextCase.mjs','utf8'),readFileSync('backend/src/utils/humanTextCase.js','utf8'));
});
test('field policy protects company, codes, search, IME lookup, email and read-only controls',()=>{
 for(const meta of [{label:'Company name'},{label:'업체명'},{label:'Mã khách hàng'},{name:'accountHolder'},{label:'Code'},{type:'email'},{type:'password'},{label:'Name',readOnly:true},{label:'Name',select:true},{label:'Name',inputProps:{role:'combobox'}},{label:'Name','data-text-case':'preserve'}])assert.equal(textFieldCase(meta),'preserve',JSON.stringify(meta));
 for(const meta of [{name:'contactName'},{label:'담당자'},{label:'Địa chỉ'},{label:'Employee name'},{label:'Description'}])assert.equal(textFieldCase(meta),'title');
 assert.equal(textFieldCase({label:'SHPR'}),'party');
 for(const label of ['Currency','Country','Size','SWIFT','Master B/L','HBL No.'])assert.equal(textFieldCase({label}),'preserve',label);
 assert.equal(titleCasePartyBlock('dex logis\n12 MAIN STREET'),'DEX LOGIS\n12 Main Street');
});
test('payload normalizes human values only; company names and codes retain their separate contracts',()=>{
 const raw={name:'nguyen van an',code:'EXACT_CODE',status:'IN_PROGRESS',currencyCode:'USD',email:'Test@EXAMPLE.com',phone:'+84 123',requestId:'CaseSensitiveToken',description:'OCEAN FREIGHT',address:'12 MAIN STREET',companyName:'dex logis',seller:{name:'baro co., ltd.',address:'12 MAIN STREET'},snapshot:{name:'FROZEN NAME',address:'FROZEN ADDRESS'},metadata:{name:'OPAQUE'},lines:[{description:'LOCAL HANDLING',chargeCode:'ABC'}]};
 const before=structuredClone(raw),result=normalizeHumanPayload(raw,{path:'/employees'});
 assert.equal(result.name,'Nguyen Van An');assert.equal(result.description,'Ocean Freight');assert.equal(result.companyName,'DEX LOGIS');assert.equal(result.seller.name,'BARO CO., LTD.');assert.equal(result.seller.address,'12 Main Street');
 for(const key of ['code','status','currencyCode','email','phone','requestId','snapshot','metadata'])assert.deepEqual(result[key],raw[key]);
 assert.deepEqual(result.lines,[{description:'Local Handling',chargeCode:'ABC'}]);assert.deepEqual(raw,before);
 assert.deepEqual(normalizeHumanPayload(result,{path:'/employees'}),result);
 for(const path of ['/business-partners/1','/organizations/1','/system/entities','/auth/workspaces'])assert.equal(normalizeHumanPayload({name:'dex logis'},{path}).name,'DEX LOGIS');
});
test('HTTP normalization runs only for new JSON write input, keeping GET and binary bodies intact',()=>{
 for(const [method,isJson,expected]of [['POST',true,'John Smith'],['PUT',true,'John Smith'],['PATCH',true,'John Smith'],['GET',true,'JOHN SMITH'],['POST',false,'JOHN SMITH']]){
  const req={method,path:'/employees',body:{name:'JOHN SMITH'},is:()=>isJson};let called=0;
  humanTextCaseInput(req,{},()=>called++);assert.equal(req.body.name,expected);assert.equal(called,1);
 }
});
