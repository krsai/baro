import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
export function formatLedgerMoney(value,currency){
  if(value==null)return '—';
  return formatInvoiceMoney(value,currency);
}
export function formatLedgerAmount(value,currency){
 return formatLedgerMoney(value,currency);
}
