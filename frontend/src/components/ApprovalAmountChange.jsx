import React from 'react';
import {Paper, Typography} from '@mui/material';
import {formatDecimalUnits, parseDecimalUnits} from '../utils/invoiceBilling.mjs';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {approvalReviewText} from '../constants/approvalReview';

function amountRows(detail, side) {
 const source=detail[side];
 if(detail.menu==='EXPENSE')return source?.document?.currencyTotals||[];
 const original=detail.before;
 const currency=original?.account?.currencyCode;
 const withPeer=(rows,row,peer)=>peer?.amount!=null&&peer.currencyCode
  ? [...rows,{...peer,direction:row.direction==='IN'?'OUT':'IN',currency:peer.currencyCode}] : rows;
 if(side==='before'){
  const entry=source?.entry;
  if(!entry)return [];
  return withPeer([entry,...(entry.bankFeeLinks||[]).map(link=>link.fee).filter(Boolean)].map(row=>({...row,currency:row.account?.currencyCode||currency})),entry,source.transfer);
 }
 return (source?.rows||[]).filter(row=>row.entryKind==='BANK').flatMap(row=>{
  const proposed=original?.proposedRows?.find(item=>item.clientKey&&item.clientKey===row.clientKey);
  const account=original?.proposedAccounts?.find(item=>item.accountId===row.accountId||item.masterId===row.accountId);
  return withPeer([{...row,currency:account?.currency||original?.proposedAccount?.currencyCode||currency}],row,{
   amount:proposed?.transferAmount??row.transferAmount,
   currencyCode:proposed?.transferCurrencyCode??row.transferCurrencyCode,
  });
 });
}

export default function ApprovalAmountChange({detail,languageCode}){
 if(!['EXPENSE','BANK_LEDGER'].includes(detail.menu)||!['UPDATE','DELETE'].includes(detail.operation))return null;
 const totals=new Map();
 for(const side of detail.operation==='DELETE'?['before']:['before','after']){
  for(const {currency,amount,direction} of amountRows(detail,side)){
   const units=parseDecimalUnits(amount,4);
   if(!currency||units===null)continue;
   const key=currency+':'+(direction||'');
   const total=totals.get(key)||{currency,direction,before:0n,after:0n};
   total[side]+=units;
   totals.set(key,total);
  }
 }
 if(!totals.size)return null;
 const t=approvalReviewText[languageCode]||approvalReviewText.en;
 const label={ko:'금액 변동',en:'Amount change',vi:'Thay đổi số tiền'}[languageCode]||'Amount change';
 const money=(units,currency)=>formatInvoiceMoney(formatDecimalUnits(units,4),currency);
 return <Paper variant="outlined" sx={{p:2}} data-testid="approval-amount-change">
  <Typography variant="subtitle2">{label}</Typography>
  {[...totals.values()].map(({currency,direction,before,after})=>{
   const delta=after-before;
   const sign=delta<0n?'−':delta>0n?'+':'';
   return <Typography key={currency+':'+direction} variant="body2">
    {direction&&t[direction]?t[direction]+' · ':''}{currency} · {money(before,currency)} → {money(after,currency)} ({sign}{money(delta<0n?-delta:delta,currency)})
   </Typography>;
  })}
 </Paper>;
}
