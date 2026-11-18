import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {listAccountingAlerts,acknowledgeAccountingAlert,accountingAlertKinds}=require('../backend/dist/services/accountingAlerts');
const {readDashboardRecipients,saveDashboardRecipients}=require('../backend/dist/services/dashboardAlertRecipients');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
test('missing codes use actual active company ledger entries, independent recipients, permissions and personal acknowledgements',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id;
  const op=await db.employee.create({data:{orgId:org,name:'Ops',orgRole:'OPERATOR',status:'ACTIVE',gradeId:s.people.junior.gradeId}});
  for(const direction of ['IN','OUT'])await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-18',direction,amount:'5',purpose:'Uncoded transaction',evidenceType:'FILE',evidenceNumber:'uncoded.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-18',direction:'OUT',amount:'3',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'coded.pdf',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const permissions={ledger:true,expense:false,invoice:false},query={kinds:'UNCODED_LEDGER'};
  let list=await listAccountingAlerts(db,org,admin,permissions,query);
  assert.equal(list.total,2);assert.ok(list.rows.every(row=>row.path.startsWith('/bank-ledger/edit/')&&row.amount==='5'&&row.currencyCode==='USD'));
  assert.deepEqual(new Set(list.rows.map(row=>row.actualDirection)),new Set(['IN','OUT']));
  assert.equal((await listAccountingAlerts(db,org,admin,{...permissions,ledger:false},query)).total,0);
  assert.equal((await listAccountingAlerts(db,s.other.id,admin,permissions,query).catch(()=>({total:0}))).total,0);
  const policy=await saveDashboardRecipients(db,org,admin,{revision:0,uncodedRoles:['OPERATOR']});
  assert.deepEqual(policy.handledRoles,['ADMIN','ACCOUNTANT']);assert.deepEqual(policy.uncodedRoles,['OPERATOR']);
  assert.equal((await listAccountingAlerts(db,org,admin,permissions,query)).total,0);
  list=await listAccountingAlerts(db,org,op.id,permissions,query);assert.equal(list.total,2);
  await assert.rejects(acknowledgeAccountingAlert(db,org,admin,permissions,list.rows[0].signature),/ACCESS_DENIED/);
  await acknowledgeAccountingAlert(db,org,op.id,permissions,list.rows[0].signature);
  assert.equal((await listAccountingAlerts(db,org,op.id,permissions,query)).total,1);
  const final=await saveDashboardRecipients(db,org,admin,{revision:1,uncodedRoles:[]});assert.deepEqual(final.uncodedRoles,[]);
  assert.deepEqual((await readDashboardRecipients(db,org)).handledRoles,['ADMIN','ACCOUNTANT']);
  await assert.rejects(listAccountingAlerts(db,org,op.id,permissions,query),/ACCESS_DENIED/);
  assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,voidedAt:null}}),3,'settings and acknowledgement never rewrite ledger data');
 }finally{await f.close();}
});
test('missing-code kind is ledger-only and uses null FK rather than code names',()=>{
 assert.deepEqual(accountingAlertKinds({sourceKind:'LEDGER',accountingCodeId:null,code:null},null),['UNCODED_LEDGER']);
 assert.deepEqual(accountingAlertKinds({sourceKind:'EXPENSE',accountingCodeId:null,code:null},null),[]);
 assert.deepEqual(accountingAlertKinds({sourceKind:'LEDGER',accountingCodeId:1,code:null},null),[]);
});

test('linked item codes prevent a false missing representative code alert',()=>{
 const source={sourceKind:'LEDGER',accountingCodeId:null,code:null};
 assert.deepEqual(accountingAlertKinds({...source,hasLinkedCodes:true},null),[]);
 assert.deepEqual(accountingAlertKinds({...source,hasLinkedCodes:false},null),['UNCODED_LEDGER']);
});

test('candidate lookup resolves actual company expense FKs and settlement codes',async()=>{
 const {accountingAlertCandidates}=require('../backend/dist/services/accountingAlerts');
 const make=(id,allocations=[],settlementLines=[])=>({id,allocations,settlementLines,amount:'10',transactionDate:'2026-11-19',direction:'OUT',accountingCodeId:null});
 const entries=[make('coded',[{expenseItemId:'a'},{expenseItemId:'b'}]),make('partial',[{expenseItemId:'a'},{expenseItemId:'missing'}]),make('bare'),make('settled',[],[{id:'line',accountingCode:{id:4,base:{cashDirection:'BOTH'}}}])];
 const db={bankLedgerEntry:{findMany:async()=>entries},partnerTransactionCost:{findMany:async query=>{
  assert.equal(query.where.orgId,7);assert.deepEqual(new Set(query.where.id.in),new Set(['a','b','missing']));
  return [{id:'a',transactionCodeId:1},{id:'b',transactionCodeId:2}];
 }},changeApprovalRequest:{findMany:async()=>[]}};
 const rows=await accountingAlertCandidates(db,7,{ledger:true});
 assert.deepEqual(new Set(rows.filter(row=>row.kind==='UNCODED_LEDGER').map(row=>row.sourceId)),new Set(['partial','bare']));
});
