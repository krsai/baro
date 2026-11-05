import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import AccountingCodeField from './AccountingCodeField';
import DecimalAmountField from './DecimalAmountField';
import DeleteActionButton from './DeleteActionButton';
import {useAppActions} from '../context/AppContext';
import {ledgerEntryText} from '../constants/ledgerEntry';
export default function LedgerBankFees({parent,rows,codes,currencyCode,languageCode,locked,edit,mutate,errorRow,errorMessage}){
 const t=ledgerEntryText[languageCode]||ledgerEntryText.en,{showNotification}=useAppActions();
 const fees=rows.filter(row=>row.parentClientKey===parent.clientKey&&row.entryKind==='FEE');
 const change=(fee,patch)=>{
  if(fee){edit(fee.clientKey,patch);return;}
  if(rows.length>=50){showNotification?.(t.limit,'warning');return;}
  mutate(current=>{const existing=current.find(row=>row.parentClientKey===parent.clientKey&&row.entryKind==='FEE');if(existing)return current.map(row=>row===existing?{...row,...patch}:row);if(current.length>=50)return current;const index=current.findLastIndex(row=>row.clientKey===parent.clientKey||row.parentClientKey===parent.clientKey);return [...current.slice(0,index+1),{clientKey:crypto.randomUUID(),parentClientKey:parent.clientKey,entryKind:'FEE',amount:'',purpose:'',accountingCodeId:'',...patch},...current.slice(index+1)];});
 };
 return <Box data-testid="ledger-bank-fees"><Typography variant="subtitle2" sx={{mb:1}}>{t.bankFeeLabel}</Typography><Stack spacing={1}>{(fees.length?fees:[null]).map(fee=><Box key={fee?.clientKey||'new'} data-ledger-entry-row={fee?rows.indexOf(fee):undefined} data-entry-kind="FEE" data-row-error={fee&&errorRow===fee.clientKey?'true':undefined} sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'180px 180px 32px'},gap:1,alignItems:'center'}}><DecimalAmountField size="small" currencyCode={currencyCode} label={t.bankFeeLabel} value={fee?.amount||''} disabled={locked||!parent.document} inputProps={{'aria-label':t.bankFeeLabel,style:{textAlign:'right'},maxLength:33}} onValueChange={amount=>change(fee,{amount})}/><AccountingCodeField direction="OUT" codes={codes} value={fee?.accountingCodeId||''} languageCode={languageCode} disabled={locked||!parent.document} onChange={accountingCodeId=>change(fee,{accountingCodeId:accountingCodeId||''})}/>{fee&&<DeleteActionButton disabled={locked} title={t.removeFeeLabel} aria-label={t.removeFeeLabel} onClick={()=>mutate(current=>current.filter(row=>row.clientKey!==fee.clientKey))}/>} {fee&&errorRow===fee.clientKey&&errorMessage&&<Typography role="alert" color="error" sx={{gridColumn:'1 / -1'}}>{errorMessage}</Typography>}</Box>)}</Stack></Box>;
}
