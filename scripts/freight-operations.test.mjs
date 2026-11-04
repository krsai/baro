import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {freightDocumentHtml} from '../frontend/src/utils/freightPrint.js';
import {freightText} from '../frontend/src/constants/freight.js';
const require=createRequire(import.meta.url);
const {saveFreight,listFreight,freightDetail,saveFreightPackage,issueFreightDocument,registerFreightRoutes}=require('../backend/dist/services/freightOperations');

test('forwarding: master with multiple houses, Direct, split dispatches, immutable draft sources and company boundaries',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const save=(type,input,id)=>saveFreight(db,org,actor,type,input,id);
  const masterInput={clientKey:randomUUID(),number:'MAWB-001',mode:'AIR',data:{origin:'ICN',destination:'HAN'}};
  const master=await save('masters',masterInput);assert.equal((await save('masters',masterInput)).id,master.id);
  await assert.rejects(save('masters',{...masterInput,number:'Different'}),/FREIGHT_KEY_CONFLICT/);
  const jobInput=(extra={})=>({clientKey:randomUUID(),customerId:s.vendor.id,masterId:master.id,mode:'AIR',service:'EXPRESS',houseStatus:'HOUSE',houseNumber:'H-'+randomUUID(),data:{origin:'ICN',destination:'HAN',quantity:'2',weightKg:'3.25',cbm:'0.0125',shipper:'Sender <script>alert(1)</script>',consignee:'Consignee'},...extra});
  const a=await save('jobs',jobInput()),b=await save('jobs',jobInput()),c=await save('jobs',jobInput());
  assert.deepEqual((await freightDetail(db,org,actor,'masters',master.id)).jobs.map(j=>j.id).sort(),[a.id,b.id,c.id].sort());
  const direct=await save('jobs',jobInput({houseStatus:'NONE',houseNumber:'ignored'}));assert.equal(direct.houseNumber,null);
  const unknown=await save('jobs',jobInput({houseStatus:'UNKNOWN',masterId:null}));assert.equal(unknown.masterId,null);
  await assert.rejects(save('jobs',jobInput({mode:'SEA'})),/FREIGHT_MASTER_MODE/);
  await assert.rejects(save('jobs',jobInput({customerId:s.other.id})),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(saveFreight(db,s.other.id,actor,'jobs',jobInput()),/ACTIVE_EMPLOYEE_REQUIRED/);
  const otherSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other grades'}}),otherGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:otherSet.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:1}});
  const outsider=await db.employee.create({data:{orgId:s.other.id,name:'Outside',orgRole:'ADMIN',status:'ACTIVE',gradeId:otherGrade.id}});
  await assert.rejects(freightDetail(db,s.other.id,outsider.id,'jobs',a.id),/FREIGHT_NOT_FOUND/);
  const foreignMaster=await saveFreight(db,s.other.id,outsider.id,'masters',{...masterInput,clientKey:randomUUID()});
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJob" SET "masterId"=$1,version=version+1 WHERE id=$2',foreignMaster.id,a.id),/FREIGHT_MASTER_MODE|foreign key/);
  const dispatch=await save('dispatches',{clientKey:randomUUID(),masterId:master.id,data:{origin:'ICN',destination:'HAN',etd:'2026-11-05'}}),dispatch2=await save('dispatches',{clientKey:randomUUID(),data:{origin:'ICN',destination:'HAN',etd:'2026-11-06'}});
  const p1={id:randomUUID(),label:'A-1',quantity:1,weightKg:'2.1',cbm:'0.01',dispatchId:dispatch.id},p2={id:randomUUID(),label:'A-2',quantity:1,weightKg:'1.15',cbm:'0.0025',dispatchId:dispatch2.id};
  await saveFreightPackage(db,org,actor,a.id,p1);await saveFreightPackage(db,org,actor,a.id,p1);await saveFreightPackage(db,org,actor,a.id,p2);
  assert.equal((await freightDetail(db,org,actor,'jobs',a.id)).packages.length,2);assert.equal((await freightDetail(db,org,actor,'dispatches',dispatch.id)).packages.length,1);
  const source=await freightDetail(db,org,actor,'jobs',a.id),docInput={clientKey:randomUUID(),kind:'AN',version:source.version,revision:source.revision};
  const doc=await issueFreightDocument(db,org,actor,'jobs',a.id,docInput);assert.equal((await issueFreightDocument(db,org,actor,'jobs',a.id,docInput)).id,doc.id);
  const after=await save('jobs',{...a,clientKey:randomUUID(),data:{...a.data,origin:'PUS'}},a.id);assert.equal(after.version,2);assert.equal(after.createdByEmployeeId,a.createdByEmployeeId);
  assert.equal((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',doc.id))[0].snapshot.source.data.origin,'ICN');
  await assert.rejects(save('jobs',{...a,clientKey:randomUUID()},a.id),/FREIGHT_CHANGED/);
  await assert.rejects(issueFreightDocument(db,org,actor,'jobs',a.id,{...docInput,clientKey:randomUUID()}),/FREIGHT_CHANGED/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "FreightAudit" WHERE "sourceId"=$1',a.id),/FREIGHT_HISTORY_IMMUTABLE/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightDocument" SET snapshot=\'{}\'::jsonb WHERE id=$1',doc.id),/FREIGHT_HISTORY_IMMUTABLE/);
  const list=await listFreight(db,org,actor,'jobs',{search:a.houseNumber});assert.equal(list.total,1);assert.equal(list.rows[0].masterNumber,master.number);
  assert.equal((await listFreight(db,org,actor,'jobs',{search:'%'})).total,0);
  await assert.rejects(save('jobs',jobInput({status:'DELIVERED'})),/FREIGHT_DELIVERY_REQUIRED/);
  await assert.rejects(save('masters',{...master,clientKey:randomUUID(),mode:'SEA'},master.id),/FREIGHT_MASTER_MODE/);
  await db.employee.update({where:{id:actor},data:{status:'SUSPENDED'}});await assert.rejects(listFreight(db,org,actor,'jobs'),/ACTIVE_EMPLOYEE_REQUIRED/);
  for(const t of Object.values(freightText)){const html=freightDocumentHtml(doc,t);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes(t.draft));}
 }finally{await f.close();}
});
test('freight routes require explicit saved feature and actual membership; SYSTEM does not bypass access',async()=>{
 const routes=new Map(),app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,fn)=>routes.set(method+' '+path,fn)]));
 const employee={findFirst:async()=>({id:1,name:'Admin',orgRole:'ADMIN'})},db={employee};
 let enabled=false,ctx={organization:{id:1,type:'SERVICE'},employee:{orgRole:'ADMIN'}};
 registerFreightRoutes(app,db,{requireOrgRole:async(req,res,options)=>{assert.equal(options.allowSystemAdmin,false);return ctx;},actorId:()=>1,loadPolicy:async()=>({policy:{SERVICE:{ADMIN:enabled?['FREIGHT']:[]}}})});
 const route=routes.get('get /freight/options');await assert.rejects(route({},{}),/FREIGHT_ACCESS_DENIED/);
 enabled=true;db.$queryRawUnsafe=async()=>[];let result;await route({},{json:value=>{result=value;}});assert.deepEqual(result,[]);
 ctx=null;result=undefined;await route({},{json:value=>{result=value;}});assert.equal(result,undefined);
});
