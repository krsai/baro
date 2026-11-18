import React from 'react';
import {Box,Checkbox,MenuItem,Stack,Table,TableBody,TableCell,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_TEXT} from '../constants/expenseTypes';
export const MATERIAL_SETTINGS_TEXT={
 ko:{enabled:'자재 관리 대상',title:'규격 정보',field:'항목',input:'입력 설정',stock:'재고 구분',customer:'고객',type:'옵션',color:'색상',unit:'단위',dimensions:'치수 (L×W×H)'},
 en:{enabled:'Track as material',title:'Specifications',field:'Field',input:'Input setting',stock:'Separate stock',customer:'Customer',type:'Option',color:'Color',unit:'Unit',dimensions:'Dimensions (L×W×H)'},
 vi:{enabled:'Quản lý vật tư',title:'Quy cách',field:'Trường',input:'Thiết lập nhập',stock:'Tách tồn kho',customer:'Khách hàng',type:'Tùy chọn',color:'Màu sắc',unit:'Đơn vị',dimensions:'Kích thước (L×W×H)'},
};
export default function MaterialCodeSettings({value,onChange,languageCode,disabled=false,query='',filter='ALL',eligibilityControlled=false,systemDefaults=false}){
 const t=MATERIAL_SETTINGS_TEXT[languageCode]||MATERIAL_SETTINGS_TEXT.en,m=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 const settings=value.materialSettings||{enabled:false,stockFields:[],colorInput:'HIDDEN',unitInput:'REQUIRED'};
 const fields=settings.stockFields||[],mode=key=>key==='unit'?'REQUIRED':key==='color'?settings.colorInput||'HIDDEN':key==='dimensions'?(value.requiredFields||[]).includes('length')?'REQUIRED':'HIDDEN':value.attributeInputs?.[key]||'HIDDEN';
 const visibleFields=['type','color','unit','dimensions'].filter(key=>[t[key],key,t.title,t.enabled].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(filter==='ALL'||filter==='ACTIVE'&&mode(key)!=='HIDDEN'||filter==='REQUIRED'&&mode(key)==='REQUIRED'));
 const updateMode=(key,nextMode)=>{
  if(systemDefaults&&nextMode==='HIDDEN'&&fields.includes(key))return;
  const materialSettings={...settings,stockFields:!systemDefaults&&nextMode==='HIDDEN'?fields.filter(field=>field!==key):fields};
  if(key==='color')materialSettings.colorInput=nextMode;
  onChange({...value,materialSettings,...(['customer','type'].includes(key)?{attributeInputs:{...value.attributeInputs,[key]:nextMode}}:{}),...(key==='dimensions'?{requiredFields:[...(value.requiredFields||[]).filter(field=>!['length','width'].includes(field)),...(nextMode==='REQUIRED'?['length','width']:[])]}:{})});
 };
 if(!settings.enabled)return null;
 return <Box sx={{mb:2,border:1,borderColor:'divider',borderRadius:1,p:1.5}}>
  {settings.enabled&&<Stack spacing={1}>
   <Typography component="h3" variant="subtitle2">{t.title}</Typography>
   <Box sx={{overflowX:'auto'}}><Table size="small" aria-label={t.title} data-table-layout="columns"><TableHead><TableRow><TableCell>{t.field}</TableCell><TableCell>{t.input}</TableCell><TableCell>{t.stock}</TableCell></TableRow></TableHead>
    <TableBody>{visibleFields.map(key=><TableRow key={key}><TableCell>{t[key]}</TableCell><TableCell><TextField select fullWidth size="small" value={systemDefaults&&mode(key)==='OPTIONAL'?'':mode(key)} disabled={disabled||key==='unit'} SelectProps={{SelectDisplayProps:{'aria-label':`${t[key]} · ${t.input}`}}} onChange={event=>updateMode(key,event.target.value)}>
     {(key==='unit'?['REQUIRED']:systemDefaults||key==='dimensions'?['REQUIRED','HIDDEN']:['REQUIRED','OPTIONAL','HIDDEN']).map(option=><MenuItem key={option} value={option} disabled={systemDefaults&&option==='HIDDEN'&&fields.includes(key)}>{m[option]}</MenuItem>)}
    </TextField></TableCell><TableCell><Checkbox checked={fields.includes(key)} disabled={disabled||key==='unit'||mode(key)==='HIDDEN'} inputProps={{'aria-label':`${t[key]} · ${t.stock}`}} onChange={event=>onChange({...value,materialSettings:{...settings,stockFields:event.target.checked?[...new Set([...fields,key])]:fields.filter(field=>field!==key)}})}/></TableCell></TableRow>)}</TableBody>
   </Table></Box>
  </Stack>}
 </Box>;
}
