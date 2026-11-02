import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {registerPartnerRoleManagement}=require('../backend/dist/services/partnerRoleManagement.js');
function fixture(){
 const routes=new Map(),rows=[{id:1,code:'CUSTOMER',nameEn:'Customer',nameKo:'',nameVi:'',sortOrder:0}],links=new Set();let authorized=true;
 const tx={$queryRawUnsafe:async()=>[],settingServiceDefault:{count:async({where})=>links.has(where.partnerRoleId)?1:0},partnerRole:{
  findUnique:async({where})=>rows.find(row=>row.id===where.id),aggregate:async()=>({_max:{sortOrder:Math.max(...rows.map(r=>r.sortOrder))}}),
  create:async({data})=>{assert.deepEqual(Object.keys(data).sort(),['code','nameEn','nameKo','nameVi','sortOrder']);if(rows.some(r=>r.code===data.code))throw {code:'P2002'};const row={id:rows.length+1,...data};rows.push(row);return row;},
  update:async({where,data})=>Object.assign(rows.find(r=>r.id===where.id),data),delete:async({where})=>rows.splice(rows.findIndex(r=>r.id===where.id),1)
 }};
 registerPartnerRoleManagement(Object.fromEntries(['post','put','delete'].map(method=>[method,(path,fn)=>routes.set(method+path,fn)])),{$transaction:async fn=>fn(tx)},{requireSystemAdmin:async()=>authorized});
 const call=async(method,id,body)=>{let result,status;await routes.get(method+'/system-setting-defaults/partner-roles'+(method==='post'?'':'/:id'))({params:id===undefined?{}:{id:String(id)},body},{status(value){status=value;return this;},json(value){result=value;}});return {status,result};};
 return {call,rows,links,deny:()=>authorized=false};
}
test('SYSTEM creates, renames and deletes categories while preserving IDs, codes, order and industry references',async()=>{
 const {call,rows,links}=fixture();const body={nameEn:'Custom',nameKo:'',nameVi:''};
 assert.equal((await call('post',undefined,body)).status,201);assert.equal(rows[1].sortOrder,1);
 await call('put',2,{...body,nameEn:'Renamed',sortOrder:999});assert.equal(rows[1].nameEn,'Renamed');assert.equal(rows[1].sortOrder,1);
 links.add(2);await assert.rejects(call('delete',2),/SETTING_IN_USE/);assert.equal(rows.length,2);
 const internalKey=rows[1].code;assert.match(internalKey,/^ROLE_[0-9a-f-]+$/);
 await call('put',2,{...body,code:'CHANGED'});assert.equal(rows[1].code,internalKey);
 await call('put',1,{nameEn:'Renamed customer'});assert.equal(rows[0].code,'CUSTOMER');
 links.delete(2);await call('delete',2);assert.equal(rows.length,1);assert.equal(rows[0].id,1);
});
test('category names require no code; client codes cannot select legacy behavior and unauthorized writes are denied',async()=>{
 const {call,rows,deny}=fixture();
 const body={code:'CUSTOMER',nameEn:'Customer'};
 for(const code of [undefined,'',123,'bad code','MANAGEMENT','CUSTOMER']){
  const {result}=await call('post',undefined,{...body,code});assert.match(result.code,/^ROLE_/);assert.notEqual(result.code,code);
 }
 assert.equal(new Set(rows.map(row=>row.code)).size,rows.length);
 for(const nameEn of ['',123,'x'.repeat(101)])await assert.rejects(call('post',undefined,{nameEn}),/INVALID_PARTNER_ROLE/);
 await assert.rejects(call('put',999,body),/NOT_FOUND/);
 await assert.rejects(call('delete','invalid'),/INVALID_SETTING_REFERENCE/);
 const count=rows.length;deny();await call('post',undefined,{nameEn:'Custom'});await call('put',1,body);await call('delete',1);assert.equal(rows.length,count);
});
