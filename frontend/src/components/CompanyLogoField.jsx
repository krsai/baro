import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import AppNotice from './AppNotice';

export const companyLogoText={
 ko:{title:'회사 로고',choose:'로고 선택',remove:'로고 제거',invalid:'PNG/JPEG 로고를 200KB 이하로 선택하세요.',manage:'사업체 로고 관리',apply:'회사 로고 적용',missing:'사업체에 등록된 로고가 없습니다.'},
 en:{title:'Company Logo',choose:'Choose Logo',remove:'Remove Logo',invalid:'Choose A PNG/JPEG Logo Up To 200KB.',manage:'Manage Company Logo',apply:'Apply Company Logo',missing:'No Logo Is Registered For This Company.'},
 vi:{title:'Logo Công Ty',choose:'Chọn Logo',remove:'Xóa Logo',invalid:'Chọn Logo PNG/JPEG Không Quá 200KB.',manage:'Quản Lý Logo Công Ty',apply:'Áp Dụng Logo Công Ty',missing:'Công Ty Chưa Đăng Ký Logo.'},
};
export default function CompanyLogoField({value='',onChange,disabled,languageCode,onBusyChange}){
 const t=companyLogoText[languageCode]||companyLogoText.en,input=useRef(null),live=useRef(true);
 const [error,setError]=useState(false),[reading,setReading]=useState(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;onBusyChange?.(false);};},[onBusyChange]);
 const choose=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file||disabled||reading)return;
  if(!['image/png','image/jpeg'].includes(file.type)||!file.size||file.size>200000){setError(true);return;}
  setReading(true);onBusyChange?.(true);setError(false);
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(live.current)onChange(data);}catch{if(live.current)setError(true);}
  finally{if(live.current){setReading(false);onBusyChange?.(false);}}
 };
 return <Stack spacing={1} data-company-logo>
  <Typography variant="subtitle2">{t.title}</Typography>
  {value&&<Box component="img" src={value} alt={t.title} sx={{maxWidth:'100%',width:240,height:80,objectFit:'contain',alignSelf:'flex-start'}}/>}
  <Stack direction="row" spacing={1}><input ref={input} hidden type="file" accept="image/png,image/jpeg" onChange={choose}/><Button variant="outlined" disabled={disabled||reading} onClick={()=>input.current.click()}>{t.choose}</Button>{value&&<Button disabled={disabled||reading} onClick={()=>onChange('')}>{t.remove}</Button>}</Stack>
  {error&&<AppNotice severity="error">{t.invalid}</AppNotice>}
 </Stack>;
}
