const units=value=>{const match=/^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));if(!match)throw new Error('INVALID_CHARGE_AMOUNT');return BigInt(match[1])*10000n+BigInt((match[2]||'').padEnd(4,'0'));};
const decimal=value=>`${value<0n?'-':''}${(value<0n?-value:value)/10000n}.${String((value<0n?-value:value)%10000n).padStart(4,'0')}`;
export function shippingChargeTotals(rows){
 const totals=new Map();for(const row of rows){if(!['PURCHASE','SALES'].includes(row.direction))throw new Error('INVALID_CHARGE_DIRECTION');const total=totals.get(row.currencyCode)||{PURCHASE:0n,SALES:0n};total[row.direction]+=units(row.amount);totals.set(row.currencyCode,total);}
 return [...totals].map(([currencyCode,total])=>({currencyCode,purchase:decimal(total.PURCHASE),sales:decimal(total.SALES),difference:decimal(total.SALES-total.PURCHASE)}));
}
