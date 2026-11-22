// Display estimates use the same exact decimal rounding as the saved server copy.
export function tradeInvoiceAmounts(lines,currencyCode){
 const digits=currencyCode==='USD'?2:0,divisor=10n**BigInt(8-digits);
 const units=value=>{if(!/^\d{1,16}(?:\.\d{1,4})?$/.test(String(value)))return null;const [whole,fraction='']=String(value).split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));};
 const amounts=lines.map(line=>{const quantity=units(line.quantity),price=units(line.unitPrice);return !currencyCode||quantity===null||price===null?null:(quantity*price+divisor/2n)/divisor;});
 const format=amount=>amount===null?null:digits?`${amount/100n}.${String(amount%100n).padStart(2,'0')}`:String(amount);
 return {amounts:amounts.map(format),total:amounts.some(amount=>amount===null)?null:format(amounts.reduce((sum,amount)=>sum+amount,0n))};
}
