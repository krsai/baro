import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {canAccessFeature} from '../frontend/src/utils/accessControl.js';
import {ROLE_ACCESS_POLICY_SCHEMA_VERSION} from '../frontend/src/utils/roleAccessPolicyCore.mjs';

const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const source=readFileSync('frontend/src/pages/App/TransactionRequestEntry.jsx','utf8');
const tree=ts.createSourceFile('entry.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
let permission,loader;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='canReadOrders')permission=node.initializer.getText(tree);
 if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'&&node.arguments[0]?.getText(tree).includes("'expense-payees','transaction-codes'"))loader=node.arguments[0].getText(tree);
 ts.forEachChild(node,visit);
}
visit(tree);
assert.ok(permission&&loader);

async function load({allowOrders=false,industryAllows=true,editing=false,failPath=null}={}){
 const authState={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ACCOUNTANT',industryMenuFeatures:industryAllows?['ORDER','OUTSOURCING_RECORD']:['OUTSOURCING_RECORD'],accessPolicy:{__schemaVersion:ROLE_ACCESS_POLICY_SCHEMA_VERSION,MANUFACTURER:{ACCOUNTANT:allowOrders?['ORDER','OUTSOURCING_RECORD']:['OUTSOURCING_RECORD']}}}};
 const canReadOrders=vm.runInNewContext(permission,{isServiceCompany:false,canAccessFeature,authState});
 const calls=[],errors=[],loading=[],data=[],forms=[];
 const linked={version:2,items:[{workOrderId:42,preservedReferences:{order:{dbId:42}}}]};
 const deps={canReadOrders,activeOrgId:1,editing,shippingChargeId:null,editorPath:'/expense-request-editor/request/7',documentScope:'scope',
  setLoading:v=>loading.push(v),setLoadError:v=>errors.push(v),setData:v=>data.push(v),setForm:v=>forms.push(v),setInitialSnapshot(){},setLoadedDocumentScope(){},documentSnapshot:JSON.stringify,newExpenseLine:()=>({}),crypto:{randomUUID:()=> 'key'},buildQueryString:()=> '?orgId=1',
  requestJSON:async path=>{calls.push(path);if(path.startsWith(failPath||'NEVER'))throw Object.assign(Error('failed'),{status:403});if(path.startsWith('/orders'))return [{dbId:42,ownerOrgId:1},{dbId:99,ownerOrgId:2}];if(path.startsWith('/expense-request-editor'))return linked;return [];}};
 vm.runInNewContext('('+loader+')',deps)();
 await new Promise(resolve=>setImmediate(resolve));
 return {calls,errors,loading,data,forms};
}

test('accountant without ORDER can load payment request without forbidden order request',async()=>{
 const result=await load();
 assert.equal(result.calls.some(path=>path.startsWith('/orders')),false);
 assert.equal(result.calls.length,4);
 assert.equal(result.errors.at(-1),false);
 assert.equal(result.loading.at(-1),false);
 assert.equal(result.data.length,1);
});
test('saved role and industry policy both control optional order candidates',async()=>{
 const allowed=await load({allowOrders:true});
 assert.equal(allowed.calls.some(path=>path.startsWith('/orders')),true);
 assert.deepEqual(Array.from(allowed.data[0].orders,row=>row.dbId),[42]);
 const unavailable=await load({allowOrders:true,industryAllows:false});
 assert.equal(unavailable.calls.some(path=>path.startsWith('/orders')),false);
});
test('editing without ORDER preserves existing order FK and reference snapshot',async()=>{
 const result=await load({editing:true});
 assert.equal(result.errors.at(-1),false);
 assert.equal(result.forms[0].items[0].workOrderId,42);
 assert.equal(result.forms[0].items[0].preservedReferences.order.dbId,42);
});
test('required reference and authorized order failures still block and expose retry state',async()=>{
 for(const failPath of ['/expense-payees','/orders']){
  const result=await load({allowOrders:true,failPath});
  assert.equal(result.errors.at(-1),true);
  assert.equal(result.loading.at(-1),false);
  assert.equal(result.data.length,0);
 }
});
