import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
export function formatLedgerMoney(value,currency){
  if(value==null)return '—';
  const text=String(value),negative=text.startsWith('-');
  const result=formatInvoiceMoney(negative?text.slice(1):text,currency);
  return negative&&result!=='—'?result.replace(`${currency} `,`${currency} -`):result;
}
