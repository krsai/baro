import GlobalNotice from "./AppNotice";
import {accountingDirectionText,matchesAccountingDirection} from '../constants/accountingDirection';
import React from 'react';
import {Stack} from "@mui/material";
import ExpenseLookupField from './ExpenseLookupField';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import {accountingCodeDescription,accountingCodeSearchValues} from '../utils/accountingCode.mjs';

export default function AccountingCodeField({codes,value,onChange,languageCode,disabled,required=true,onSelect,valueObject,hideLabel=false,showSearchIcon=true,direction='OUT',transactionRole,requireMaterialSelection=false,resetKey}){
 const selected=valueObject||codes.find(row=>row.id===value)||null,invalid=selected&&transactionRole!=='CUSTOMER'&&!matchesAccountingDirection(selected,direction);
 const t=ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en;
 return <Stack spacing={.5} sx={{width:'100%',minWidth:0}}><ExpenseLookupField getSearchValues={accountingCodeSearchValues} resetKey={resetKey} onCommit={row=>{const current=codes.find(code=>code.id===row?.id)||row;if(requireMaterialSelection&&onSelect&&row?.id===selected?.id&&current?.base?.materialSettings?.enabled){onSelect(current);return true;}return false;}} showSearchIcon={showSearchIcon} directCode hideLabel={hideLabel} required={required} label={t.code} options={codes} value={valueObject||codes.find(row=>row.id===value)||null} onChange={row=>onSelect?onSelect(row):onChange(row?.id||null)} languageCode={languageCode} disabled={disabled} columns={[
  {key:'code',label:t.code,value:row=>row.code},
  {key:'description',label:t.description,value:row=>accountingCodeDescription(row,languageCode)},
 ]}/>{invalid&&<GlobalNotice severity="warning">{(accountingDirectionText[languageCode]||accountingDirectionText.en).mismatch}</GlobalNotice>}</Stack>;
}
