import {accountingDirectionText,matchesAccountingDirection} from '../constants/accountingDirection';
import React from 'react';
import {Stack,Typography} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';

export default function AccountingCodeField({codes,value,onChange,languageCode,disabled,required=true,onSelect,valueObject,hideLabel=false,direction='OUT'}){
 const selected=valueObject||codes.find(row=>row.id===value)||null,invalid=selected&&!matchesAccountingDirection(selected,direction);
 const t=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <Stack spacing={.5}><ExpenseLookupField directCode hideLabel={hideLabel} required={required} label={t.code} options={codes} value={valueObject||codes.find(row=>row.id===value)||null} onChange={row=>onSelect?onSelect(row):onChange(row?.id||null)} languageCode={languageCode} disabled={disabled} columns={[
  {key:'code',label:t.code,value:row=>row.code},
  {key:'description',label:t.description,value:row=>accountingCodeDescription(row,languageCode)},
 ]}/>{invalid&&<Typography role="status" variant="caption" color="warning.main">{(accountingDirectionText[languageCode]||accountingDirectionText.en).mismatch}</Typography>}</Stack>;
}
