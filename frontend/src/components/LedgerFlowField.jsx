import React from 'react';
import {Typography} from '@mui/material';
import ReadOnlyField from './ReadOnlyField';
import ExpenseLookupField from './ExpenseLookupField';
import {ledgerFlowText} from '../constants/ledgerFlow';
import {changeApprovalText} from '../constants/changeApprovals';
import {ledgerFlowEndpoints,selectLedgerFlowEndpoint} from '../utils/ledgerFlow.mjs';
import {classificationName,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';
export default function LedgerFlowField({side,row,account,accounts=[],options,languageCode,disabled,onChange,showSearchIcon=true}){
 const t=ledgerFlowText[languageCode]||ledgerFlowText.en,c=changeApprovalText[languageCode]||changeApprovalText.en;
 if(row.evidenceType==='BANK_FEE'&&row.feeForClientKey)return side==='from'?<ReadOnlyField hideLabel label={t.ownAccount} value={account?.displayName||account?.bankName||''}/>:<Typography variant="body2">{'\u2014'}</Typography>;
 if(['ADJUSTMENT','BANK_FEE'].includes(row.evidenceType))return side!==(row.direction==='OUT'?'from':'to')?<Typography variant="body2">—</Typography>:<ExpenseLookupField showSearchIcon={showSearchIcon} hideLabel required label={t.ownAccount} languageCode={languageCode} options={accounts} value={account||null} disabled={disabled} getOptionLabel={a=>a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / ')} columns={[{key:'name',label:t.ownAccount,value:a=>a.displayName||a.bankName}]} onChange={a=>onChange({accountId:a?.id||'',...(account?.currencyCode!==a?.currencyCode?{amount:''}:{})})}/>;
 const flow=ledgerFlowEndpoints(row,account),opposite=flow[side==='from'?'to':'from'];
 const own=accounts.map(a=>({kind:'ACCOUNT',id:a.entityAccountId||String(a.id).replace(/^entity:/,''),code:a.accountNumber||'',name:a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / '),currencyCode:a.currencyCode}));
 const choices=[...own,...options.filter(p=>p.kind!=='ACCOUNT')].filter(p=>!opposite||!(p.kind===opposite.kind&&p.id===opposite.id)&&(opposite.kind==='ACCOUNT'||p.kind==='ACCOUNT'));
 const value=flow[side],current=choices.find(p=>p.kind===value?.kind&&p.id===value?.id&&(!value?.currencyCode||p.kind!=='ACCOUNT'||p.currencyCode===value.currencyCode))||value;
 const name=p=>p?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||p?.name||'';
 const labels=PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en;
 const industries=p=>(p.linkedCompany?.subscriberOrgId&&p.officialClassification?.industryIds?.length?p.officialClassification:p.classification)?.industries||[];
 const category=p=>p.kind==='PARTNER'?[...new Set(industries(p).map(i=>classificationName(i.partnerRole,languageCode)).filter(Boolean))].join(' · '):p.kind==='ACCOUNT'?t.ownAccount:c[p.kind];
 const industry=p=>p.kind==='PARTNER'?industries(p).map(i=>classificationName(i,languageCode)).filter(Boolean).join(' · '):'';
 return <ExpenseLookupField showSearchIcon={showSearchIcon} hideLabel required label={t[side]} languageCode={languageCode} options={choices} value={current} disabled={disabled} getOptionKey={p=>p.kind+':'+p.id+(p.kind==='ACCOUNT'?':'+p.currencyCode:'')} getOptionLabel={p=>p.kind==='ACCOUNT'?name(p):[p.code||p.employeeNo,name(p)].filter(Boolean).join(' / ')} getCode={p=>p.code||p.employeeNo||name(p)} columns={[{key:'code',label:{ko:'\uCF54\uB4DC',en:'Code',vi:'M\u00e3'}[languageCode]||'Code',value:p=>p.code||p.employeeNo},{key:'name',label:c.party,value:name},{key:'category',label:labels.category,value:category},{key:'industry',label:labels.industry,value:industry},{key:'currency',label:'',value:p=>p.currencyCode}]} onChange={value=>{const patch=selectLedgerFlowEndpoint(row,accounts,side,value?{kind:value.kind,id:value.id,name:name(value),code:value.code||value.employeeNo||'',...(value.kind==='ACCOUNT'?{currencyCode:value.currencyCode}:{})}:null);if(patch)onChange(patch);}}/>;
}
