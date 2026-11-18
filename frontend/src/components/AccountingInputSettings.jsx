import React,{useState} from 'react';
import {ITEM_ATTRIBUTE_TEXT} from '../constants/itemAttributes';
import {Box,MenuItem,Stack,Table,TableBody,TableCell,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_TEXT} from '../constants/expenseTypes';
import MaterialCodeSettings from './MaterialCodeSettings';
const GROUP_TEXT={ko:['소유 정보','규격 정보','생산 연결','운송 정보','표시 항목','전체','사용 중','필수','조건에 맞는 항목이 없습니다.'],en:['Ownership','Specifications','Production links','Transport information','Show fields','All','Enabled','Required','No matching fields.'],vi:['Thông tin sở hữu','Quy cách','Liên kết sản xuất','Thông tin vận chuyển','Hiển thị trường','Tất cả','Đang dùng','Bắt buộc','Không có trường phù hợp.']};
const ATTRIBUTES=['owner','customer','type'],PRODUCTION=['order','style','process'];
export default function AccountingInputSettings({value,onChange,languageCode,disabled=false,productionEnabled=true,compact=false,autoFocus=false}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en,a=ITEM_ATTRIBUTE_TEXT[languageCode]||ITEM_ATTRIBUTE_TEXT.en,l=GROUP_TEXT[languageCode]||GROUP_TEXT.en;
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('ALL');
 const material=value.materialSettings?.enabled===true;
 const groups=[{title:l[0],keys:['owner']},{title:({ko:'거래 연결 정보',en:'Business links',vi:'Liên kết giao dịch'})[languageCode]||'Business links',keys:value.attributeInputs?.customer&&value.attributeInputs.customer!=='HIDDEN'?['customer']:[]},{title:l[1],keys:material?[]:['type','dimensions'],material},{title:l[2],keys:productionEnabled?PRODUCTION:[]},{title:l[3],keys:['transportDate','origin','destination']}];
 const modeFor=key=>ATTRIBUTES.includes(key)?value.attributeInputs?.[key]||'HIDDEN':PRODUCTION.includes(key)?value[key+'Input']||'HIDDEN':(value.requiredFields||[]).includes(key==='dimensions'?'length':key)?'REQUIRED':'HIDDEN';
 const labelFor=key=>ATTRIBUTES.includes(key)?a[key]:t[key];
 const productionModeAllowed=(key,mode)=>{
  if(!PRODUCTION.includes(key)||mode===modeFor(key))return true;
  const rank={HIDDEN:0,OPTIONAL:1,REQUIRED:2};
  const [order,style,process]=PRODUCTION.map(field=>rank[field===key?mode:modeFor(field)]);
  return order>=style&&style>=process;
 };
 const matches=(key,title)=>[labelFor(key),key,title].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(filter==='ALL'||filter==='ACTIVE'&&modeFor(key)!=='HIDDEN'||filter==='REQUIRED'&&modeFor(key)==='REQUIRED');
 const update=(key,mode)=>{
  if(ATTRIBUTES.includes(key)){onChange({...value,attributeInputs:{...value.attributeInputs,[key]:mode},...(value.materialSettings&&mode==='HIDDEN'?{materialSettings:{...value.materialSettings,stockFields:(value.materialSettings.stockFields||[]).filter(field=>field!==key)}}:{})});return;}
  if(!PRODUCTION.includes(key)){const fields=key==='dimensions'?['length','width']:[key];onChange({...value,requiredFields:[...(value.requiredFields||[]).filter(field=>!fields.includes(field)),...(mode==='REQUIRED'?fields:[])]});return;}
  if(productionModeAllowed(key,mode))onChange({...value,[key+'Input']:mode});
 };
 return <>
  <Stack spacing={1} sx={{mb:2}}><TextField fullWidth size="small" label={a.search} value={query} onChange={event=>setQuery(event.target.value)}/><TextField select fullWidth size="small" label={l[4]} value={filter} onChange={event=>setFilter(event.target.value)}>{[['ALL',l[5]],['ACTIVE',l[6]],['REQUIRED',l[7]]].map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField></Stack>
  {!material&&!groups.some(group=>group.keys.some(key=>matches(key,group.title)))&&<Typography role="status" sx={{p:2}}>{l[8]}</Typography>}
  {groups.map(group=>{
   if(group.material)return <MaterialCodeSettings key={group.title} value={value} onChange={onChange} languageCode={languageCode} disabled={disabled} query={query} filter={filter}/>;
   const keys=group.keys.filter(key=>matches(key,group.title));if(!keys.length)return null;
   return <Box key={group.title} sx={{mb:2,border:1,borderColor:'divider',borderRadius:1,overflow:'hidden'}}><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:1.5,py:1,bgcolor:'action.hover'}}><Typography component="h3" variant="subtitle2">{group.title}</Typography><Typography variant="caption" aria-label={`${group.title} · ${l[6]}`}>{group.keys.filter(key=>modeFor(key)!=='HIDDEN').length}/{group.keys.length}</Typography></Stack>
    <Table size="small" aria-label={group.title} sx={compact?{'& th, & td':{px:1}}:undefined}><TableHead><TableRow><TableCell>{t.inputs}</TableCell><TableCell sx={{width:compact?144:180}}>{t.inputSetting}</TableCell></TableRow></TableHead><TableBody>{keys.map(key=><TableRow key={key}><TableCell>{labelFor(key).replace(/ 입력$| input$|^Nhập /g,'')}</TableCell><TableCell><TextField select fullWidth size="small" autoFocus={autoFocus&&key===(productionEnabled?'order':'dimensions')} SelectProps={{SelectDisplayProps:{'aria-label':labelFor(key)}}} value={modeFor(key)} disabled={disabled} onChange={event=>update(key,event.target.value)}>{(ATTRIBUTES.includes(key)||PRODUCTION.includes(key)?['REQUIRED','OPTIONAL','HIDDEN']:['REQUIRED','HIDDEN']).map(mode=><MenuItem key={mode} value={mode} disabled={!productionModeAllowed(key,mode)}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}</TableBody></Table>
   </Box>;
  })}
 </>;
}
