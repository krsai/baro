// Settlement fees are included in BANK amounts; write-offs are noncash.
// Keep arbitrary precision and never convert one currency into another.
export function ledgerEntryTotals(rows,accounts){
 const totals=new Map();
 for(const row of rows){
  if(row.entryKind!=='BANK')continue;
  const currency=accounts.find(account=>account.id===row.accountId)?.currencyCode;
  if(!currency)continue;
  const total=totals.get(currency)||{currency,incoming:0n,outgoing:0n};
  const input=String(row.amount||'').trim(),match=/^(\d+)(?:\.(\d{0,2}))?$/.exec(input);
  const amount=match?BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')):0n;
  if(row.direction==='IN')total.incoming+=amount;else if(row.direction==='OUT')total.outgoing+=amount;
  totals.set(currency,total);
 }
 const decimal=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
 return [...totals.values()].map(total=>({currency:total.currency,incoming:decimal(total.incoming),outgoing:decimal(total.outgoing),net:decimal(total.incoming-total.outgoing)}));
}
