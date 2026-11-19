import React,{useState} from 'react';
import {ITEM_ATTRIBUTE_TEXT} from '../constants/itemAttributes';
import {Box,Checkbox,Chip,FormControlLabel,InputAdornment,MenuItem,Stack,Table,TableBody,TableCell,TableRow,TextField,Typography} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {SUBTYPE_PICKER_TEXT} from './AccountingSubtypePanel';
import {EXPENSE_TEXT} from '../constants/expenseTypes';
import MaterialCodeSettings from './MaterialCodeSettings';
const GROUP_TEXT={ko:['소유 정보','규격 정보','생산 연결','운송 정보','표시 항목','전체','사용 중','필수','조건에 맞는 항목이 없습니다.'],en:['Ownership','Specifications','Production links','Transport information','Show fields','All','Enabled','Required','No matching fields.'],vi:['Thông tin sở hữu','Quy cách','Liên kết sản xuất','Thông tin vận chuyển','Hiển thị trường','Tất cả','Đang dùng','Bắt buộc','Không có trường phù hợp.']};
const ATTRIBUTES=['owner','customer','type'],PRODUCTION=['order','style','process'];
export default function AccountingInputSettings({value,onChange,languageCode,disabled=false,productionEnabled=true,compact=false,autoFocus=false,systemDefaults=false}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en,a=ITEM_ATTRIBUTE_TEXT[languageCode]||ITEM_ATTRIBUTE_TEXT.en,l=GROUP_TEXT[languageCode]||GROUP_TEXT.en;
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('ALL'),[groupFilter,setGroupFilter]=useState(null);
 const picker=SUBTYPE_PICKER_TEXT[languageCode]||SUBTYPE_PICKER_TEXT.en;
 const material=value.materialSettings?.enabled===true;
 const groups=[{title:l[0],keys:['owner']},{title:({ko:'거래 연결 정보',en:'Business links',vi:'Liên kết giao dịch'})[languageCode]||'Business links',keys:value.attributeInputs?.customer&&value.attributeInputs.customer!=='HIDDEN'?['customer']:[]},{title:l[1],keys:material?[]:['type','dimensions'],material},{title:l[2],keys:productionEnabled?PRODUCTION:[]},{title:l[3],keys:['transportDate','origin','destination']}];
 const modeFor=key=>ATTRIBUTES.includes(key)?value.attributeInputs?.[key]||'HIDDEN':PRODUCTION.includes(key)?value[key+'Input']||'HIDDEN':(value.requiredFields||[]).includes(key==='dimensions'?'length':key)?'REQUIRED':'HIDDEN';
 const labelFor=key=>ATTRIBUTES.includes(key)?a[key]:t[key];
 const modeAllowed=(key,mode)=>{
  if(systemDefaults&&mode==='HIDDEN'&&value.materialSettings?.enabled&&value.materialSettings.stockFields?.includes(key))return false;
  return true;
 };
 const matches=(key,title)=>(groupFilter===null||groupFilter===title)&&[labelFor(key),key,title].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(filter==='ALL'||filter==='ACTIVE'&&modeFor(key)!=='HIDDEN'||filter==='REQUIRED'&&modeFor(key)==='REQUIRED');
 const update=(key,mode)=>{
  if(!modeAllowed(key,mode))return;
  if(ATTRIBUTES.includes(key)){onChange({...value,attributeInputs:{...value.attributeInputs,[key]:mode},...(!systemDefaults&&value.materialSettings&&mode==='HIDDEN'?{materialSettings:{...value.materialSettings,stockFields:(value.materialSettings.stockFields||[]).filter(field=>field!==key)}}:{})});return;}
  if(!PRODUCTION.includes(key)){const fields=key==='dimensions'?['length','width']:[key];onChange({...value,requiredFields:[...(value.requiredFields||[]).filter(field=>!fields.includes(field)),...(mode==='REQUIRED'?fields:[])]});return;}
  // Adjust the dependent selections in one draft update instead of locking a toggle.
  const rank={HIDDEN:0,OPTIONAL:1,REQUIRED:2},index=PRODUCTION.indexOf(key);
  const next={...value,[key+'Input']:mode};
  for(const [position,field] of PRODUCTION.entries()){
   if(position<index&&rank[modeFor(field)]<rank[mode])next[field+'Input']=mode;
   if(position>index&&rank[modeFor(field)]>rank[mode])next[field+'Input']=mode;
  }
  onChange(next);
 };
 return <Box sx={compact?{display:'flex',flexDirection:'column',minHeight:0,flex:1}:undefined}>
  {compact?<Box sx={{p:1.5,borderBottom:1,borderColor:'divider'}}>
   <TextField autoFocus={autoFocus} fullWidth size="small" placeholder={a.search} value={query} onChange={event=>setQuery(event.target.value)} inputProps={{'aria-label':a.search}} InputProps={{startAdornment:<InputAdornment position="start"><SearchIcon fontSize="small"/></InputAdornment>}}/>
   <Stack direction="row" useFlexGap flexWrap="wrap" spacing={.75} sx={{mt:1}}>{[{title:null,label:picker.all},...groups.filter(group=>group.keys.length||group.material).map(group=>({title:group.title,label:group.title}))].map(group=><Chip key={group.title??'all'} component="button" type="button" clickable size="small" label={group.label} color={groupFilter===group.title?'primary':'default'} variant={groupFilter===group.title?'filled':'outlined'} onClick={()=>setGroupFilter(group.title)} aria-pressed={groupFilter===group.title}/>)}</Stack>
   <Stack direction="row" alignItems="center" justifyContent="space-between"><FormControlLabel sx={{m:0}} control={<Checkbox size="small" checked={filter==='ACTIVE'} onChange={event=>setFilter(event.target.checked?'ACTIVE':'ALL')}/>} label={<Typography variant="caption">{picker.selected}</Typography>}/><Typography variant="caption" color="text.secondary">{groups.reduce((sum,group)=>sum+group.keys.filter(key=>matches(key,group.title)).length,0)}</Typography></Stack>
  </Box>:<Stack spacing={1} sx={{mb:2}}><TextField fullWidth size="small" label={a.search} value={query} onChange={event=>setQuery(event.target.value)}/><TextField select fullWidth size="small" label={l[4]} value={filter} onChange={event=>setFilter(event.target.value)}>{[['ALL',l[5]],['ACTIVE',l[6]],['REQUIRED',l[7]]].map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField></Stack>}
  <Box sx={compact?{overflowY:'auto',minHeight:0,flex:1}:undefined}>
  {!material&&!groups.some(group=>group.keys.some(key=>matches(key,group.title)))&&<Typography role="status" sx={{p:2}}>{l[8]}</Typography>}
  {groups.map(group=>{
   if(group.material)return groupFilter===null||groupFilter===group.title?<MaterialCodeSettings systemDefaults={systemDefaults} key={group.title} value={value} onChange={onChange} languageCode={languageCode} disabled={disabled} query={query} filter={filter}/>:null;
   const keys=group.keys.filter(key=>matches(key,group.title));if(!keys.length)return null;
   if(compact&&systemDefaults)return <Box key={group.title}><Typography component="h3" variant="caption" fontWeight={600} sx={{px:1.5,py:.75,bgcolor:'grey.50',borderBottom:1,borderColor:'divider',position:'sticky',top:0,zIndex:1}}>{group.title} · {keys.length}</Typography>{keys.map(key=>{const enabled=modeFor(key)!=='HIDDEN';return <FormControlLabel key={key} sx={{m:0,display:'flex',px:1,py:.25,minHeight:40,bgcolor:enabled?'action.selected':undefined,'&:hover':{bgcolor:'action.hover'},'& .MuiFormControlLabel-label':{minWidth:0,overflowWrap:'anywhere'}}} control={<Checkbox size="small" checked={enabled} disabled={disabled||!modeAllowed(key,enabled?'HIDDEN':'REQUIRED')} onChange={event=>update(key,event.target.checked?'REQUIRED':'HIDDEN')}/>} label={labelFor(key).replace(/ 입력$| input$|^Nhập /g,'')}/>;})}</Box>;
   return <Box key={group.title} sx={{mb:2,border:1,borderColor:'divider',borderRadius:1,overflow:'hidden'}}><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:1.5,py:1,bgcolor:'action.hover'}}><Typography component="h3" variant="subtitle2">{group.title}</Typography><Typography variant="caption" aria-label={`${group.title} · ${l[6]}`}>{group.keys.filter(key=>modeFor(key)!=='HIDDEN').length}/{group.keys.length}</Typography></Stack>
    <Table size="small" aria-label={group.title} sx={compact?{'& th, & td':{px:1}}:undefined}><TableBody>{keys.map(key=><TableRow key={key}><TableCell>{labelFor(key).replace(/ 입력$| input$|^Nhập /g,'')}</TableCell><TableCell sx={{width:compact?144:180}}><TextField select fullWidth size="small" autoFocus={autoFocus&&key===(productionEnabled?'order':'dimensions')} SelectProps={{SelectDisplayProps:{'aria-label':labelFor(key)},...(systemDefaults&&modeFor(key)==='OPTIONAL'?{displayEmpty:true,renderValue:mode=>t[mode||'OPTIONAL']}:{})}} value={systemDefaults&&modeFor(key)==='OPTIONAL'?'':modeFor(key)} disabled={disabled} onChange={event=>update(key,event.target.value)}>{(!systemDefaults&&(ATTRIBUTES.includes(key)||PRODUCTION.includes(key))?['REQUIRED','OPTIONAL','HIDDEN']:['REQUIRED','HIDDEN']).map(mode=><MenuItem key={mode} value={mode} disabled={!modeAllowed(key,mode)}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}</TableBody></Table>
   </Box>;
  })}
  </Box>
 </Box>;
}
