import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {applyNavigationOrder,moveNavigationNode} from '../frontend/src/utils/navigationOrder.mjs';
import {changeApprovalFixture} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {readNavigationOrder,saveNavigationOrder,registerNavigationOrderRoutes,validateNavigationOrder}=require('../backend/dist/services/navigationOrder.js');
const tree=[{path:'/dashboard'},{menuGroupKey:'ACCOUNTING',isParent:true,children:[{path:'/invoices',permission:'original'},{path:'/payroll'}]},{menuGroupKey:'ADMIN',isParent:true,children:[{path:'/employee'}]}];
test('order ranks existing siblings without changing parentage, access or new menu fallback',()=>{
 const draft=moveNavigationNode(tree,{},'root','group:ADMIN',-1);
 assert.deepEqual(applyNavigationOrder(tree,draft).map(n=>n.path||n.menuGroupKey),['/dashboard','ADMIN','ACCOUNTING']);
 const next=moveNavigationNode(tree,{},'group:ACCOUNTING','path:/payroll',-1);
 const sorted=applyNavigationOrder([...tree,{path:'/new-page'}],{...next,root:['path:/injected','group:ACCOUNTING']});
 assert.equal(sorted[0].children[0].path,'/payroll');assert.equal(sorted[0].children[1].permission,'original');
 assert.equal(sorted.at(-1).path,'/new-page');assert.equal(sorted.some(n=>n.path==='/injected'),false);
 assert.equal(tree[1].children[0].path,'/invoices');
});
test('malformed and duplicate ranks are rejected',()=>{
 for(const input of [{revision:-1,order:{}},{revision:0,order:[]},{revision:0,order:{root:['path:/invoices','path:/invoices']}},{revision:0,order:{root:['javascript:alert(1)']}},{revision:0,order:{other:[]}}])assert.throws(()=>validateNavigationOrder(input),/INVALID_NAVIGATION_ORDER/);
});
test('real PostgreSQL: read-only defaults, durable global order, stale revision and untouched policies',async()=>{
 const fixture=await changeApprovalFixture(),{db}=fixture;
 try{
  assert.deepEqual(await readNavigationOrder(db),{revision:0,order:{}});
  assert.equal(await db.systemSetting.count({where:{key:'NAVIGATION_ORDER:1'}}),0);
  await db.systemSetting.create({data:{key:'ROLE_ACCESS_POLICY',value:{retained:true}}});
  const input={revision:0,order:{root:['group:ACCOUNTING','group:ADMIN'],'group:ACCOUNTING':['path:/payroll','path:/invoices']}};
  const saved=await saveNavigationOrder(db,input,'system@test');assert.equal(saved.revision,1);
  assert.deepEqual(await readNavigationOrder(db),saved);
  await assert.rejects(saveNavigationOrder(db,input,'other@test'),/NAVIGATION_ORDER_CHANGED/);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'ROLE_ACCESS_POLICY'}})).value,{retained:true});
 }finally{await fixture.close();}
});
test('routes require actual membership for read and SYSTEM admin for write',async()=>{
 const routes={},app={get:(p,fn)=>routes['GET '+p]=fn,put:(p,fn)=>routes['PUT '+p]=fn};let reads=0,writes=0;
 const db={systemSetting:{findUnique:async()=>{reads++;return null;}}};
 registerNavigationOrderRoutes(app,db,{requireOrgRole:async(_q,_s,options)=>{assert.equal(options.allowSystemAdmin,false);return null;},requireSystemAdmin:async()=>{writes++;return null;}});
 await routes['GET /navigation/menu-order']({},{});await routes['PUT /system/navigation-order']({body:{revision:0,order:{}}},{});
 assert.equal(reads,0);assert.equal(writes,1);
});
