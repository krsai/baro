import React from 'react';
import ExpenseLookupField from './ExpenseLookupField';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';

export default function AccountingCodeField({codes,value,onChange,languageCode,disabled,required=true}){
 const t=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <ExpenseLookupField directCode required={required} label={t.code} options={codes} value={codes.find(row=>row.id===value)||null} onChange={row=>onChange(row?.id||null)} languageCode={languageCode} disabled={disabled} columns={[
  {key:'code',label:t.code,value:row=>row.code},
  {key:'description',label:t.description,value:row=>accountingCodeDescription(row,languageCode)},
 ]}/>;
}
