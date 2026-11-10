// External endpoints identify a party, never a bank account owned by that party.
export function ledgerFlowEndpoints(row,account){
 if(row.evidenceType==='ADJUSTMENT')return {from:null,to:null};
 if('flowFrom' in row||'flowTo' in row)return {from:row.flowFrom||null,to:row.flowTo||null};
 const own=account?{kind:'ACCOUNT',id:account.entityAccountId||String(account.id).replace(/^entity:/,''),name:account.displayName||[account.bankName,account.accountNumber].filter(Boolean).join(' / '),currencyCode:account.currencyCode}:null;
 return row.direction==='OUT'?{from:own,to:row.counterparty||null}:{from:row.counterparty||null,to:own};
}
// UI drafts allow either endpoint to be entered first; posting still uses actual account/party FKs.
export function selectLedgerFlowEndpoint(row,accounts,side,value){
 const previousAccount=accounts.find(a=>a.id===row.accountId),flow={...ledgerFlowEndpoints(row,previousAccount),[side]:value};
 if(flow.from&&flow.to&&(flow.from.kind!=='ACCOUNT'&&flow.to.kind!=='ACCOUNT'||flow.from.kind===flow.to.kind&&flow.from.id===flow.to.id))return null;
 const endpoint=flow.from?.kind==='ACCOUNT'?flow.from:flow.to?.kind==='ACCOUNT'?flow.to:null;
 const account=endpoint?accounts.find(a=>(a.entityAccountId||String(a.id).replace(/^entity:/,''))===endpoint.id):null;
 if(endpoint&&!account)return null;
 const direction=flow.from?.kind==='ACCOUNT'?'OUT':'IN',counterparty=direction==='OUT'?flow.to:flow.from;
 const changedCurrency=previousAccount?.currencyCode!==account?.currencyCode;
 return {flowFrom:flow.from,flowTo:flow.to,accountId:account?.id||'',direction,counterparty:counterparty||null,
  ...(changedCurrency?{amount:''}:{}),transferAmount:'',transferCurrencyCode:''};
}
export function selectLedgerEndpoint(row,account,side,value){
 const ownId=account?.entityAccountId||String(account?.id||'').replace(/^entity:/,'');
 const selectedOwn=value?.kind==='ACCOUNT'&&value.id===ownId;
 return {direction:selectedOwn?(side==='from'?'OUT':'IN'):(side==='from'?'IN':'OUT'),counterparty:selectedOwn?row.counterparty:value,...(!selectedOwn&&(row.counterparty?.kind!==value?.kind||row.counterparty?.id!==value?.id||row.counterparty?.currencyCode!==value?.currencyCode)?{transferAmount:'',transferCurrencyCode:''}:{})};
}
export function ledgerTransferCurrency(row,accounts=[],parties=[]){
 if(row.counterparty?.kind!=='ACCOUNT')return null;
 return row.transferCurrencyCode||row.counterparty.currencyCode||parties.find(p=>p.kind==='ACCOUNT'&&p.id===row.counterparty.id)?.currencyCode||accounts.find(a=>a.entityAccountId===row.counterparty.id||a.id==='entity:'+row.counterparty.id)?.currencyCode||accounts.find(a=>a.id===row.accountId)?.currencyCode;
}
export function ledgerTransferRate(row,ownCurrency,otherCurrency){
 const scaled=value=>/^\d+(\.\d{1,4})?$/.test(String(value))?BigInt(String(value).split('.')[0])*10000n+BigInt((String(value).split('.')[1]||'').padEnd(4,'0')):0n;
 const own=scaled(row.amount),other=scaled(row.transferAmount);if(!own||!other||ownCurrency===otherCurrency)return '';
 const from=row.direction==='OUT'?own:other,to=row.direction==='OUT'?other:own,rate=(to*100000000n+from/2n)/from;
 const value=(String(rate/100000000n)+'.'+String(rate%100000000n).padStart(8,'0')).replace(/\.?0+$/,'');
 return `1 ${row.direction==='OUT'?ownCurrency:otherCurrency} ≈ ${value} ${row.direction==='OUT'?otherCurrency:ownCurrency}`;
}
