import CompanyNameField from './CompanyNameField';
import EntityPhoneField from './EntityPhoneField';
import { phoneForCountry, countryCallingCode } from '../utils/entityPhone.mjs';

import React from 'react';
import {Box,Button,MenuItem,Stack,TextField} from "@mui/material";
import EntityDetailSection from './EntityDetailSection';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {ENTITY_CODE_TEXT} from '../utils/entityCode.mjs';
import {PARTY_KIND_TEXT} from '../constants/partyKind';
import {getStaticOptionOptions} from '../constants/staticOptionRegistry';
import {partnerContactText,companyDocumentContactText} from '../constants/companyDocumentContact';

export const PARTNER_PROFILE_TEXT={
 ko:{name:'업체명 (영어 · 기본)',nameKo:'업체명 (한국어 · 선택)',nameVi:'업체명 (베트남어 · 선택)',code:'업체 코드 (선택)',contact:'담당자 이름',help:'업체명은 회사·사업체의 이름입니다. 영어 이름은 기본으로 사용하며, 한국어·베트남어 이름이 없으면 영어 이름을 표시합니다.',codeHelp:'영문·숫자·하이픈·밑줄·마침표, 최대 40자',phone:'전화번호'},
 en:{name:'Company name (English · default)',nameKo:'Company name (Korean · optional)',nameVi:'Company name (Vietnamese · optional)',code:'Company code (optional)',contact:'Contact person name',help:'Enter the company or business name. English is the default when a Korean or Vietnamese name is not provided.',codeHelp:'Letters, numbers, hyphens, underscores or dots; up to 40 characters',phone:'Phone number'},
 vi:{name:'Tên công ty (tiếng Anh · mặc định)',nameKo:'Tên công ty (tiếng Hàn · tùy chọn)',nameVi:'Tên công ty (tiếng Việt · tùy chọn)',code:'Mã công ty (tùy chọn)',contact:'Tên người liên hệ',help:'Nhập tên công ty hoặc cơ sở kinh doanh. Nếu chưa có tên tiếng Hàn hoặc tiếng Việt, hệ thống hiển thị tên tiếng Anh.',codeHelp:'Chữ cái, chữ số, dấu gạch ngang, gạch dưới hoặc dấu chấm; tối đa 40 ký tự',phone:'Số điện thoại'},
};

// Canonical profile fields shared by customer relationships and supplier entities.
export default function PartnerProfileFields({value,onChange,disabled=false,languageCode='ko',autoFocus=false,hideGuidance=false,fieldLocks=[],onUseDefaults,onUseLocal,defaultSourceKind='SELF',documentDefaults=false}){
 const text=PARTNER_PROFILE_TEXT[languageCode]||PARTNER_PROFILE_TEXT.en,common=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en;
 const party=PARTY_KIND_TEXT[languageCode]||PARTY_KIND_TEXT.en;
 const officialContact=companyDocumentContactText[languageCode]||companyDocumentContactText.en;
 const contact=documentDefaults?{...officialContact,contactName:officialContact.representative}:partnerContactText[languageCode]||partnerContactText.en;
 const subscriber=Boolean(value.linkedCompany?.subscriberOrgId);
 const officialNames=['name','nameKo','nameVi','country','businessNumber',...(subscriber?['countryCode',...(value.linkedCompany.partyKind?['partyKind']:[])]:[])];
 const resolved=name=>{if(!value.linkedCompany||!officialNames.includes(name))return value[name]||'';return value.linkedCompany[{contactName:'representative',contactPhone:'phone'}[name]||name]||'';};
 const field=(name,label,props={})=>{const readOnly=Boolean(fieldLocks.includes(name)||value.linkedCompany&&officialNames.includes(name));const Field=['name','nameKo','nameVi'].includes(name)?CompanyNameField:TextField;return <Field fullWidth size="small" name={name} label={label} value={resolved(name)} {...props} disabled={disabled||Boolean(props.select&&readOnly)} InputProps={{...props.InputProps,readOnly}} SelectProps={props.select?{...props.SelectProps,readOnly}:undefined} onChange={event=>{if(readOnly)return;onChange(name,event.target.value);if(name==='country'){onChange('countryCode',countryCallingCode(event.target.value));if(!fieldLocks.includes('contactPhone'))onChange('contactPhone',phoneForCountry(resolved('contactPhone'),resolved('country'),event.target.value));}}}/>;};
 const grid={display:'grid',gap:2,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',md:'repeat(4,minmax(0,1fr))'}};
 return <Stack spacing={2}>
  <EntityDetailSection title={common.identity}>
   <Box sx={grid}>
   {field('country',common.country,{select:true,children:[<MenuItem key="empty" value="">—</MenuItem>,...getStaticOptionOptions('country',languageCode).map(row=><MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)]})}
    {field('partyKind',party.label,{select:true,InputLabelProps:{shrink:true},SelectProps:{displayEmpty:true,renderValue:kind=>party[kind]||party.legacy},children:['INDIVIDUAL','CORPORATE'].map(kind=><MenuItem key={kind} value={kind}>{party[kind]}</MenuItem>)})}
    {field('businessNumber',common.businessNumber,{required:value.partyKind==='CORPORATE'})}
    {value.linkedCompany?<TextField fullWidth size="small" label={party.codeLabel} value={value.linkedCompany.code||''} InputProps={{readOnly:true}}/>:field('code',value.partyKind==='CORPORATE'?party.codeLabel:text.code,{required:value.partyKind==='CORPORATE',helperText:hideGuidance?undefined:value.partyKind==='INDIVIDUAL'?party.codeHelp:value.partyKind==='CORPORATE'?party.corporateCodeHelp:(ENTITY_CODE_TEXT[languageCode]||ENTITY_CODE_TEXT.en).help,inputProps:{maxLength:value.partyKind==='CORPORATE'?4:40}})}
    <Box sx={{gridColumn:'1 / -1',display:'grid',gap:2,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'repeat(3,minmax(0,1fr))'}}}>{field('name',text.name,{autoFocus})}{field('nameKo',text.nameKo)}{field('nameVi',text.nameVi)}</Box>
   </Box>
  </EntityDetailSection>
  <EntityDetailSection title={contact.title} actions={onUseDefaults?<Button size="small" disabled={disabled} onClick={value.contactMode==='DEFAULT'&&onUseLocal?onUseLocal:onUseDefaults}>{value.contactMode==='DEFAULT'&&onUseLocal?contact.local:defaultSourceKind==='REGISTRATION'?contact.registration:contact.defaults}</Button>:null}><Box sx={{...grid,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',md:'repeat(3,minmax(0,1fr))'}}}>
   {field('contactName',contact.contactName,{inputProps:{maxLength:200}})}{field('email',contact.email,{type:'email',inputProps:{maxLength:254}})}
   <EntityPhoneField name="contactPhone" label={contact.phone} country={resolved('country')} value={resolved('contactPhone')} disabled={disabled} InputProps={{readOnly:fieldLocks.includes('contactPhone')}} inputProps={{maxLength:100}} onChange={event=>{if(!fieldLocks.includes('contactPhone'))onChange('contactPhone',event.target.value);}}/>
   <Box sx={{gridColumn:'1 / -1'}}>{field('address',contact.address,{inputProps:{maxLength:1000}})}</Box>
  </Box></EntityDetailSection>
 </Stack>;
}
