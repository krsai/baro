import React,{useState} from 'react';
import {Box,Checkbox,Chip,FormControlLabel,IconButton,InputAdornment,Stack,TextField,Typography,createFilterOptions} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import {classificationName} from '../utils/partnerClassification.mjs';

export const SUBTYPE_PICKER_TEXT={
 ko:{title:'세부 업종 선택',search:'세부 업종 검색',placeholder:'업종·구분 검색',all:'전체',selected:'선택 항목',select:'선택',close:'선택창 닫기',empty:'일치하는 세부 업종이 없습니다.'},
 en:{title:'Select industries',search:'Search industries',placeholder:'Search industries or categories',all:'All',selected:'Selected',select:'Select',close:'Close industry selection',empty:'No matching industries.'},
 vi:{title:'Chọn ngành nghề',search:'Tìm ngành nghề',placeholder:'Tìm ngành nghề hoặc nhóm',all:'Tất cả',selected:'Đã chọn',select:'Chọn',close:'Đóng chọn ngành nghề',empty:'Không có ngành nghề phù hợp.'},
};
export default function AccountingSubtypePanel({options,roles,value,onChange,onClose,disabled,languageCode}){
 const t=SUBTYPE_PICKER_TEXT[languageCode]||SUBTYPE_PICKER_TEXT.en,name=row=>classificationName(row,languageCode);
 const [search,setSearch]=useState(''),[roleId,setRoleId]=useState(null),[selectedOnly,setSelectedOnly]=useState(false);
 const filter=createFilterOptions({stringify:row=>{const role=roles.find(item=>item.id===row.partnerRoleId);return [row.nameKo,row.nameEn,row.nameVi,role?.nameKo,role?.nameEn,role?.nameVi].join(' ');}});
 const matches=filter(options,{inputValue:search,getOptionLabel:name}).filter(row=>(roleId===null||row.partnerRoleId===roleId)&&(!selectedOnly||value.includes(row.id)));
 const groupRoles=[...roles];for(const row of options)if(!groupRoles.some(role=>role.id===row.partnerRoleId))groupRoles.push(row.partnerRole||{id:row.partnerRoleId,nameEn:'—'});
 const groups=groupRoles.map(role=>({role,rows:matches.filter(row=>row.partnerRoleId===role.id)})).filter(group=>group.rows.length);
 const toggle=id=>onChange(value.includes(id)?value.filter(item=>item!==id):[...value,id]);
 return <Box component="aside" id="accounting-subtype-panel" aria-label={t.title} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();onClose();}}} sx={{border:1,borderColor:'divider',borderRadius:1,display:'flex',flexDirection:'column',minWidth:0,height:{xs:'min(64dvh,640px)',md:'min(68dvh,680px)'},overflow:'hidden',bgcolor:'background.paper'}}>
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:1.5,py:1,borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{t.title} <Typography component="span" variant="caption" color="primary">{value.length}</Typography></Typography><IconButton size="small" aria-label={t.close} onClick={onClose}><CloseIcon fontSize="small"/></IconButton></Stack>
  <Box sx={{p:1.5,borderBottom:1,borderColor:'divider'}}><TextField autoFocus fullWidth size="small" placeholder={t.placeholder} value={search} onChange={event=>setSearch(event.target.value)} inputProps={{'aria-label':t.search}} InputProps={{startAdornment:<InputAdornment position="start"><SearchIcon fontSize="small"/></InputAdornment>}}/>
   <Stack direction="row" useFlexGap flexWrap="wrap" spacing={.75} sx={{mt:1}}>{[{id:null,label:t.all},...roles.filter(role=>options.some(row=>row.partnerRoleId===role.id)).map(role=>({id:role.id,label:name(role)}))].map(role=><Chip key={role.id??'all'} component="button" type="button" clickable size="small" label={role.label} color={roleId===role.id?'primary':'default'} variant={roleId===role.id?'filled':'outlined'} onClick={()=>setRoleId(role.id)} aria-pressed={roleId===role.id}/>)}</Stack>
   <Stack direction="row" alignItems="center" justifyContent="space-between"><FormControlLabel sx={{m:0}} control={<Checkbox size="small" checked={selectedOnly} onChange={event=>setSelectedOnly(event.target.checked)}/>} label={<Typography variant="caption">{t.selected}</Typography>}/><Typography variant="caption" color="text.secondary">{matches.length}</Typography></Stack>
  </Box>
  <Box sx={{overflowY:'auto',minHeight:0,flex:1}}>{groups.map(({role,rows})=><Box key={role.id}><Typography variant="caption" fontWeight={600} component="div" sx={{px:1.5,py:.75,bgcolor:'grey.50',borderBottom:1,borderColor:'divider',position:'sticky',top:0,zIndex:1}}>{name(role)} · {rows.length}</Typography>{rows.map(row=><FormControlLabel key={row.id} sx={{m:0,display:'flex',px:1,py:.25,minHeight:40,bgcolor:value.includes(row.id)?'action.selected':undefined,'&:hover':{bgcolor:'action.hover'},'& .MuiFormControlLabel-label':{minWidth:0,overflowWrap:'anywhere'}}} control={<Checkbox size="small" checked={value.includes(row.id)} disabled={disabled} onChange={()=>toggle(row.id)}/>} label={name(row)}/>)}</Box>)}{!matches.length&&<Typography variant="body2" color="text.secondary" sx={{p:2}}>{t.empty}</Typography>}</Box>
 </Box>;
}
