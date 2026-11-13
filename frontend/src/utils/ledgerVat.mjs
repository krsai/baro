export const ledgerVatEnabled=code=>(code?.taxTreatment?.suffix||String(code?.code||'').slice(-1))==='V';
export function splitLedgerGross(amount,rate,currency){
 const total=ledgerVatAmounts(amount,'0',currency),percent=/^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(String(rate??''));if(!total||!percent)return null;
 const precision=currency==='USD'?2:0,scale=precision?100n:1n;
 const units=BigInt(total.amount.replace('.','')),hundredths=BigInt(percent[1])*100n+BigInt((percent[2]||'').padEnd(2,'0'));
 if(hundredths>10000n)return null;
 const base=(units*10000n+(10000n+hundredths)/2n)/(10000n+hundredths),text=precision?`${base/scale}.${String(base%scale).padStart(2,'0')}`:String(base);
 const result=ledgerVatAmounts(text,rate,currency);return result?.amount===total.amount?result:null;
}
export function ledgerVatAmounts(subtotal,rate,currency){
 const precision=currency==='USD'?2:0;
 const base=/^(\d+)(?:\.(\d{0,4}))?$/.exec(String(subtotal??'')),tax=/^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(String(rate??''));
 if(!base||!tax||!currency||base[2]?.slice(precision).replace(/0/g,''))return null;
 const units=BigInt(base[1])*10n**BigInt(precision)+BigInt((base[2]||'').slice(0,precision).padEnd(precision,'0')||'0');
 const hundredths=BigInt(tax[1])*100n+BigInt((tax[2]||'').padEnd(2,'0'));
 if(hundredths>10000n)return null;
 const vat=(units*hundredths+5000n)/10000n;
 const format=value=>precision?`${value/100n}.${String(value%100n).padStart(2,'0')}`:String(value);
 return {subtotal:format(units),vatRate:String(rate),vatAmount:format(vat),amount:format(units+vat)};
}
export function updateLedgerVat(row,patch,code,currency,defaultRate){
 const next={...row,...patch},codeChanged='accountingCodeId' in patch&&patch.accountingCodeId!==row.accountingCodeId;
 if(row.entryKind&&row.entryKind!=='BANK')return next;
 if(['ADJUSTMENT','BANK_FEE'].includes(next.evidenceType)){
  const tax='amount' in patch&&row.subtotal!=null?ledgerVatAmounts(patch.amount,'0',currency):null;
  return {...next,...(tax||{})};
 }
 const editingTax='subtotal' in patch||'vatRate' in patch;
 if(codeChanged||editingTax){
  next.vatRate=ledgerVatEnabled(code)?patch.vatRate??(codeChanged?defaultRate:row.vatRate??defaultRate):'0';
  const preserveCash=!('subtotal' in patch)&&(row.taxInclusiveAmount||row.document&&row.subtotal==null);
  const linked=preserveCash?splitLedgerGross(row.amount,next.vatRate,currency):null;
  next.subtotal=patch.subtotal??(preserveCash?linked?.subtotal??'':row.subtotal??row.amount);
  if('subtotal' in patch)next.taxInclusiveAmount=false;
  const result=ledgerVatAmounts(next.subtotal,next.vatRate,currency);
  return {...next,...(result?{vatAmount:result.vatAmount,amount:result.amount}:{vatAmount:'',amount:preserveCash?row.amount:''})};
 }
 if('amount' in patch||'accountId' in patch&&patch.accountId!==row.accountId){delete next.subtotal;delete next.vatRate;delete next.vatAmount;}
 return next;
}
export function syncLedgerBankFees(rows,accounts){
 return rows.map(row=>{
  if(!row.feeForClientKey)return row;
  const parent=rows.find(parent=>parent.clientKey===row.feeForClientKey);if(!parent)return row;
  const oldCurrency=accounts.find(a=>a.id===row.accountId)?.currencyCode,newCurrency=accounts.find(a=>a.id===parent.accountId)?.currencyCode;
  return {...row,accountId:parent.accountId,transactionDate:parent.transactionDate,...(oldCurrency!==newCurrency?{amount:'',subtotal:undefined,vatRate:undefined,vatAmount:undefined}:{})};
 });
}
export const ledgerTaxPayload=row=>row.subtotal==null&&row.vatRate==null?{}:{subtotal:String(row.subtotal??'').replace(/\.$/,''),vatRate:String(row.vatRate??'').replace(/\.$/,''),vatAmount:row.vatAmount};
export function validLedgerTax(row,code,currency){
 if(row.subtotal==null&&row.vatRate==null&&row.vatAmount==null)return true;
 const expected=ledgerVatAmounts(row.subtotal,row.vatRate,currency),cash=ledgerVatAmounts(row.amount,'0',currency);
 return Boolean(expected&&cash&&BigInt(expected.subtotal.replace('.',''))>0n&&expected.amount===cash.amount&&(ledgerVatEnabled(code)||Number(row.vatRate)===0));
}
