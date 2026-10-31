import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organizeSystemMenu,findMenuGroupForPath} from '../frontend/src/utils/systemMenuLayout.mjs';
const paths=['/system-setting/expense-units','/system-setting','/employee','/system-onboarding','/attribute/colors','/attribute/categories','/attribute/processes/targets','/attribute/processes/actions','/attribute/processes/specs','/system-setting/static-options','/system-setting/access-policy','/system-setting/app-defaults','/system-setting/expense-types','/system-setting/partner-industries','/system-setting/transaction-codes','/employee-system','/salary-system'];
const dashboard={path:'/dashboard',label:'Dashboard'};
const leaves=paths.map(path=>({path,label:path,notificationActive:path==='/system-onboarding',disabled:path==='/attribute/colors'}));
const source=[dashboard,...['ADMIN','ATTRIBUTE','PROCESS_MASTER','MISC','SYSTEM'].map((key,index)=>({menuGroupKey:key,isParent:true,isOpen:index===0,children:index===0?leaves:[]}))];

test('SYSTEM menu uses original groups so expense expansion never borrows system settings state',()=>{
 const layout=readFileSync('frontend/src/layouts/MainLayout.jsx','utf8');
 assert.match(layout,/organizeSystemMenu\(baseMenuBlueprint,/);
 for(const selected of [null,'MISC','SYSTEM','ATTRIBUTE']){
  const blueprint=source.map(group=>group.isParent?{...group,isOpen:group.menuGroupKey===selected}:group);
  const organized=organizeSystemMenu(blueprint);
  assert.deepEqual(organized.filter(group=>group.isOpen).map(group=>group.menuGroupKey),selected?[selected]:[]);
 }
});
test('SYSTEM groups preserve every canonical node, route, badge and disabled state exactly once',()=>{
 const original=JSON.stringify(source),groups=organizeSystemMenu(source);
 assert.deepEqual(groups.slice(1).map(g=>g.menuGroupKey),['ADMIN','ATTRIBUTE','PROCESS_MASTER','MISC','SYSTEM']);
 const result=groups.flatMap(g=>g.children||[g]);
 assert.equal(result.length,paths.length+1);assert.equal(new Set(result.map(n=>n.path)).size,result.length);
 for(const leaf of leaves)assert.equal(result.find(n=>n.path===leaf.path),leaf);
 assert.equal(JSON.stringify(source),original);
 assert.deepEqual(groups.find(g=>g.menuGroupKey==='MISC').children.map(n=>n.path),['/system-setting/transaction-codes','/system-setting/expense-types','/system-setting/partner-industries']);
});
test('direct entry chooses the most specific group without confusing subscription and settings',()=>{
 const menu=organizeSystemMenu(source);
 for(const [path,key] of [['/system-setting/expense-units','ATTRIBUTE'],['/system-setting','ADMIN'],['/system-onboarding','ADMIN'],['/system-setting/transaction-codes','MISC'],['/attribute/processes/actions/4','PROCESS_MASTER'],['/system-setting/access-policy','SYSTEM'],['/employee-system','SYSTEM'],['/employee/4','ADMIN']])assert.equal(findMenuGroupForPath(menu,path),key);
});
test('translations, newly added routes and permission-filtered groups remain intact',()=>{
 const extra={path:'/new-system-feature',label:'New'};
 const extended=[...source,{isParent:true,menuGroupKey:'NEW',children:[extra]}];
 for(const lang of ['ko','en','vi']){
  const menu=organizeSystemMenu(extended,lang);
  assert.equal(menu.find(g=>g.menuGroupKey==='SYSTEM').children.at(-1),extra);
  assert.ok(menu.slice(1).every(g=>g.label));
 }
 const allowed=new Set(['/dashboard','/system-setting/access-policy']);
 const limited=organizeSystemMenu(source).map(n=>n.isParent?{...n,children:n.children.filter(c=>allowed.has(c.path))}:n).filter(n=>n.isParent?n.children.length:allowed.has(n.path));
 assert.deepEqual(limited.flatMap(n=>n.children||[n]).map(n=>n.path),[...allowed]);
});
