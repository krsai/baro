import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {resolveEvidence,approvalState,approveExpense} from './bankEvidence';

// Internal lower bound only; new accounts have no user-defined opening period.
export const LEDGER_ZERO_START='0001-01-01';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const text=(value:any,max:number)=>typeof value==='string'&&value.trim()&&value.trim().length<=max?value.trim():fail('LEDGER_INVALID_INPUT');
export const ledgerDate=(value:any)=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return fail('LEDGER_INVALID_DATE');
  const date=new Date(`${value}T00:00:00.000Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return fail('LEDGER_INVALID_DATE');
  return value;
};
const currency=(value:any)=>['USD','VND','KRW'].includes(value)?value:fail('LEDGER_INVALID_CURRENCY');
const ledgerToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const digits=(code:string)=>code==='USD'?2:0;
const raw=(value:any)=>typeof value?.toFixed==='function'&&typeof value!=='number'?value.toFixed(4):String(value);
export const ledgerScale4=(value:any):bigint=>{
  const s=raw(value);
  if(!/^-?\d+(\.\d{1,4})?$/.test(s))return fail('LEDGER_INVALID_AMOUNT');
  const negative=s.startsWith('-'),[whole,fraction='']=s.replace(/^-/,'').split('.');
  return (negative?-1n:1n)*(BigInt(whole!)*10000n+BigInt(fraction.padEnd(4,'0')));
};
export const ledgerMoney=(value:bigint,code:string)=>{
  const negative=value<0n,absolute=(negative?-value:value).toString().padStart(5,'0'),n=digits(code);
  return `${negative?'-':''}${absolute.slice(0,-4)}${n?'.'+absolute.slice(-4,-4+n):''}`;
};
export const validateLedgerMoney=(value:any,code:string,opening=false)=>{
  if(typeof value!=='string'||value.length>30||!new RegExp(`^${opening?'-?':''}\\d{1,20}${digits(code)?'(\\.\\d{1,2})?':''}$`).test(value))return fail('LEDGER_INVALID_AMOUNT');
  const minor=ledgerScale4(value);
  if(!opening&&minor<=0n)return fail('LEDGER_INVALID_AMOUNT');
  return ledgerMoney(minor,code);
};
const clientKey=(value:any)=>/^[0-9a-f-]{36}$/i.test(String(value))?String(value):fail('LEDGER_INVALID_CLIENT_KEY');
const delta=(rows:any[])=>rows.reduce((sum:bigint,row:any)=>sum+(row.direction==='IN'?1n:-1n)*ledgerScale4(row._sum.amount||'0'),0n);
const sums=(db:any,where:any)=>db.bankLedgerEntry.groupBy({by:['direction'],where:{...where,voidedAt:null},_sum:{amount:true}});
export async function saveLedgerAccount(db:any,orgId:number,actor:string,body:any){
  const code=currency(body.currencyCode),key=clientKey(body.clientKey);
  const data={orgId,clientKey:key,bankName:text(body.bankName,120),accountNumber:text(body.accountNumber,100),accountHolder:text(body.accountHolder,160),currencyCode:code,openingDate:ledgerDate(body.openingDate),openingBalance:validateLedgerMoney(body.openingBalance,code,true)};
  if(data.openingDate>ledgerToday())return fail('LEDGER_FUTURE_DATE');
  return retryEditTransaction(db,async(tx:any)=>{
    const previous=await tx.bankLedgerAccount.findUnique({where:{orgId_clientKey:{orgId,clientKey:key}}});
    if(previous){
      if(Object.entries(data).some(([field,value])=>field==='openingBalance'?ledgerScale4(previous[field])!==ledgerScale4(value):previous[field]!==value))return fail('LEDGER_RETRY_CONFLICT',409);
      return previous;
    }
    if(await tx.bankLedgerAccount.findFirst({where:{orgId,bankName:data.bankName,accountNumber:data.accountNumber,currencyCode:code}}))return fail('LEDGER_ACCOUNT_EXISTS',409);
    return tx.bankLedgerAccount.create({data:{...data,createdBy:actor}});
  });
}
export async function postLedgerEntry(db:any,orgId:number,actor:string,accountId:string,body:any){return retryEditTransaction(db,tx=>postLedgerEntryInTransaction(tx,orgId,actor,accountId,body));}
export async function postLedgerEntryInTransaction(tx:any,orgId:number,actor:string,accountId:string,body:any){
    let account=await tx.bankLedgerAccount.findFirst({where:{id:accountId,orgId}});
    if(!account&&accountId.startsWith('entity:')){
      const masterId=accountId.slice(7);
      await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
      const master=await tx.organizationBankAccount.findFirst({where:{id:masterId,orgId,entityId:orgId},include:{currency:true}});
      if(!master)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
      account=await tx.bankLedgerAccount.findFirst({where:{orgId,entityAccountId:masterId}});
      if(!account){
        const openingDate=LEDGER_ZERO_START,openingBalance='0';
        account=await tx.bankLedgerAccount.create({data:{orgId,entityAccountId:masterId,clientKey:accountId,bankName:master.bankName,accountNumber:master.accountNumber,accountHolder:master.accountHolder,currencyCode:master.currency.code,openingDate,openingBalance,createdBy:actor}});
      }
    }
    if(!account)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
    const transactionDate=ledgerDate(body.transactionDate);
    if(transactionDate>ledgerToday())return fail('LEDGER_FUTURE_DATE');
    if(transactionDate<account.openingDate)return fail('LEDGER_BEFORE_OPENING');
    if(!['IN','OUT'].includes(body.direction))return fail('LEDGER_INVALID_DIRECTION');
    const data:any={orgId,accountId:account.id,clientKey:clientKey(body.clientKey),transactionDate,direction:body.direction,amount:validateLedgerMoney(body.amount,account.currencyCode),purpose:text(body.purpose,1000)};
    const previous=await tx.bankLedgerEntry.findUnique({where:{orgId_clientKey:{orgId,clientKey:data.clientKey}},include:{allocations:true}});
    if(previous){
      if(Object.entries(data).some(([field,value])=>field==='amount'?ledgerScale4(previous[field])!==ledgerScale4(value):previous[field]!==value))return fail('LEDGER_RETRY_CONFLICT',409);
      const type=body.evidenceType||'FILE',fee=validateLedgerMoney(body.bankFee||'0',account.currencyCode,true);
      const requested=type==='EXPENSE'?(body.expenseItems||[]).map((r:any)=>`${r.itemId}:${ledgerScale4(r.amount)}`).sort():[];
      const saved=type==='EXPENSE'?(previous.allocations||[]).map((r:any)=>`${r.expenseItemId}:${ledgerScale4(r.amount)}`).sort():[];
      if((previous.evidenceType||'FILE')!==type||ledgerScale4(previous.bankFee||'0')!==ledgerScale4(fee)||JSON.stringify(requested)!==JSON.stringify(saved)||(['FILE','INVOICE'].includes(type)&&previous.evidenceNumber!==String(body.evidenceNumber||'').trim()))return fail('LEDGER_RETRY_CONFLICT',409);
      return previous;
    }
    const evidence=await resolveEvidence(tx,orgId,account,{...body,amount:data.amount});
    const {allocations,...fields}=evidence;
    return tx.bankLedgerEntry.create({data:{...data,...fields,createdBy:actor,...(allocations.length?{allocations:{create:allocations.map(row=>({...row,orgId}))}}:{})}});
}
export async function listLedgerAccounts(db:any,orgId:number){return retryEditTransaction(db,tx=>readLedgerAccounts(tx,orgId));}
async function readLedgerAccounts(tx:any,orgId:number){
    const accounts=await tx.bankLedgerAccount.findMany({where:{orgId},include:{entityAccount:true},orderBy:[{createdAt:'asc'},{id:'asc'}]});
    const masters=await tx.organizationBankAccount.findMany({where:{orgId,entityId:orgId},include:{currency:true},orderBy:[{sortOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
    const totals=await tx.bankLedgerEntry.groupBy({by:['accountId','direction'],where:{orgId,voidedAt:null},_sum:{amount:true}});
    const result=accounts.map((account:any)=>({...account,displayName:account.entityAccount?.displayName,accountKind:account.entityAccount?.accountKind||'BANK',sortOrder:account.entityAccount?.sortOrder??0,openingBalance:ledgerMoney(ledgerScale4(account.openingBalance),account.currencyCode),currentBalance:ledgerMoney(ledgerScale4(account.openingBalance)+delta(totals.filter((row:any)=>row.accountId===account.id)),account.currencyCode)}));
    for(const master of masters)if(!accounts.some((a:any)=>a.entityAccountId===master.id))result.push({...master,id:'entity:'+master.id,currencyCode:master.currency.code,openingDate:LEDGER_ZERO_START,openingBalance:'0',currentBalance:'0',setupRequired:true} as any);
    return result.sort((a:any,b:any)=>a.sortOrder-b.sortOrder||new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()||a.id.localeCompare(b.id));
}
export async function listLedgerEntries(db:any,orgId:number,accountId:string,query:any){
  const start=ledgerDate(query.start),end=ledgerDate(query.end),page=Number(query.page||0);
  if(start>end||!Number.isSafeInteger(page)||page<0||page>100000)return fail('LEDGER_INVALID_RANGE');
  return retryEditTransaction(db,async(tx:any)=>{
    const account=await tx.bankLedgerAccount.findFirst({where:{id:accountId,orgId}});
    if(!account)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
    const scope={orgId,accountId};
    const rows=await tx.bankLedgerEntry.findMany({where:{...scope,transactionDate:{gte:start,lte:end}},orderBy:[{transactionDate:'asc'},{createdAt:'asc'},{id:'asc'}],skip:page*100,take:101});
    const allTotals=await sums(tx,scope),periodTotals=await sums(tx,{...scope,transactionDate:{gte:start,lte:end}});
    const first=rows[0];
    const prefix=first?{OR:[{transactionDate:{lt:first.transactionDate}},{transactionDate:first.transactionDate,createdAt:{lt:first.createdAt}},{transactionDate:first.transactionDate,createdAt:first.createdAt,id:{lt:first.id}}]}:{transactionDate:{lt:start}};
    const carry=await sums(tx,{...scope,...prefix});
    let balance=ledgerScale4(account.openingBalance)+delta(carry);
    const result=rows.slice(0,100).map((row:any)=>{
      if(!row.voidedAt)balance+=(row.direction==='IN'?1n:-1n)*ledgerScale4(row.amount);
      return {...row,amount:ledgerMoney(ledgerScale4(row.amount),account.currencyCode),balance:ledgerMoney(balance,account.currencyCode)};
    });
    return {account:{...account,openingBalance:ledgerMoney(ledgerScale4(account.openingBalance),account.currencyCode)},rows:result,page,hasMore:rows.length>100,
      currentBalance:ledgerMoney(ledgerScale4(account.openingBalance)+delta(allTotals),account.currencyCode),
      totalIn:ledgerMoney(ledgerScale4(periodTotals.find((row:any)=>row.direction==='IN')?._sum.amount||'0'),account.currencyCode),
      totalOut:ledgerMoney(ledgerScale4(periodTotals.find((row:any)=>row.direction==='OUT')?._sum.amount||'0'),account.currencyCode)};
  });
}
export async function postLedgerBatch(db:any,orgId:number,actor:string,body:any){
 const key=clientKey(body.clientKey),rows=body.rows;
 if(!Array.isArray(rows)||!rows.length||rows.length>50||rows.some((r:any)=>!r||typeof r.accountId!=='string'||r.accountId.length>100||(r.expenseItems!==undefined&&!Array.isArray(r.expenseItems))))return fail('LEDGER_INVALID_BATCH');
 const keys=rows.map((row:any)=>clientKey(row.clientKey));
 if(new Set(keys).size!==keys.length)return fail('LEDGER_INVALID_BATCH');
 // UI-only labels never identify financial records or change retry identity.
 const canonical=rows.map((r:any)=>({accountId:r.accountId,clientKey:r.clientKey,transactionDate:r.transactionDate,direction:r.direction,amount:r.amount,purpose:r.purpose,evidenceType:r.evidenceType||'FILE',evidenceNumber:r.evidenceNumber||'',bankFee:r.bankFee||'0',expenseItems:(r.expenseItems||[]).map((i:any)=>({itemId:i.itemId,amount:i.amount}))}));
 const requestHash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const previous=await tx.bankLedgerBatch.findUnique({where:{orgId_clientKey:{orgId,clientKey:key}}});
  if(previous){if(previous.requestHash!==requestHash||previous.createdBy!==actor)return fail('LEDGER_RETRY_CONFLICT',409);return {entryIds:previous.entryIds};}
  const entryIds:string[]=[];
  for(const [index,row] of rows.entries()){
   try{entryIds.push((await postLedgerEntryInTransaction(tx,orgId,actor,row.accountId,row)).id);}
   catch(error:any){error.message=`LEDGER_ROW:${index+1}:${error.message}`;throw error;}
  }
  await tx.bankLedgerBatch.create({data:{orgId,clientKey:key,requestHash,entryIds,createdBy:actor}});
  return {entryIds};
 },60000);
}
export async function listLedgerActivity(db:any,orgId:number,query:any){
 const start=ledgerDate(query.start),end=ledgerDate(query.end),page=Number(query.page||0),selected=String(query.accountId||'');
 if(start>end||!Number.isSafeInteger(page)||page<0||page>100000)return fail('LEDGER_INVALID_RANGE');
 return retryEditTransaction(db,async(tx:any)=>{
  const accounts=await readLedgerAccounts(tx,orgId);
  const selectedAccount=selected?accounts.find((a:any)=>a.id===selected||(a.entityAccountId&&selected==='entity:'+a.entityAccountId)):null;
  if(selected&&!selectedAccount)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
  const selectedAccountId=selectedAccount?.id||'';
  const totals=await tx.bankLedgerEntry.groupBy({by:['accountId','direction'],where:{orgId,voidedAt:null,transactionDate:{gte:start,lte:end}},_sum:{amount:true}});
  const summary=accounts.map((account:any)=>({...account,totalIn:ledgerMoney(ledgerScale4(totals.find((r:any)=>r.accountId===account.id&&r.direction==='IN')?._sum.amount||'0'),account.currencyCode),totalOut:ledgerMoney(ledgerScale4(totals.find((r:any)=>r.accountId===account.id&&r.direction==='OUT')?._sum.amount||'0'),account.currencyCode)}));
  const rows=await tx.bankLedgerEntry.findMany({where:{orgId,...(selectedAccountId?{accountId:selectedAccountId}:{}),transactionDate:{gte:start,lte:end}},orderBy:[{transactionDate:'asc'},{createdAt:'asc'},{id:'asc'}],skip:page*100,take:101});
  const balances=new Map<string,bigint>();
  for(const row of rows.slice(0,100))if(!balances.has(row.accountId)){
   const account=accounts.find((a:any)=>a.id===row.accountId);
   if(!account)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
   const prefix={OR:[{transactionDate:{lt:row.transactionDate}},{transactionDate:row.transactionDate,createdAt:{lt:row.createdAt}},{transactionDate:row.transactionDate,createdAt:row.createdAt,id:{lt:row.id}}]};
   balances.set(row.accountId,ledgerScale4(account.openingBalance)+delta(await sums(tx,{orgId,accountId:row.accountId,...prefix})));
  }
  const result=rows.slice(0,100).map((row:any)=>{
   const account=accounts.find((a:any)=>a.id===row.accountId);let balance=balances.get(row.accountId)!;
   if(!row.voidedAt)balance+=(row.direction==='IN'?1n:-1n)*ledgerScale4(row.amount);balances.set(row.accountId,balance);
   return {...row,currencyCode:account.currencyCode,accountName:account.displayName||[account.bankName,account.accountNumber].filter(Boolean).join(' / '),amount:ledgerMoney(ledgerScale4(row.amount),account.currencyCode),balance:ledgerMoney(balance,account.currencyCode)};
  });
  const currencyTotals=[...new Set<string>(summary.map((a:any)=>a.currencyCode))].map(code=>{
   const same=summary.filter((a:any)=>a.currencyCode===code),sum=(field:string)=>ledgerMoney(same.reduce((s:bigint,a:any)=>s+ledgerScale4(a[field]),0n),code);
   return {currencyCode:code,totalIn:sum('totalIn'),totalOut:sum('totalOut'),currentBalance:sum('currentBalance')};
  });
  return {accounts:summary,currencyTotals,rows:result,selectedAccountId,page,hasMore:rows.length>100};
 });
}
export function registerBankLedgerRoutes(app:any,db:any,gates:any){
  const access=async(req:any,res:any)=>{
    const context=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT']});
    if(!context)return null;
    if(context.systemUser?.systemRole!=='SYSTEM_ADMIN'){
      const policy=(await gates.loadPolicy()).policy;
      if(!policy?.[context.organization.type]?.[context.employee?.orgRole]?.includes('BANK_LEDGER')){res.status(403).json({error:'LEDGER_ACCESS_DENIED'});return null;}
    }
    return {orgId:context.organization.id,actor:context.requesterEmail,actorId:context.employee?.id};
  };
  app.get('/bank-ledger/accounts',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json({accounts:await listLedgerAccounts(db,scope.orgId)});});
  app.get('/bank-ledger/entries',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await listLedgerActivity(db,scope.orgId,req.query));});
  app.post('/bank-ledger/entries/batch',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.status(201).json(await postLedgerBatch(db,scope.orgId,scope.actor,req.body));});
  app.post('/bank-ledger/accounts',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.status(410).json({error:'REGISTER_ACCOUNT_IN_BUSINESS'});});
  app.get('/bank-ledger/evidence/expenses',async(req:any,res:any)=>{
    const scope=await access(req,res);if(!scope)return;
    const code=currency(req.query.currencyCode),search=String(req.query.search||'').trim();
    if(!/^EXP-\d{1,10}$/i.test(search))return res.json({items:[]});
    const requestId=Number(search.slice(4)),state=await approvalState(db,scope.orgId,requestId);
    if(!state.approved)return fail('LEDGER_EXPENSE_NOT_APPROVED');
    const items=await db.partnerTransactionCost.findMany({where:{orgId:scope.orgId,expenseRequestId:requestId,currency:code},orderBy:{expenseRequestLine:'asc'}});
    const result=[];for(const item of items){const used=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId:scope.orgId,expenseItemId:item.id,entry:{voidedAt:null}}});result.push({id:item.id,line:item.expenseRequestLine,description:item.description,amount:ledgerMoney(ledgerScale4(item.amount),code),remaining:ledgerMoney(ledgerScale4(item.amount)-used.reduce((s:bigint,r:any)=>s+ledgerScale4(r.amount),0n),code)});}
    res.json({items:result});
  });
  for(const method of ['get','post'])app[method]('/expense-requests/:requestId/approval',async(req:any,res:any)=>{
    const auth=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','OPERATOR','ACCOUNTANT']});if(!auth)return;
    const requestId=Number(req.params.requestId),actorId=auth.employee?.id;
    if(!Number.isSafeInteger(requestId)||requestId<=0)return fail('LEDGER_INVALID_INPUT');
    if(!actorId)return fail('LEDGER_ACCESS_DENIED',403);
    res.json(method==='get'?await approvalState(db,auth.organization.id,requestId,actorId):await approveExpense(db,auth.organization.id,actorId,requestId,req.body.version));
  });
  app.get('/bank-ledger/accounts/:accountId/entries',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.json(await listLedgerEntries(db,scope.orgId,req.params.accountId,req.query));});
  app.post('/bank-ledger/accounts/:accountId/entries',async(req:any,res:any)=>{const scope=await access(req,res);if(scope)res.status(201).json(await postLedgerEntry(db,scope.orgId,scope.actor,req.params.accountId,req.body));});
  app.post('/bank-ledger/accounts/:accountId/entries/:entryId/void',async(req:any,res:any)=>{
    const scope=await access(req,res);if(!scope)return;
    const reason=text(req.body.reason,1000);
    const row=await retryEditTransaction(db,async(tx:any)=>{
      const entry=await tx.bankLedgerEntry.findFirst({where:{id:req.params.entryId,accountId:req.params.accountId,orgId:scope.orgId}});
      if(!entry)return fail('LEDGER_ENTRY_NOT_FOUND',404);
      if(entry.voidedAt)return entry;
      return tx.bankLedgerEntry.update({where:{id:entry.id},data:{voidedAt:new Date(),voidedBy:scope.actor,voidReason:reason}});
    });res.json(row);
  });
}
