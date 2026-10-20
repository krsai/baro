import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {entityProfile,partnerProfilePatch}=require('../backend/dist/services/entityProfile.js');
const {registerEntityBankRoutes,requirePayeeBankAccount}=require('../backend/dist/services/entityBankAccount.js');

test('common profiles preserve actual entity FK and omitted partner fields cannot clear existing information',()=>{
  assert.equal(entityProfile({id:44,name:'Customer'}).entityId,44);
  assert.deepEqual(partnerProfilePatch({name:'Updated'}),{});
  assert.deepEqual(partnerProfilePatch({nameKo:'  Name  ',email:null,country:'VN'}),{nameKo:'Name',email:null,country:'VN'});
  for(const input of [{country:'Vietnam'},{email:123},{address:'x'.repeat(2001)}])assert.throws(()=>partnerProfilePatch(input),error=>error.status===400);
});

test('bank account API uses authorized tenant and actual entity scope; unauthorized access cannot read accounts',async()=>{
  const routes=new Map();let allowed=false,seen;
  const app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,fn)=>routes.set(`${method} ${path}`,fn)]));
  const db={organization:{findFirst:async query=>{seen=query.where;return query.where.id===44?{id:44}:null;}},organizationBankAccount:{findMany:async({where})=>{assert.deepEqual(where,{orgId:1,entityId:44});return [{id:'bank'}];}},currency:{findMany:async()=>[]}};
  registerEntityBankRoutes(app,db,{requireOrgRole:async()=>allowed?{organization:{id:1}}:null,getActor:()=>21});
  const get=routes.get('get /entities/:entityId/bank-accounts');
  const res={json(value){this.body=value;}};
  await get({params:{entityId:'44'},query:{orgId:999}},res);assert.equal(res.body,undefined);assert.equal(seen,undefined);
  allowed=true;await get({params:{entityId:'44'},query:{orgId:999}},res);
  assert.equal(seen.id,44);assert.deepEqual(res.body.accounts,[{id:'bank'}]);
  await assert.rejects(get({params:{entityId:'45'}},res),error=>error.status===404);
});

test('a bank in another tenant or an inactive account cannot satisfy the payee save requirement',async()=>{
  const tx={$queryRawUnsafe:async()=>[],organizationBankAccount:{findFirst:async({where})=>{
    assert.deepEqual(where,{orgId:1,entityId:44,isActive:true});return null;
  }}};
  await assert.rejects(requirePayeeBankAccount(tx,1,44),error=>error.status===400&&error.message==='PAYEE_BANK_ACCOUNT_REQUIRED');
});
