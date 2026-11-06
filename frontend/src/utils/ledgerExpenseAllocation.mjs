// Legacy settlement fees are already included in their parent cash amount.
// New bank fees use ordinary BANK rows and are counted independently.
export function syncSingleExpenseAllocations(rows){
 const parse=value=>{const match=/^(\d+)(?:\.(\d{0,2}))?$/.exec(String(value));return match?BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')):null;};
 return rows.map(row=>{
  if(row.entryKind!=='BANK'||row.evidenceType!=='EXPENSE'||row.expenseItems?.length!==1)return row;
  const amount=parse(row.amount),fees=rows.filter(child=>child.parentClientKey===row.clientKey&&child.entryKind==='FEE').map(child=>parse(child.amount));
  const allocated=amount===null||fees.some(value=>value===null)?null:amount-fees.reduce((sum,value)=>sum+value,0n);
  const value=allocated===null||allocated<0n?'':String(allocated/100n)+'.'+String(allocated%100n).padStart(2,'0');
  return {...row,expenseItems:[{...row.expenseItems[0],amount:value}]};
 });
}
