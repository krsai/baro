import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
export function formatLedgerMoney(value,currency){
  if(value==null)return '—';
  const text=String(value),negative=text.startsWith('-');
  const result=formatInvoiceMoney(negative?text.slice(1):text,currency);
  return negative&&result!=='—'?result.replace(`${currency} `,`${currency} -`):result;
}
export function formatLedgerAmount(value,currency){
 const formatted=formatLedgerMoney(value,currency);
 return formatted.startsWith(currency+' ')?formatted.slice(currency.length+1):formatted;
}
