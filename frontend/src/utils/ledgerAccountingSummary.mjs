import {accountingSummary} from './accountingSummary.mjs';
import {accountingCodeDescription} from './accountingCode.mjs';

const paidAmount=value=>{
 const match=/^(\d+)(?:\.(\d{0,4}))?$/.exec(String(value??''));
 return match?BigInt(match[1])*10000n+BigInt((match[2]||'').padEnd(4,'0')):-1n;
};

export function ledgerAccountingSummary(row,language='ko'){
 const items=(row.allocations||[]).filter(a=>a.expenseItemId||a.expenseItem).map((allocation,index)=>({allocation,index})).sort((a,b)=>{
  const first=paidAmount(a.allocation.amount),second=paidAmount(b.allocation.amount);
  return first===second?(a.allocation.expenseItem?.expenseRequestLine??a.index)-(b.allocation.expenseItem?.expenseRequestLine??b.index):first>second?-1:1;
 }).map(({allocation})=>allocation.expenseItem);
 const codes=items.length?items.map(item=>item?.transactionCode?.code||'—'):[row.accountingCode?.code||'—'];
 const descriptions=items.length?items.map(item=>accountingCodeDescription(item?.transactionCode,language)||item?.description||'—'):[accountingCodeDescription(row.accountingCode,language)||'—'];
 return {code:accountingSummary(codes,language),description:accountingSummary(descriptions,language),codeTitle:codes.join('\n'),descriptionTitle:descriptions.join('\n')};
}
