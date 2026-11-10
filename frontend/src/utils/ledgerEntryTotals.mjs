import {ledgerTransferCurrency} from './ledgerFlow.mjs';
// Settlement fees are included in BANK amounts; write-offs are noncash.
// Keep arbitrary precision and never convert one currency into another.
export function ledgerEntryTotals(rows,accounts,parties=[]){
 const totals=new Map();
 const add=(currency,direction,value)=>{
  const total=totals.get(currency)||{currency,incoming:0n,outgoing:0n};
  const input=String(value||'').trim(),match=/^(\d+)(?:\.(\d{0,2}))?$/.exec(input);
  const amount=match?BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')):0n;
  if(direction==='IN')total.incoming+=amount;else if(direction==='OUT')total.outgoing+=amount;
  totals.set(currency,total);
 };
 for(const row of rows){
  if(row.entryKind!=='BANK')continue;
  const currency=accounts.find(account=>account.id===row.accountId)?.currencyCode;
  if(!currency)continue;
  add(currency,row.direction,row.amount);
  if(row.counterparty?.kind==='ACCOUNT'&&row.evidenceType!=='ADJUSTMENT'){
   const otherCurrency=ledgerTransferCurrency(row,accounts,parties)||currency;
   add(otherCurrency,row.direction==='IN'?'OUT':'IN',otherCurrency===currency?row.amount:row.transferAmount);
  }
 }
 const decimal=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
 return [...totals.values()].map(total=>({currency:total.currency,incoming:decimal(total.incoming),outgoing:decimal(total.outgoing),net:decimal(total.incoming-total.outgoing)}));
}
