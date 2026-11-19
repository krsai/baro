import React from 'react';
import {Box,Checkbox,FormControlLabel} from '@mui/material';
export const MATERIAL_SETTINGS_TEXT={
 ko:{enabled:'자재 관리 대상',title:'자재 마스터',field:'항목',input:'입력 설정',customer:'고객',owner:'자재 소유자',type:'세부 규격',color:'색상',unit:'단위',dimensions:'치수 (L×W×H)'},
 en:{enabled:'Track as material',title:'Material master',field:'Field',input:'Input setting',customer:'Customer',owner:'Material owner',type:'Specification detail',color:'Color',unit:'Unit',dimensions:'Dimensions (L×W×H)'},
 vi:{enabled:'Quản lý vật tư',title:'Danh mục vật tư',field:'Trường',input:'Thiết lập nhập',customer:'Khách hàng',owner:'Chủ sở hữu vật tư',type:'Chi tiết quy cách',color:'Màu sắc',unit:'Đơn vị',dimensions:'Kích thước (L×W×H)'},
};
export function masterInputModes(value){
 const m=value.materialSettings||{};
 const {customer,...inputs}=m.masterInputs||Object.fromEntries(['owner','customer','type','color','dimensions'].map(key=>[key,key==='color'?m.colorInput&&m.colorInput!=='HIDDEN'?'REQUIRED':'HIDDEN':key==='dimensions'?(value.requiredFields||[]).includes('length')?'REQUIRED':'HIDDEN':value.attributeInputs?.[key]&&value.attributeInputs[key]!=='HIDDEN'?'REQUIRED':'HIDDEN']));
 return inputs;
}
export default function MaterialCodeSettings({value,onChange,languageCode,disabled=false,query='',filter='ALL'}){
 const t=MATERIAL_SETTINGS_TEXT[languageCode]||MATERIAL_SETTINGS_TEXT.en,modes=masterInputModes(value);
 if(!value.materialSettings?.enabled)return null;
 return <Box>{['owner','type','color','dimensions','unit'].filter(key=>[t[key],key].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(filter!=='ACTIVE'||key==='unit'||modes[key]==='REQUIRED')).map(key=><FormControlLabel key={key} sx={{m:0,display:'flex',px:1,py:.25,minHeight:40,bgcolor:key==='unit'||modes[key]==='REQUIRED'?'action.selected':undefined}} control={<Checkbox size="small" checked={key==='unit'||modes[key]==='REQUIRED'} disabled={disabled||key==='unit'} onChange={event=>onChange({...value,materialSettings:{...value.materialSettings,masterInputs:{...modes,[key]:event.target.checked?'REQUIRED':'HIDDEN'}}})}/>} label={t[key]}/>)}</Box>;
}
