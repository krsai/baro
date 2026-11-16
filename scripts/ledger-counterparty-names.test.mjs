import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {attachLedgerCounterpartyNames}=require('../backend/dist/services/ledgerCounterparty');

test('list resolves current names by authorized FK and preserves saved snapshots',async()=>{
 const rows=[{id:'paid',counterpartyOrgId:7,counterpartyName:'BUILDING OWNER'},
  {id:'foreign',counterpartyOrgId:8,counterpartyName:'Historical'},
  {id:'employee',counterpartyEmployeeId:7,counterpartyName:'Employee'}];
 const original=structuredClone(rows);
 const db={organization:{findMany:async({where,select})=>{
  assert.deepEqual(where.id,{in:[7,8]});
  assert.deepEqual(where.OR,[{ownerOrgId:1},{manufacturerRelationships:{some:{brandOrgId:1}}},{brandRelationships:{some:{manufacturerOrgId:1}}}]);
  assert.deepEqual(select,{id:true,name:true});return [{id:7,name:'NGUYEN TRAN DAT'}];
 }},companyPartnerLink:{findMany:async({where})=>{assert.equal(where.orgId,1);assert.deepEqual(where.entityId,{in:[7]});return [];}},
 companyIdentityLink:{findMany:async()=>[]},$queryRawUnsafe:async()=>[]};
 const result=await attachLedgerCounterpartyNames(db,1,rows);
 assert.equal(result[0].currentCounterpartyName,'NGUYEN TRAN DAT');
 assert.equal(result[0].counterpartyName,'BUILDING OWNER');
 assert.equal(result[1].currentCounterpartyName,'Historical');
 assert.equal(result[2].currentCounterpartyName,'Employee');
 assert.deepEqual(rows,original);
});

test('no partner FK needs no identity queries',async()=>{
 const rows=[{counterpartyName:'Saved'}];
 assert.deepEqual(await attachLedgerCounterpartyNames({},1,rows),rows);
});
