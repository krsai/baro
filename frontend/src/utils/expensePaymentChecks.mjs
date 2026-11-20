const units=value=>{const m=/^(\d+)(?:\.(\d{0,4}))?$/.exec(String(value??''));return m?BigInt(m[1])*10000n+BigInt((m[2]||'').padEnd(4,'0')):null;};
export function expensePaymentChecks(rows){
 let vat=false,difference=false;
 for(const row of rows){
  if(row.entryKind!=='BANK'||row.evidenceType!=='EXPENSE')continue;
  const baseline=row.expenseComparison;
  const sameSource=baseline?.version===1&&(baseline.paymentScheduleId??null)===(row.paymentScheduleId||null)&&baseline.items?.length===row.expenseItems?.length&&row.expenseItems.every(item=>baseline.items.some(old=>old.itemId===item.itemId));
  for(const item of row.expenseItems||[]){
   const source=row.document?.items?.find(cost=>cost.id===item.itemId);
   vat=vat||Number(source?.vatRate??item.vatRate)>0;
   const schedule=row.paymentScheduleId?row.document?.paymentSchedule?.find(s=>s.id===row.paymentScheduleId):null;
   const expected=units(sameSource?baseline.items.find(old=>old.itemId===item.itemId).expected:schedule?.remaining??source?.remaining),actual=units(item.amount);
   if(expected!==null&&actual!==null&&expected!==actual)difference=true;
  }
 }
 return {vat,difference};
}
