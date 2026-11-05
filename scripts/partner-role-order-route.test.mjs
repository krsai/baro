import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {once} from 'node:events';
const require=createRequire(import.meta.url),express=require('../backend/node_modules/express');
const {registerTransactionSettingRoutes}=require('../backend/dist/services/transactionSettingRoutes');

test('literal order URL reaches ordering rather than the category ID handler, persists and protects concurrent changes',async()=>{
 const roles=[{id:1,code:'APPAREL',nameEn:'Apparel',sortOrder:0},{id:2,code:'LOGISTICS',nameEn:'Logistics',sortOrder:1}];let authorized=true,locks=0,idReads=0;
 const tx={$queryRawUnsafe:async()=>{locks++;return [];},partnerRole:{findMany:async()=>roles.toSorted((a,b)=>a.sortOrder-b.sortOrder),findUnique:async()=>{idReads++;return roles[0];},update:async({where,data})=>{assert.deepEqual(Object.keys(data),['sortOrder']);return Object.assign(roles.find(r=>r.id===where.id),data);}}};
 const db={...tx,$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx);}};
 const app=express();app.use(express.json());
 registerTransactionSettingRoutes(app,db,{requireSystemAdmin:async(_req,res)=>{if(authorized)return true;res.status(403).json({error:'FORBIDDEN'});return null;}});
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/system-setting-defaults/partner-roles`,save=body=>fetch(url+'/order',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const before=await(await fetch(url)).json();assert.deepEqual(before.map(r=>r.id),[1,2]);
  const saved=await save({previousIds:[1,2],ids:[2,1]});assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{ok:true});assert.equal(idReads,0);
  assert.deepEqual((await(await fetch(url)).json()).map(r=>r.id),[2,1]);
  assert.equal((await save({previousIds:[1,2],ids:[1,2]})).status,409);
  assert.equal((await save({previousIds:[2,1],ids:[2,99]})).status,400);
  authorized=false;const beforeLocks=locks;assert.equal((await save({previousIds:[2,1],ids:[1,2]})).status,403);assert.equal(locks,beforeLocks);
  assert.deepEqual(roles.map(({sortOrder,...row})=>row),[{id:1,code:'APPAREL',nameEn:'Apparel'},{id:2,code:'LOGISTICS',nameEn:'Logistics'}]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
