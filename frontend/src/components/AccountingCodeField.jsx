import {accountingDirectionText,permitsAccountingDirection} from '../constants/accountingDirection';
import React from 'react';
import ExpenseLookupField from './ExpenseLookupField';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';

export default function AccountingCodeField({codes,value,onChange,languageCode,disabled,required=true,onSelect,valueObject,hideLabel=false,direction='OUT'}){
 const selected=valueObject||codes.find(row=>row.id===value)||null,invalid=selected&&!permitsAccountingDirection(selected,direction);
 const t=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <ExpenseLookupField error={Boolean(invalid)} helperText={invalid?(accountingDirectionText[languageCode]||accountingDirectionText.en).mismatch:undefined} directCode hideLabel={hideLabel} required={required} label={t.code} options={codes.filter(code=>permitsAccountingDirection(code,direction))} value={valueObject||codes.find(row=>row.id===value)||null} onChange={row=>onSelect?onSelect(row):onChange(row?.id||null)} languageCode={languageCode} disabled={disabled} columns={[
  {key:'code',label:t.code,value:row=>row.code},
  {key:'description',label:t.description,value:row=>accountingCodeDescription(row,languageCode)},
 ]}/>;
}
