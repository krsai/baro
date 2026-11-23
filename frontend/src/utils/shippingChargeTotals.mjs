const units=value=>{const match=/^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));if(!match)throw new Error('INVALID_CHARGE_AMOUNT');return BigInt(match[1])*10000n+BigInt((match[2]||'').padEnd(4,'0'));};
const decimal=value=>`${value<0n?'-':''}${(value<0n?-value:value)/10000n}.${String((value<0n?-value:value)%10000n).padStart(4,'0')}`;
export function shippingChargeAmount(quantity,unitPrice){
 const count=units(quantity),price=units(unitPrice);
 if(count<=0n)throw new Error('INVALID_CHARGE_QUANTITY');
 return decimal((count*price+5000n)/10000n);
}
export function formatShippingCharge(value){
 const text=String(value??'');if(!/^-?\d+(?:\.\d{1,4})?$/.test(text))return '—';
 const [whole,fraction='']=text.split('.'),tail=fraction.replace(/0+$/,'');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(tail?'.'+tail:'');
}
export function shippingChargeTotals(rows){
 const totals=new Map();for(const row of rows){if(!['PURCHASE','SALES'].includes(row.direction))throw new Error('INVALID_CHARGE_DIRECTION');const total=totals.get(row.currencyCode)||{PURCHASE:0n,SALES:0n};total[row.direction]+=units(row.amount);totals.set(row.currencyCode,total);}
 return [...totals].map(([currencyCode,total])=>({currencyCode,purchase:decimal(total.PURCHASE),sales:decimal(total.SALES),difference:decimal(total.SALES-total.PURCHASE)}));
}
