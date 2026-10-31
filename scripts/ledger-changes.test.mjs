import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Prisma}=require('../backend/node_modules/@prisma/client');
const {listLedgerChanges}=require('../backend/dist/services/ledgerChanges.js');
const {registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger.js');
const {accountReportToday,shiftReportDate}=require('../backend/dist/services/accountOverview.js');
const today=accountReportToday();
const account={entityAccount:{displayName:'Cash'},bankName:'',accountNumber:'',currencyCode:'USD'};
const entry=(id,extra={})=>({id,orgId:1,accountId:'cash',account,transactionDate:'2020-01-01',direction:'IN',amount:'9007199254740993.9900',purpose:'Original',accountingCodeId:7,accountingCode:{code:'GENE'},evidenceType:'FILE',evidenceNumber:'old.pdf',bankFee:'0',writeOffAmount:'0',settlementLines:[],allocations:[],voidedAt:null,voidedBy:null,voidReason:null,revisesEntryId:null,...extra});
function fixture(){
 const entries=[entry('old',{voidedAt:new Date(today+'T00:00:00+07:00'),voidedBy:'editor@company.test',voidReason:'Corrected by replacement'}),entry('new',{revisesEntryId:'old',amount:'9007199254740994.0000',purpose:'Changed',evidenceNumber:'new.pdf'}),entry('deleted',{voidedAt:new Date(today+'T01:00:00+07:00'),voidedBy:'accountant@company.test',voidReason:'Duplicate'}),entry('foreign',{orgId:2,voidedAt:new Date(today+'T02:00:00+07:00')})];
 const reads=[];
 const matches=where=>entries.filter(row=>row.orgId===where.orgId&&row.voidedAt&&row.voidedAt>=where.voidedAt.gte&&row.voidedAt<where.voidedAt.lt&&(!where.replacementEntries||(where.replacementEntries.some?entries.some(next=>next.orgId===where.orgId&&next.revisesEntryId===row.id):!entries.some(next=>next.orgId===where.orgId&&next.revisesEntryId===row.id))));
 const validateSelect=(modelName,select)=>{const model=Prisma.dmmf.datamodel.models.find(row=>row.name===modelName);for(const [key,value] of Object.entries(select)){const field=model.fields.find(row=>row.name===key);assert.ok(field,modelName+'.'+key);if(value.select)validateSelect(field.type,value.select);}};
 const db={bankLedgerEntry:{count:async({where})=>matches(where).length,findMany:async query=>{reads.push(query);validateSelect('BankLedgerEntry',query.select);return matches(query.where).sort((a,b)=>b.voidedAt-a.voidedAt||b.id.localeCompare(a.id)).slice(query.skip,query.skip+query.take).map(row=>({...row,replacementEntries:entries.filter(next=>next.orgId===query.where.orgId&&next.revisesEntryId===row.id)}));}},$transaction:async callback=>callback(db)};
 return {db,entries,reads};
}
test('history uses change time, actual revision links and exact old/new amounts without mutating transactions',async()=>{
 const {db,entries,reads}=fixture(),before=structuredClone(entries);
 const result=await listLedgerChanges(db,1,{start:today,end:today});
 assert.equal(result.total,2);assert.deepEqual(result.rows.map(row=>row.action),['DELETE','EDIT']);
 const change=result.rows[1];assert.equal(change.actor,'editor@company.test');assert.equal(change.reason,null);assert.equal(change.before.amount,'9007199254740993.99');assert.equal(change.after.amount,'9007199254740994.00');assert.deepEqual(change.changedFields,['amount','purpose','evidenceNumber']);
 assert.equal(result.rows[0].reason,'Duplicate');assert.equal(result.rows[0].after,null);assert.deepEqual(entries,before);
 assert.equal(reads[0].take,20);assert.equal(reads[0].where.orgId,1);assert.equal(reads[0].where.voidedAt.gte.toISOString(),new Date(today+'T00:00:00+07:00').toISOString());
});
test('edit and delete filters retain revision chains, distinguish later deletion and page before transferring data',async()=>{
 const {db,entries}=fixture();entries.find(row=>row.id==='new').voidedAt=new Date(today+'T03:00:00+07:00');
 assert.equal((await listLedgerChanges(db,1,{start:today,end:today,action:'EDIT'})).rows[0].id,'old');
 const deleted=await listLedgerChanges(db,1,{start:today,end:today,action:'DELETE'});assert.deepEqual(deleted.rows.map(row=>row.id),['new','deleted']);
 for(let index=0;index<11;index++)entries.push(entry('d'+index,{voidedAt:new Date(today+'T04:00:00+07:00')}));
 const page=await listLedgerChanges(db,1,{start:today,end:today,page:1,pageSize:10});assert.equal(page.total,14);assert.equal(page.rows.length,4);assert.ok(page.rows.every(row=>row.id!=='foreign'));
});
test('proof and settlement changes show real scoped references, ignore row identity/order, and retain currencies separately',async()=>{
 const {db,entries}=fixture(),old=entries.find(row=>row.id==='old'),next=entries.find(row=>row.id==='new');
 const fee={kind:'FEE',amount:'1',purpose:'Transfer',accountingCodeId:8,accountingCode:{code:'FEEE'}};
 old.settlementLines=[{...fee,id:'first'}];next.settlementLines=[{...fee,id:'replacement'}];old.bankFee=next.bankFee='1';
 old.allocations=[{invoiceId:'invoice',amount:'5'}];next.allocations=[{expenseItemId:'cost',amount:'5',requestVersion:2}];
 db.invoice={findMany:async({where})=>{assert.equal(where.sellerOrgId,1);assert.deepEqual(where.id.in,['invoice']);return [{id:'invoice',invoiceNumber:'INV-2026-1'}];}};
 db.partnerTransactionCost={findMany:async({where})=>{assert.equal(where.orgId,1);return [{id:'cost',expenseRequestLine:2,expenseRequest:{id:1,managementNumber:'EXP-2026-1'}}];}};
 const sameCurrency=await listLedgerChanges(db,1,{start:today,end:today,action:'EDIT'});assert.equal(sameCurrency.rows[0].changedFields.includes('settlementLines'),false);
 next.account={...account,currencyCode:'VND'};next.accountId='vnd';next.amount='100';next.bankFee='1';next.settlementLines=[{...fee,id:'replacement'}];
 const result=await listLedgerChanges(db,1,{start:today,end:today,action:'EDIT'}),row=result.rows[0];
 assert.equal(row.before.allocations[0].reference,'INV-2026-1');assert.equal(row.after.allocations[0].reference,'EXP-2026-1 / 2');assert.equal(row.after.currencyCode,'VND');assert.equal(row.after.amount,'100');assert.ok(row.changedFields.includes('allocations'));assert.ok(row.changedFields.includes('accountId'));
});
test('invalid filters and ranges are rejected before queries',async()=>{
 const {db}=fixture();for(const query of [{start:today,end:shiftReportDate(today,-1)},{end:shiftReportDate(today,1)},{action:'UNKNOWN'},{page:-1},{page:1.5},{pageSize:100},{start:'2026-02-30'}])await assert.rejects(listLedgerChanges(db,1,query));
});
test('history route enforces bank permissions and uses authorized company instead of query scope',async()=>{
 const routes=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,handler)=>routes.set(method+' '+path,handler)]));
 const {db}=fixture();let allowed=false,feature=true;
 registerBankLedgerRoutes(app,db,{requireOrgRole:async()=>allowed?{organization:{id:1,type:'MANUFACTURER'},employee:{orgRole:'ADMIN'},requesterEmail:'admin'}:null,loadPolicy:async()=>({policy:{MANUFACTURER:{ADMIN:feature?['BANK_LEDGER']:[]}}})});
 const response={status(code){this.code=code;return this;},json(value){this.value=value;}};
 const handler=routes.get('get /bank-ledger/changes');await handler({query:{orgId:2}},response);assert.equal(response.value,undefined);
 allowed=true;feature=false;await handler({query:{orgId:2}},response);assert.equal(response.code,403);
 feature=true;await handler({query:{orgId:2,start:today,end:today}},response);assert.equal(response.value.total,2);assert.ok(response.value.rows.every(row=>row.id!=='foreign'));
});
