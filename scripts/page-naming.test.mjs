import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PAGE_ROUTES,formatPageTitle,resolvePageNaming,applyPageMenuNames} from '../frontend/src/utils/pageNaming.mjs';

const name = (path,lang='ko') => resolvePageNaming(path,lang,key=>({
  'menu.outsourcingRecord':'비용 신청','menu.order':'주문','menu.style':'스타일',
  'menu.invoice':'청구서','menu.appSettings':'앱 설정','menu.partners':'거래처',
  'menu.customer':'고객사','menu.personalSettings':'개인 설정',
}[key] || key));
test('list, creation and editing use the same business name and one action vocabulary',()=>{
  assert.equal(name('/outsourcing-record').title,'비용 신청 목록');
  assert.equal(name('/outsourcing-record/new').title,'비용 신청 등록');
  assert.equal(name('/outsourcing-record/edit/request/17').title,'비용 신청 수정');
  assert.equal(name('/order/new').title,'주문 등록');
  assert.equal(name('/order/123').title,'주문 수정');
  assert.equal(name('/style/123?ownerOrgId=1').title,'스타일 수정');
  assert.equal(name('/customer/new').title,'고객사 등록');
  assert.equal(name('/customer/1').title,'고객사 수정');
  for(const path of ['/business-partner','/customer','/outsourcing-partner','/material-supplier']) assert.equal(name(path).title,'거래처 목록');
});
test('single screens, settings and view-only details do not pretend to be editing lists',()=>{
  assert.equal(name('/app-settings').title,'앱 설정');
  assert.equal(name('/payroll/123').mode,'detail');
  assert.equal(name('/production-analysis/2026-10/1/3').mode,'detail');
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
  assert.equal(formatPageTitle('Đề nghị thanh toán','edit','vi'),'Sửa Đề nghị thanh toán');
  assert.equal(formatPageTitle('Đề nghị thanh toán','list','vi'),'Danh sách Đề nghị thanh toán');
  assert.equal(name('/order/123').title,name('/order/456').title);
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
