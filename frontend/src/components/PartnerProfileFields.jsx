import { LOCALIZED_NAME_HELP } from './LocalizedNameFields';
import React from 'react';
import {Box,MenuItem,Stack,TextField,Typography} from '@mui/material';
import EntityDetailSection from './EntityDetailSection';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {getStaticOptionOptions} from '../constants/staticOptionRegistry';

export const PARTNER_PROFILE_TEXT={
 ko:{name:'업체명 (영어 · 기본)',nameKo:'업체명 (한국어 · 선택)',nameVi:'업체명 (베트남어 · 선택)',code:'업체 코드 (선택)',contact:'담당자 이름',help:'업체명은 회사·사업체의 이름입니다. 영어 이름은 기본으로 사용하며, 한국어·베트남어 이름이 없으면 영어 이름을 표시합니다.',codeHelp:'영문·숫자·하이픈·밑줄·마침표, 최대 40자',phone:'전화번호'},
 en:{name:'Company name (English · default)',nameKo:'Company name (Korean · optional)',nameVi:'Company name (Vietnamese · optional)',code:'Company code (optional)',contact:'Contact person name',help:'Enter the company or business name. English is the default when a Korean or Vietnamese name is not provided.',codeHelp:'Letters, numbers, hyphens, underscores or dots; up to 40 characters',phone:'Phone number'},
 vi:{name:'Tên công ty (tiếng Anh · mặc định)',nameKo:'Tên công ty (tiếng Hàn · tùy chọn)',nameVi:'Tên công ty (tiếng Việt · tùy chọn)',code:'Mã công ty (tùy chọn)',contact:'Tên người liên hệ',help:'Nhập tên công ty hoặc cơ sở kinh doanh. Nếu chưa có tên tiếng Hàn hoặc tiếng Việt, hệ thống hiển thị tên tiếng Anh.',codeHelp:'Chữ cái, chữ số, dấu gạch ngang, gạch dưới hoặc dấu chấm; tối đa 40 ký tự',phone:'Số điện thoại'},
};

// Canonical profile fields shared by customer relationships and supplier entities.
export default function PartnerProfileFields({value,onChange,disabled=false,languageCode='ko',autoFocus=false}){
 const text=PARTNER_PROFILE_TEXT[languageCode]||PARTNER_PROFILE_TEXT.en,common=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en;
 const field=(name,label,props={})=><TextField fullWidth size="small" disabled={disabled} name={name} label={label} value={value[name]||''} onChange={event=>onChange(name,event.target.value)} {...props}/>;
 const grid={display:'grid',gap:2,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))',md:'repeat(3,minmax(0,1fr))'}};
 return <Stack spacing={2}>
  <EntityDetailSection title={common.identity}>
   <Typography variant="body2" color="text.secondary" sx={{mb:2}}>{LOCALIZED_NAME_HELP[languageCode] || LOCALIZED_NAME_HELP.en}</Typography>
   <Box sx={grid}>
    {field('name',text.name,{autoFocus})}{field('nameKo',text.nameKo)}{field('nameVi',text.nameVi)}
    {field('code',text.code,{helperText:text.codeHelp,inputProps:{maxLength:40}})}{field('businessNumber',common.businessNumber)}
   </Box>
  </EntityDetailSection>
  <EntityDetailSection title={common.contact}><Box sx={{...grid,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'}}}>
   {field('contactName',text.contact)}{field('email',common.email,{type:'email'})}
   {field('countryCode',common.countryCode)}{field('contactPhone',text.phone,{type:'tel'})}
  </Box></EntityDetailSection>
  <EntityDetailSection title={common.address}><Box sx={{...grid,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'180px minmax(0,1fr)'}}}>
   {field('country',common.country,{select:true,children:[<MenuItem key="empty" value="">—</MenuItem>,...getStaticOptionOptions('country',languageCode).map(row=><MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)]})}
   {field('address',common.address,{multiline:true,minRows:2})}
  </Box></EntityDetailSection>
 </Stack>;
}
