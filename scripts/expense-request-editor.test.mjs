import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadExpenseEditorSource, expenseEditorForm, saveExpenseEditor, registerExpenseEditorRoutes } = require('../backend/dist/services/expenseRequestEditor.js');

function harness() {
  let state = { documents: [], costs: [], audits: [], extraLogs: [], records: [
    { id: 78, orgId: 1, workLogId: 77, outsourcingPartnerId: 11, quantity: 170, outsourceUnitPrice: '3000', styleId: 40, styleProcessId: 50, assignmentPlanId: 60, createdByEmployeeId: 21 },
    { id: 79, orgId: 1, workLogId: 77, outsourcingPartnerId: 12, quantity: 850, outsourceUnitPrice: '3000', styleId: 40, styleProcessId: 50, assignmentPlanId: 60, createdByEmployeeId: 22 },
  ], log: { id: 77, displayDate: '2026-07-31', coverageStartDate: '2026-07-01', coverageEndDate: '2026-07-31' },
    plan: { id: 60, orgId: 1, styleId: 40, workOrderId: 30, factoryId: 1, isCompleted: false }, finalLocked: false, payrollLocked: false };
  const client = s => {
    const order = () => ({ id: 30, orderNumber: 'L17-1', invoiceFinalLockedAt: s.finalLocked ? new Date() : null });
    const record = r => r && ({ ...r, workLog: r.workLogId===77?s.log:s.extraLogs.find(log=>log.id===r.workLogId), style: { id: 40, name: 'Shirt', code: 'AM02058' }, styleProcess: { id: 50, processName: 'Buttonhole' }, outsourcingPartner: { id: r.outsourcingPartnerId, name: 'Vendor' }, assignmentPlan: { ...s.plan, workOrder: order() } });
    const cost = r => r && ({ ...r, outsourcedWorkRecord: record(s.records.find(x=>x.id===r.outsourcedWorkRecordId)), workOrder: r.workOrderId ? order() : null, partner: { id: r.partnerOrgId, name: 'Vendor' } });
    const document = r => r && ({ ...r, partner: { id: r.partnerOrgId, name: 'Vendor' }, createdByEmployee: { id: r.createdByEmployeeId, name: 'Author' }, items: s.costs.filter(x=>x.expenseRequestId===r.id).sort((a,b)=>a.expenseRequestLine-b.expenseRequestLine).map(cost) });
    const matches = (r,w) => Object.entries(w).every(([k,v])=>r[k]===v);
    return {
      factory: { findMany: async()=>[{id:1,managementStartDate:'2026-04-01'}], findFirst: async()=>({id:1,managementStartDate:'2026-04-01'}) },
      systemSetting: {findUnique:async()=>null},
      expenseRequestAudit: {findMany:async({where,take})=>s.audits.filter(a=>a.orgId===where.orgId&&a.requestId===where.requestId&&(!where.version||a.version<where.version.lt)).sort((a,b)=>b.version-a.version).slice(0,take), findUnique: async({where})=>s.audits.find(x=>x.orgId===where.orgId_clientKey.orgId&&x.clientKey===where.orgId_clientKey.clientKey) || null, create: async({data})=>{s.audits.push(structuredClone(data));return data;} },
      expenseRequest: {
        findFirst: async({where})=>document(s.documents.find(r=>matches(r,where))),
        create: async({data})=>{const row={id:s.documents.length+1,version:1,...data};s.documents.push(row);return row;},
        update: async({where,data})=>{const row=s.documents.find(r=>r.id===where.id);return Object.assign(row,{...data,version:row.version+(data.version?.increment||0)});},
      },
      partnerTransactionCost: {
        findFirst: async({where})=>cost(s.costs.find(r=>matches(r,where))),
        create: async({data})=>{const row={id:`cost-${s.costs.length+1}`,...JSON.parse(JSON.stringify(data))};s.costs.push(row);return cost(row);},
        update: async({where,data})=>cost(Object.assign(s.costs.find(r=>r.id===where.id),JSON.parse(JSON.stringify(data)))),
        updateMany: async({where,data})=>{s.costs.filter(r=>matches(r,where)).forEach(r=>Object.assign(r,data));},
        delete: async({where})=>{s.costs=s.costs.filter(r=>r.id!==where.id);},
      },
      outsourcedWorkRecord: { findFirst: async({where})=>record(s.records.find(r=>matches(r,where))), update: async({where,data})=>Object.assign(s.records.find(r=>r.id===where.id),JSON.parse(JSON.stringify(data))),
        create:async({data})=>{const row={id:Math.max(...s.records.map(r=>r.id))+1,...JSON.parse(JSON.stringify(data))};s.records.push(row);return row;} },
      workLog: {create:async({data})=>{const row={id:100+s.extraLogs.length,...data};s.extraLogs.push(row);return row;}},
      transactionCode: { findFirst: async({where})=>({id:where.id,isActive:true,baseId:1,serviceTypeId:4,taxTreatmentId:3,vatEnabled:false,taxTreatment:{code:'EXEMPT',suffix:'E'},serviceType:{id:4},
        base:{isActive:true,code:'BTH',expenseType:{isActive:true},variants:[{id:2,taxTreatmentId:3,isActive:true,isEnabled:true}],entryMode:where.id===8?'PROCESS':'LOGISTICS',orderInput:'OPTIONAL',styleInput:'OPTIONAL',processInput:'OPTIONAL',requiredFields:[]}}) },
      organization: { findFirst: async()=>({id:11,name:'Vendor'}),findUnique:async()=>({id:11,name:'Vendor'}) },
      workOrder: { findFirst: async({where})=>where.invoiceFinalLockedAt ? (s.finalLocked?order():null) : order() },
      styleProcess: { findFirst: async()=>({id:50}) },
      workOrderItem: { findFirst: async()=>({id:1}) },
      assignmentPlan: { findFirst: async()=>s.plan,findMany:async()=>[{...s.plan,id:61,isCompleted:false,ctReviewRequired:false,assignmentCtSnapshot:{processes:[{styleProcessId:50}]},assignmentStSnapshot:{processes:[{styleProcessId:50}]}}] },
      payrollSnapshot: { findFirst: async()=>s.payrollLocked?{id:1}:null },
      $queryRaw: async()=>[], $queryRawUnsafe: async()=>[],
    };
  };
  return { state:()=>state, client:()=>client(state), change:patch=>Object.assign(state,patch), source:()=>loadExpenseEditorSource(client(state),1,'legacy','78'),
    save:async(body,kind='legacy',id='78',org=1)=>{const draft=structuredClone(state);const result=await saveExpenseEditor(client(draft),org,20,kind,id,body);state=draft;return result;} };
}
async function input(db) {
  const form=expenseEditorForm(await db.source());
  return {...form,title:'July buttonhole cost',clientKey:'edit-command-001',items:form.items.map(item=>({...item,transactionCodeId:8}))};
}

