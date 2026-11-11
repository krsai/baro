export function ledgerExpenseRows(rows){
 return rows.flatMap(row=>row.entryKind==='BANK'&&row.evidenceType==='EXPENSE'&&row.expenseItems?.length>1
  ?[...row.expenseItems].sort((a,b)=>(a.line||0)-(b.line||0)).map(item=>({row,item:{...item,accountingCode:item.accountingCode||row.document?.items?.find(cost=>cost.id===item.itemId)?.accountingCode}})):[{row,item:null}]);
}
export function changeLedgerExpenseItem(row,itemId,amount){
 const expenseItems=row.expenseItems.map(item=>item.itemId===itemId?{...item,amount}:item);
 const scale=value=>{const m=/^(\d+)(?:\.(\d{0,4}))?$/.exec(String(value));return m?BigInt(m[1])*10000n+BigInt((m[2]||'').padEnd(4,'0')):null;};
 const amounts=expenseItems.map(item=>scale(item.amount));
 const total=amounts.some(value=>value===null)?null:amounts.reduce((a,b)=>a+b,0n);
 return {expenseItems,amount:total===null?'':`${total/10000n}.${String(total%10000n).padStart(4,'0')}`.replace(/\.?0+$/,'')};
}
