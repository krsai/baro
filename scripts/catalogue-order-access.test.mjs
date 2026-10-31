import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {partnerIndustryLabel} from '../frontend/src/utils/partnerIndustry.mjs';
const require=createRequire(import.meta.url);
const {saveCatalogueOrder,orderedExpenseTypes}=require('../backend/dist/services/catalogueOrder.js');
const {requireLedgerAdjustmentAccess}=require('../backend/dist/services/ledgerAdjustmentAccess.js');
const {registerCodeBaseRoutes}=require('../backend/dist/services/codeBaseManagement.js');
const {partnerIndustryOption}=require('../backend/dist/services/partnerIndustry.js');
const {registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger.js');

function fixture(){
 const roles=[{id:2,sortOrder:0},{id:1,sortOrder:1}],expenses=[{id:1,code:'PRODUCTION'},{id:2,code:'LOGISTICS'}];
 let stored=null;
 const db={$queryRawUnsafe:async()=>[],partnerRole:{findMany:async()=>[...roles].sort((a,b)=>a.sortOrder-b.sortOrder),update:async({where,data})=>Object.assign(roles.find(row=>row.id===where.id),data)},expenseType:{findMany:async()=>expenses},systemSetting:{findUnique:async()=>stored,upsert:async({update})=>stored=structuredClone(update)}};
 return {db,roles,expenses};
}
test('catalogue ordering persists by IDs and rejects stale, missing, duplicate or foreign IDs',async()=>{
 const {db,roles,expenses}=fixture();
 await saveCatalogueOrder(db,'roles',{previousIds:[2,1],ids:[1,2]});
 assert.deepEqual([...roles].sort((a,b)=>a.sortOrder-b.sortOrder).map(row=>row.id),[1,2]);
 await assert.rejects(saveCatalogueOrder(db,'roles',{previousIds:[2,1],ids:[2,1]}),/CATALOGUE_ORDER_CHANGED/);
 for(const ids of [[1],[1,1],[1,99],['1',2]])await assert.rejects(saveCatalogueOrder(db,'expenses',{previousIds:[1,2],ids}),/INVALID_CATALOGUE_ORDER/);
 await saveCatalogueOrder(db,'expenses',{previousIds:[1,2],ids:[2,1]});
 assert.deepEqual((await orderedExpenseTypes(db,expenses)).map(row=>row.id),[2,1]);
 assert.deepEqual(expenses.map(row=>row.code),['PRODUCTION','LOGISTICS']);
 assert.deepEqual((await orderedExpenseTypes(db,[...expenses,{id:3,code:'MATERIAL'}])).map(row=>row.id),[2,1,3]);
});
test('only SYSTEM can reorder or edit the accounting category code; renaming keeps its identity and input mode',async()=>{
 const handlers=new Map(),row={id:1,code:'PRODUCTION',entryMode:'PROCESS'};let allowed=false,writes=0,locks=0;
 const db={expenseType:{findUnique:async()=>row,update:async({where,data})=>{assert.equal(where.id,1);assert.equal(data.code,'MAKING');assert.equal(data.entryMode,undefined);writes++;return {...row,...data};}},$transaction:async()=>{locks++;}};
 registerCodeBaseRoutes(Object.fromEntries(['get','put','post','delete'].map(method=>[method,(path,fn)=>handlers.set(method+':'+path,fn)])),db,{requireSystemAdmin:async()=>allowed});
 const res={json:value=>value};
 await handlers.get('put:/expense-types/order')({body:{}},res);assert.equal(locks,0);
 const req={params:{id:'1'},body:{code:'making',nameEn:'Making',nameKo:'',nameVi:'',isActive:true}};
 await handlers.get('put:/expense-types/:id')(req,res);assert.equal(writes,0);
 allowed=true;await handlers.get('put:/expense-types/:id')(req,res);assert.equal(writes,1);assert.equal(row.code,'PRODUCTION');
 await assert.rejects(handlers.get('put:/expense-types/:id')({...req,body:{...req.body,code:'OTHER'}},res),/INVALID_EXPENSE_TYPE/);
});
test('former generic industry is marked Check by its original ID and is unavailable for new assignments',()=>{
 const row={id:41,code:'GENERAL',nameKo:'관리',systemDefault:{id:7,code:'GENERAL',isActive:true}};
 assert.equal(partnerIndustryLabel(row,'ko'),'확인');assert.equal(partnerIndustryLabel(row,'en'),'Check');
 assert.equal(partnerIndustryOption(row,'MATERIAL_SUPPLIER'),null);assert.equal(row.id,41);assert.equal(row.nameKo,'관리');
});
test('accountants cannot create adjustments or bypass the rule by replacing, deleting or voiding an existing adjustment',async()=>{
 let reads=0;
 const db={bankLedgerEntry:{findFirst:async({where})=>{reads++;assert.equal(where.orgId,7);return where.id==='adjustment'?{evidenceType:'ADJUSTMENT'}:{evidenceType:'FILE'};}}};
 const user={orgId:7,role:'ACCOUNTANT'};
 for(const body of [{evidenceType:'ADJUSTMENT'},{rows:[{evidenceType:'FILE'},{evidenceType:'ADJUSTMENT'}]}])await assert.rejects(requireLedgerAdjustmentAccess(db,user,body),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
 assert.equal(reads,0);
 for(const body of [null,{rows:[{evidenceType:'FILE'}]}])await assert.rejects(requireLedgerAdjustmentAccess(db,user,body,'adjustment'),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
 await requireLedgerAdjustmentAccess(db,user,{rows:[{evidenceType:'FILE'}]},'normal');
 await requireLedgerAdjustmentAccess(db,{orgId:7,role:'ADMIN'},{evidenceType:'ADJUSTMENT'},'adjustment');
 await assert.rejects(requireLedgerAdjustmentAccess(db,{orgId:7},{evidenceType:'ADJUSTMENT'}),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
});
test('all ledger write routes enforce adjustment permissions using the actual employee role',async()=>{
 const handlers=new Map();
 const db={bankLedgerEntry:{findFirst:async({where})=>{assert.equal(where.orgId,7);return {evidenceType:'ADJUSTMENT'};}}};
 registerBankLedgerRoutes(Object.fromEntries(['get','put','post','delete'].map(method=>[method,(path,fn)=>handlers.set(method+':'+path,fn)])),db,{requireOrgRole:async()=>({organization:{id:7},employee:{id:3,orgRole:'ACCOUNTANT'},systemUser:{systemRole:'SYSTEM_ADMIN'}})});
 const res={json:()=>{},status(){return this;}};
 for(const route of ['post:/bank-ledger/entries/batch','post:/bank-ledger/accounts/:accountId/entries','put:/bank-ledger/entries/:entryId','delete:/bank-ledger/entries/:entryId','post:/bank-ledger/accounts/:accountId/entries/:entryId/void']){
  await assert.rejects(handlers.get(route)({params:{accountId:'a',entryId:'existing'},body:{evidenceType:'ADJUSTMENT',role:'ADMIN',reason:'test'}},res),/LEDGER_ADJUSTMENT_ADMIN_REQUIRED/);
 }
});
