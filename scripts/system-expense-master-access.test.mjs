import test from 'node:test';
import assert from 'node:assert/strict';
import routes from '../backend/dist/services/transactionSettingRoutes.js';

test('SYSTEM reference reads work without company membership and reject non-system administrators',async()=>{
 const handlers=new Map(), app={};
 for(const method of ['get','post','put','delete'])app[method]=(path,fn)=>handlers.set(`${method}:${path}`,fn);
 const calls=[];
 const rows={expenseType:[{id:1,code:'OTHER'}],partnerRole:[{id:1,code:'CUSTOMER'}],settingServiceDefault:[],transactionCodeBase:[]};
 const db=Object.fromEntries(Object.entries(rows).map(([model,data])=>[model,{findMany:async()=>{calls.push(model);return data;}}]));
 routes.registerTransactionSettingRoutes(app,db,{
  requireSystemAdmin:async(req,res)=>req.systemAdmin?{requesterEmail:'system@example.com'}:(res.status(403).json({error:'system admin access required'}),null),
  requireOrgRole:async(req,res)=>req.member?{organization:{id:1}}:(res.status(404).json({error:'organization not found'}),null),
 });
 const request=async(path,identity)=>{
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await handlers.get(`get:${path}`)({query:{},...identity},res);return res;
 };
 for(const [path,model] of [['/system-setting-defaults/expense-types','expenseType'],['/system-setting-defaults/partner-roles','partnerRole'],['/system-setting-defaults/services','settingServiceDefault'],['/system-setting-defaults/code-bases','transactionCodeBase']]){
  const allowed=await request(path,{systemAdmin:true});
  assert.equal(allowed.statusCode,200);assert.deepEqual(allowed.body,rows[model]);
  const before=calls.length;
  for(const identity of [{},{member:true}])assert.equal((await request(path,identity)).statusCode,403);
  assert.equal(calls.length,before,'denied reads never query reference data');
 }
 for(const path of ['/expense-types','/partner-roles']){
  assert.equal((await request(path,{systemAdmin:true})).statusCode,404,'company endpoints retain company scope');
  assert.equal((await request(path,{member:true})).statusCode,200);
 }
});