test('history is tenant-scoped, permission-gated and paged by version; serialization conflicts return a recoverable code',async()=>{
  const db=harness();await db.save(await input(db));
  const handlers=new Map();let orgId=1,allowed=true;
  const app={get:(path,fn)=>handlers.set(`GET ${path}`,fn),put:(path,fn)=>handlers.set(`PUT ${path}`,fn)};
  const gates={requireOrgRole:async(_req,_res,options)=>{assert.deepEqual(options.allowedRoles,['ADMIN','OPERATOR','ACCOUNTANT']);return allowed?{organization:{id:orgId}}:null;},actorId:()=>20};
  registerExpenseEditorRoutes(app,{...db.client(),$transaction:async()=>{throw {code:'P2010',meta:{code:'40001'}};}},gates);
  const response=()=>({status(n){this.code=n;return this;},json(v){this.value=v;return this;}});
  const req={params:{kind:'request',id:'1'},query:{}};let res=response();
  await handlers.get('GET /expense-request-editor/:kind/:id/history')(req,res);assert.equal(res.value.length,1);
  res=response();await handlers.get('GET /expense-request-editor/:kind/:id/history')({...req,query:{beforeVersion:'1'}},res);assert.deepEqual(res.value,[]);
  orgId=2;await assert.rejects(handlers.get('GET /expense-request-editor/:kind/:id/history')(req,response()),/NOT_FOUND/);
  orgId=1;allowed=false;res=response();await handlers.get('GET /expense-request-editor/:kind/:id/history')(req,res);assert.equal(res.value,undefined);
  allowed=true;res=response();await handlers.get('PUT /expense-request-editor/:kind/:id')({...req,body:{}},res);assert.equal(res.code,409);assert.equal(res.value.error,'EXPENSE_REQUEST_CHANGED');
});
test('historical editor loads only the selected source FK and never guesses its missing code/tax',async()=>{
  const db=harness(), form=expenseEditorForm(await db.source());
  assert.equal(form.items.length,1);assert.equal(form.items[0].sourceRecordId,78);assert.equal(form.items[0].transactionCodeId,'');
  assert.equal(form.items[0].unitPrice,'3000');assert.equal(form.items[0].quantity,'170');assert.equal(form.partnerOrgId,11);
  assert.equal(form.items[0].preservedReferences.plan.id,60);assert.equal(db.state().documents.length,0);
});
test('wrapping and editing legacy production preserves source IDs, original period, author and the other vendor',async()=>{
  const db=harness(), body=await input(db), before=structuredClone(db.state());
  const result=await db.save(body);assert.equal(result.requestId,1);assert.deepEqual(result.assignmentPlanIds,[60]);
  assert.deepEqual(db.state().records,before.records);assert.deepEqual(db.state().log,before.log);
  assert.equal(db.state().costs[0].outsourcedWorkRecordId,78);assert.equal(db.state().documents[0].createdByEmployeeId,20);
  await db.save(body);assert.equal(db.state().documents.length,1);assert.equal(db.state().costs.length,1);assert.equal(db.state().audits.length,1);
  const next=expenseEditorForm(await db.source());next.clientKey='edit-command-002';next.items[0].quantity='171';
  await db.save(next);assert.equal(db.state().costs[0].id,'cost-1');assert.equal(db.state().records[0].id,78);assert.equal(db.state().records[0].quantity,171);
  assert.equal(db.state().records[0].createdByEmployeeId,21);assert.equal(db.state().records[0].updatedByEmployeeId,20);
  assert.deepEqual(db.state().records[1],before.records[1]);assert.deepEqual(db.state().log,before.log);
  assert.equal(db.state().audits[1].beforeSnapshot.costs[0].quantity,'170');
});
test('stale edits, cross-tenant IDs, forged sources and invalid later rows leave no partial financial or production writes',async()=>{
  const db=harness(), body=await input(db), before=structuredClone(db.state());
  await assert.rejects(db.save({...body,revision:'old'}),/CHANGED/);
  await assert.rejects(db.save(body,'legacy','78',2),/NOT_FOUND/);
  await assert.rejects(db.save({...body,items:[{...body.items[0],sourceRecordId:79}]}),/LEGACY_SOURCE_REQUIRED/);
  await assert.rejects(db.save({...body,items:[{...body.items[0],quantity:'171'},{...body.items[0],sourceRecordId:null,unitPrice:'0'}]}),/INVALID_PRICE_OR_QUANTITY/);
  await assert.rejects(db.save({...body,items:[null]}),/INVALID_EXPENSE_REQUEST_HEADER/);
  assert.deepEqual(db.state(),before);
});
test('final invoice lock blocks all edits; completed production and confirmed payroll block production changes',async()=>{
  for(const policy of ['final','completed','payroll']) {
    const db=harness();if(policy==='final')db.change({finalLocked:true});if(policy==='completed')db.state().plan.isCompleted=true;if(policy==='payroll')db.change({payrollLocked:true});
    const body=await input(db);body.items[0].quantity='171';const before=structuredClone(db.state());
    await assert.rejects(db.save(body),policy==='final'?/ORDER_FINALLY_LOCKED/:policy==='completed'?/PRODUCTION_COMPLETED/:/PAYROLL_LOCKED/);
    assert.deepEqual(db.state(),before);
  }
});
test('document and standalone-cost entry points resolve the saved form; item edits and removal preserve business identities',async()=>{
  const db=harness(), body=await input(db);
  body.items.push({transactionCodeId:7,currency:'USD',description:'Additional expense',quantity:'2',unitPrice:'1.25',vatRate:'0',details:{}});
  await db.save(body);
  const form=expenseEditorForm(await db.source());assert.equal(form.items.length,2);assert.equal(db.state().documents[0].currency,null);
  const firstId=form.items[0].itemId,secondId=form.items[1].itemId;
  form.clientKey='edit-command-002';form.items[1].unitPrice='2.50';
  await db.save(form,'cost',firstId);assert.equal(db.state().costs[1].id,secondId);assert.equal(db.state().costs[1].amount,'5');
  await assert.rejects(db.save({...form,title:'Changed retry'},'cost',firstId),/RETRY_MISMATCH/);
  const next=expenseEditorForm(await db.source());next.clientKey='edit-command-003';next.items=next.items.slice(1);
  await db.save(next,'request','1');assert.equal(db.state().costs.length,1);assert.equal(db.state().costs[0].id,secondId);
  assert.equal(db.state().records.length,2);assert.equal(db.state().records[0].id,78);assert.equal(db.state().records[0].quantity,170);
  assert.equal(db.state().documents[0].id,1);assert.equal(db.state().documents[0].currency,'USD');
  assert.equal(db.state().audits.at(-1).beforeSnapshot.costs[0].id,firstId);
});
test('a legacy production source can select a general expense code without deleting or duplicating production',async()=>{
  const db=harness(),body=await input(db),before=structuredClone(db.state().records);
  body.items[0].transactionCodeId=7;
  await db.save(body);
  assert.equal(db.state().costs[0].transactionCodeId,7);assert.equal(db.state().costs[0].outsourcedWorkRecordId,78);
  assert.deepEqual(db.state().records,before);
});
test('a completed legacy process can acquire its first code and share one request with another new process',async()=>{
  const db=harness();db.state().plan.isCompleted=true;
  const before=structuredClone(db.state().records),body=await input(db);
  body.items.push({transactionCodeId:8,currency:'VND',description:'Second process',quantity:'200',unitPrice:'2500',vatRate:'0',workOrderId:30,styleId:40,styleProcessId:50,assignmentPlanId:61,details:{}});
  const result=await db.save(body);
  assert.equal(result.requestId,1);assert.equal(db.state().documents.length,1);assert.equal(db.state().costs.length,2);
  assert.deepEqual(db.state().records.slice(0,2),before);assert.equal(db.state().records[2].id,80);assert.equal(db.state().records[2].assignmentPlanId,61);
  assert.equal(db.state().records[2].quantity,200);assert.equal(db.state().extraLogs.length,1);
  assert.deepEqual(db.state().costs.map(row=>row.expenseRequestId),[1,1]);assert.deepEqual(db.state().costs.map(row=>row.outsourcedWorkRecordId),[78,80]);
  await db.save(body);assert.equal(db.state().records.length,3);assert.equal(db.state().extraLogs.length,1);
});
