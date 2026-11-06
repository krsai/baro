import {createHash,randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate,ledgerScale4,ledgerMoney,validateLedgerMoney,readLedgerAccounts,postLedgerEntryInTransaction} from './bankLedger';
import {provisionSettingDefaults} from './transactionSettingRoutes';
import {ACCOUNTING_CODE_INCLUDE,resolveAccountingCode} from './accountingCode';

export async function fundsAdjustmentCode(tx:any,orgId:number){
 const read=()=>tx.transactionCode.findFirst({where:{ownerOrgId:orgId,code:'FADE',isActive:true},include:ACCOUNTING_CODE_INCLUDE});
 let row=await read();
 if(!row){await provisionSettingDefaults(tx,orgId,true);row=await read();}
 const code=resolveAccountingCode(row);
 if(!code||code.base?.code!=='FAD')throw createHttpError(400,'LEDGER_ACCOUNTING_CODE_INVALID');
 return code.id;
}

export async function reconcileLedgerBalances(db:any,scope:{orgId:number,actorId?:number,actor:string},body:any){
 const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
 if(!scope.actorId)return fail('LEDGER_ADJUSTMENT_ADMIN_REQUIRED',403);
 if(typeof body?.clientKey!=='string'||!/^[0-9a-f-]{36}$/i.test(body.clientKey))return fail('LEDGER_INVALID_CLIENT_KEY');
 if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>1000)return fail('LEDGER_INVALID_INPUT');
 if(!Array.isArray(body.accounts)||!body.accounts.length||body.accounts.length>50)return fail('LEDGER_INVALID_BATCH');
 const rows=body.accounts.map((row:any)=>{
  if(typeof row?.accountId!=='string'||!row.accountId||row.accountId.length>100||!['USD','VND','KRW'].includes(row.currencyCode))return fail('LEDGER_INVALID_INPUT');
  return {accountId:row.accountId,currencyCode:row.currencyCode,expectedBalance:validateLedgerMoney(row.expectedBalance,row.currencyCode,true),targetBalance:validateLedgerMoney(row.targetBalance,row.currencyCode,true)};
 }).sort((a:any,b:any)=>a.accountId.localeCompare(b.accountId));
 if(new Set(rows.map((row:any)=>row.accountId)).size!==rows.length)return fail('LEDGER_INVALID_BATCH');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const balanceDate=body.balanceDate===undefined?undefined:ledgerDate(body.balanceDate);
 if(balanceDate&&balanceDate>today)return fail('LEDGER_INVALID_DATE');
 const reason=body.reason.trim(),requestHash=createHash('sha256').update(JSON.stringify({kind:'BALANCE_TARGET',...(balanceDate?{balanceDate}:{}),actorId:scope.actorId,reason,accounts:rows})).digest('hex');
 return retryEditTransaction(db,async(tx:any)=>{
  const actor=await tx.employee.findFirst({where:{id:scope.actorId,orgId:scope.orgId,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true}});
  if(!actor)return fail('LEDGER_ADJUSTMENT_ADMIN_REQUIRED',403);
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',scope.orgId);
  const receipt=await tx.bankLedgerBatch.findUnique({where:{orgId_clientKey:{orgId:scope.orgId,clientKey:body.clientKey}}});
  if(receipt){if(receipt.requestHash!==requestHash||receipt.createdBy!==scope.actor)return fail('LEDGER_RETRY_CONFLICT',409);return {entryIds:receipt.entryIds};}
  const transactionDate=balanceDate||today;
  const accounts=await readLedgerAccounts(tx,scope.orgId,balanceDate,!!balanceDate),entryIds:string[]=[];
  // Validate the entire snapshot before appending any adjustment. A concurrent
  // writer conflicts with these serializable reads and must reload the balance.
  for(const row of rows){
   const account=accounts.find((account:any)=>account.id===row.accountId);
   if(!account||account.currencyCode!==row.currencyCode||account.openingDate>transactionDate)return fail('LEDGER_ACCOUNT_NOT_FOUND',404);
   if(ledgerScale4(account.currentBalance)!==ledgerScale4(row.expectedBalance))return fail('LEDGER_BALANCE_CHANGED',409);
  }
  let accountingCodeId:number|undefined;
  for(const row of rows){
   const difference=ledgerScale4(row.targetBalance)-ledgerScale4(row.expectedBalance);
   if(!difference)continue;
   accountingCodeId??=await fundsAdjustmentCode(tx,scope.orgId);
   const entry=await postLedgerEntryInTransaction(tx,scope.orgId,scope.actor,row.accountId,{clientKey:randomUUID(),transactionDate,direction:difference>0n?'IN':'OUT',amount:ledgerMoney(difference>0n?difference:-difference,row.currencyCode),purpose:reason,evidenceType:'ADJUSTMENT',evidenceNumber:'',accountingCodeId});
   entryIds.push(entry.id);
  }
  await tx.bankLedgerBatch.create({data:{orgId:scope.orgId,clientKey:body.clientKey,requestHash,entryIds,createdBy:scope.actor}});
  return {entryIds};
 },60000);
}
