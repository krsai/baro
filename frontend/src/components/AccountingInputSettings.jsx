import React,{useState} from 'react';
import {ITEM_ATTRIBUTE_TEXT} from '../constants/itemAttributes';
import {MenuItem,Table,TableBody,TableCell,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_TEXT} from '../constants/expenseTypes';

export default function AccountingInputSettings({value,onChange,languageCode,disabled=false,productionEnabled=true,compact=false,autoFocus=false}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 const a=ITEM_ATTRIBUTE_TEXT[languageCode]||ITEM_ATTRIBUTE_TEXT.en;
 const [query,setQuery]=useState('');
 const matches=key=>[t[key],a[key],key].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 const update=(key,mode)=>{
  const next={...value,[key+'Input']:mode};
  const keys=['order','style','process'],index=keys.indexOf(key);
  if(mode==='HIDDEN')for(const child of keys.slice(index+1))next[child+'Input']='HIDDEN';
  else for(const parent of keys.slice(0,index))if(next[parent+'Input']==='HIDDEN'||mode==='REQUIRED')next[parent+'Input']=mode==='REQUIRED'?'REQUIRED':'OPTIONAL';
  onChange(next);
 };
 return <><TextField fullWidth size="small" label={a.search} value={query} onChange={event=>setQuery(event.target.value)} sx={{mb:1}}/><Table size="small" aria-label={t.inputs} sx={compact?{'& th, & td':{px:1}}:undefined}><TableHead><TableRow><TableCell>{t.inputs}</TableCell><TableCell sx={{width:compact?144:180}}>{t.inputSetting}</TableCell></TableRow></TableHead><TableBody>
  {productionEnabled&&['order','style','process'].filter(matches).map(key=><TableRow key={key}><TableCell>{t[key].replace(/ 입력$| input$|^Nhập /g,'')}</TableCell><TableCell><TextField select fullWidth size="small" autoFocus={autoFocus&&key==='order'} SelectProps={{SelectDisplayProps:{'aria-label':t[key]}}} value={value[key+'Input']||'HIDDEN'} disabled={disabled} onChange={event=>update(key,event.target.value)}>{['REQUIRED','OPTIONAL','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}
  {matches('dimensions')&&<TableRow><TableCell><Typography variant="body2">{t.dimensions}</Typography></TableCell><TableCell><TextField select fullWidth size="small" autoFocus={autoFocus&&!productionEnabled} SelectProps={{SelectDisplayProps:{'aria-label':t.dimensions}}} value={(value.requiredFields||[]).includes('length')?'REQUIRED':'HIDDEN'} disabled={disabled} onChange={event=>onChange({...value,requiredFields:[...(value.requiredFields||[]).filter(key=>!['length','width'].includes(key)),...(event.target.value==='REQUIRED'?['length','width']:[])]})}>{['REQUIRED','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>}
  {['transportDate','origin','destination'].filter(matches).map(key=><TableRow key={key}><TableCell><Typography variant="body2">{t[key]}</Typography></TableCell><TableCell><TextField select fullWidth size="small" SelectProps={{SelectDisplayProps:{'aria-label':t[key]}}} value={(value.requiredFields||[]).includes(key)?'REQUIRED':'HIDDEN'} disabled={disabled} onChange={event=>onChange({...value,requiredFields:event.target.value==='REQUIRED'?[...(value.requiredFields||[]).filter(field=>field!==key),key]:(value.requiredFields||[]).filter(field=>field!==key)})}>{['REQUIRED','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}
  {['customer','type'].filter(matches).map(key=><TableRow key={key}><TableCell>{a[key]}</TableCell><TableCell><TextField select fullWidth size="small" SelectProps={{SelectDisplayProps:{'aria-label':a[key]}}} value={value.attributeInputs?.[key]||'HIDDEN'} disabled={disabled} onChange={event=>onChange({...value,attributeInputs:{...value.attributeInputs,[key]:event.target.value}})}>{['REQUIRED','OPTIONAL','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}
 </TableBody></Table></>;
}
