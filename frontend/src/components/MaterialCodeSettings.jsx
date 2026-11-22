import React from 'react';
import {Box,Checkbox,FormControlLabel} from '@mui/material';
import {materialItemText} from '../constants/materialItems';
export const MATERIAL_SETTINGS_TEXT={
 ko:{enabled:'자재로 활용',title:'자재 품목·재고 항목',field:'항목',input:'입력 설정',customer:'고객',owner:'소유자',type:'타입',color:'재고 색상',unit:materialItemText.ko.unit,dimensions:'치수 (L×W×H)'},
 en:{enabled:'Use as material',title:'Material item and stock fields',field:'Field',input:'Input setting',customer:'Customer',owner:'Owner',type:'Type',color:'Stock color',unit:materialItemText.en.unit,dimensions:'Dimensions (L×W×H)'},
 vi:{enabled:'Sử dụng làm vật tư',title:'Trường mặt hàng và tồn kho',field:'Trường',input:'Thiết lập nhập',customer:'Khách hàng',owner:'Chủ sở hữu',type:'Loại',color:'Màu tồn kho',unit:materialItemText.vi.unit,dimensions:'Kích thước (L×W×H)'},
};
export function masterInputModes(value){
 const m=value.materialSettings||{};
 const {customer,...inputs}=m.masterInputs||Object.fromEntries(['owner','customer','type','color','dimensions'].map(key=>[key,key==='color'?m.colorInput&&m.colorInput!=='HIDDEN'?'REQUIRED':'HIDDEN':key==='dimensions'?(value.requiredFields||[]).includes('length')?'REQUIRED':'HIDDEN':value.attributeInputs?.[key]&&value.attributeInputs[key]!=='HIDDEN'?'REQUIRED':'HIDDEN']));
 const {dimensions,...visible}=inputs;
 return {...visible,owner:'REQUIRED'};
}
export default function MaterialCodeSettings({value,onChange,languageCode,disabled=false,query='',filter='ALL'}){
 const t=MATERIAL_SETTINGS_TEXT[languageCode]||MATERIAL_SETTINGS_TEXT.en,modes=masterInputModes(value);
 if(!value.materialSettings?.enabled)return null;
 return <Box>{['owner','unit','type','color'].filter(key=>[t[key],key].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(filter!=='ACTIVE'||key==='unit'||modes[key]==='REQUIRED')).map(key=><FormControlLabel key={key} sx={{m:0,display:'flex',px:1,py:.25,minHeight:40,bgcolor:key==='unit'||modes[key]==='REQUIRED'?'action.selected':undefined}} control={<Checkbox size="small" checked={key==='unit'||modes[key]==='REQUIRED'} disabled={disabled||key==='unit'||key==='owner'} onChange={event=>onChange({...value,materialSettings:{...value.materialSettings,masterInputs:{...value.materialSettings?.masterInputs,...modes,[key]:event.target.checked?'REQUIRED':'HIDDEN'}}})}/>} label={t[key]}/>)}</Box>;
}
