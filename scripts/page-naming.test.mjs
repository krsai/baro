import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PAGE_ROUTES,formatPageTitle,resolvePageNaming,applyPageMenuNames} from '../frontend/src/utils/pageNaming.mjs';

const name = (path,lang='ko') => resolvePageNaming(path,lang,key=>({
  'menu.outsourcingRecord':'비용 신청','menu.order':'주문','menu.style':'스타일',
  'menu.invoice':'청구서','menu.appSettings':'앱 설정','menu.partners':'거래처',
  'menu.customer':'고객사','menu.personalSettings':'개인 설정',
}[key] || key));

test('shipping query detail follows the shared list/detail naming without renaming for modal forms',()=>{
 for(const language of ['ko','en','vi'])for(const route of ['/shipping','/transport-exchange']){
  const resolve=path=>resolvePageNaming(path,language,()=> 'Transport');
  assert.equal(resolve(route).mode,'list');
  assert.equal(resolve(route+'?form=new').mode,'list');
  assert.equal(resolve(route+'?id=job1&stage=setup').mode,'detail');
  assert.equal(resolve(route+'?id=job1&form=edit').title,resolve(route+'?id=job2').title);
  assert.equal(resolve(route).menuLabel,resolve(route+'?id=job1').menuLabel);
 }
});

test('shipping record paths give each detail its own workspace identity and keep document tabs in that detail',()=>{
 for(const lang of ['ko','en','vi']){
  const resolve=path=>resolvePageNaming(path,lang,()=> 'Transport');
  assert.equal(resolve('/shipping').mode,'list');
  assert.equal(resolve('/shipping/job1').mode,'detail');
  assert.equal(resolve('/shipping/job1').key,'transportList');
  assert.notEqual(resolve('/shipping/job1').path,resolve('/shipping').path);
  assert.notEqual(resolve('/shipping/job1').path,resolve('/shipping/job2').path);
  assert.equal(resolve('/shipping/job1?stage=documents').path,resolve('/shipping/job1').path);
 }
});

test('retired industry menu link inherits the unified access policy identity',()=>{
 const page=resolvePageNaming('/system-setting/industry-menus','ko',key=>key==='menu.accessPolicy'?'접근 권한':key);
 assert.equal(page.key,'accessPolicy');assert.equal(page.title,'접근 권한');assert.equal(page.mode,'page');
});
test('list, creation and editing use the same business name and one action vocabulary',()=>{
  assert.equal(name('/outsourcing-record').title,'비용 신청 목록');
  assert.equal(name('/outsourcing-record/new').title,'비용 신청 등록');
  assert.equal(name('/outsourcing-record/edit/request/17').title,'비용 신청 상세');
  assert.equal(name('/order/new').title,'주문 등록');
  assert.equal(name('/order/123').title,'주문 상세');
  assert.equal(name('/style/123?ownerOrgId=1').title,'스타일 상세');
  assert.equal(name('/customer/new').title,'고객사 등록');
  assert.equal(name('/customer/1').title,'고객사 상세');
  for(const path of ['/business-partner','/customer','/outsourcing-partner','/material-supplier']) assert.equal(name(path).title,'거래처 목록');
});
test('single screens, settings and view-only details do not pretend to be editing lists',()=>{
  assert.equal(name('/app-settings').title,'앱 설정');
  assert.equal(name('/payroll/123').mode,'detail');
  assert.equal(name('/system-setting/app-defaults').key,'appDefaults');
  assert.equal(name('/system-setting').key,'subscription');
  assert.equal(name('/inventory/movements/new').key,'inventoryEntry');
  assert.equal(name('/profile').title,name('/personal-settings').title);
  assert.equal(name('/invoices/new?revision=123').title,'청구서 개정');
  assert.equal(name('/invoices/new').title,'청구서 등록');
  assert.equal(name('/not-a-screen'),null);
});
test('localized grammar is shared by all labels without stale record IDs',()=>{
  assert.equal(formatPageTitle('Payment Request','list','en'),'Payment Request List');
  assert.equal(formatPageTitle('Payment Request','create','en'),'Create Payment Request');
  assert.equal(formatPageTitle('Đề nghị thanh toán','edit','vi'),'Chi tiết Đề nghị thanh toán');
  assert.equal(formatPageTitle('Đề nghị thanh toán','list','vi'),'Danh sách Đề nghị thanh toán');
  assert.equal(name('/order/123').title,name('/order/456').title);
});

test('every existing editable record resolves to detail in all languages, including legacy edit URLs',()=>{
 assert.equal(name('/shipping?id=17').key,'shippingRequest');
 assert.equal(name('/shipping?id=17&stage=bills').key,'transportList');
 for(const lang of ['ko','en','vi'])for(const path of [
  '/order/17','/style/17','/customer/17','/attendance/17','/work-history/17',
  '/outsourcing-record/edit/request/17','/bank-ledger/edit/17','/shipping?id=17',
  '/freight?type=masters&id=17',
 ]){
  const page=name(path,lang);
  assert.equal(page.mode,'detail',path);
  assert.equal(page.title,formatPageTitle(page.menuLabel,'detail',lang));
 }
 for(const path of ['/inventory/materials','/inventory/movements'])assert.equal(name(path).mode,'list');
});
test('menu names use the same source while preserving structure and access identities',()=>{
  const accessChildren=[{path:'/customer',label:'Customer access',featureKey:'CUSTOMER'}];
  const menu=[{label:'Accounting',isParent:true,children:[{path:'/outsourcing-record',label:'Old expenses',featureKey:'OUTSOURCING_RECORD'}]},{path:'/business-partner',label:'Old partners',accessChildren}];
  const normalized=applyPageMenuNames(menu,'ko',key=>key==='menu.outsourcingRecord'?'비용 신청':'거래처');
  assert.equal(normalized[0].children[0].label,'비용 신청');
  assert.equal(normalized[0].children[0].featureKey,'OUTSOURCING_RECORD');
  assert.equal(normalized[1].accessChildren,accessChildren);
  assert.equal(menu[0].children[0].label,'Old expenses');
});
test('every application route has a naming policy and the policy covers actual menu keys',()=>{
  const router=fs.readFileSync('frontend/src/router.jsx','utf8');
  const paths=[...router.matchAll(/path:\s*'([^']+)'/g)].map(match=>match[1]);
  const excluded=new Set(['/','/login','/auth/callback','/signup','/subscription-required','/onboarding','workspace','inventory']);
  for(const path of paths) {
    if(excluded.has(path))continue;
    const sample=('/'+path.replace(/^\//,'')).replace(/:[^/]+/g,'123').replace(/\/\*$/,'');
    assert.ok(name(sample),`Missing screen naming policy: ${path}`);
  }
  assert.equal(new Set(PAGE_ROUTES.map(row=>row[0])).size,PAGE_ROUTES.length);
  const messages=fs.readFileSync('frontend/src/constants/uiMessages.js','utf8');
  for(const [,key]of PAGE_ROUTES) assert.match(messages,new RegExp(`\\b${key}:`),`Missing menu translation: ${key}`);
});

test('ports and legacy airports share the unified screen identity',()=>{
 for(const path of ['/system-setting/shipping-ports','/system-setting/shipping-airports']){
 const page=resolvePageNaming(path,'ko',key=>key==='menu.shippingPorts'?'항만·공항 관리':key);
 assert.equal(page.title,'항만·공항 관리');assert.equal(page.mode,'page');
 }
});
