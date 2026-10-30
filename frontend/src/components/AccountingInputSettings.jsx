import React from 'react';
import {MenuItem,Table,TableBody,TableCell,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_TEXT} from '../constants/expenseTypes';

export default function AccountingInputSettings({value,onChange,languageCode,disabled=false}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 const update=(key,mode)=>{
  const next={...value,[key+'Input']:mode};
  const keys=['order','style','process'],index=keys.indexOf(key);
  if(mode==='HIDDEN')for(const child of keys.slice(index+1))next[child+'Input']='HIDDEN';
  else for(const parent of keys.slice(0,index))if(next[parent+'Input']==='HIDDEN'||mode==='REQUIRED')next[parent+'Input']=mode==='REQUIRED'?'REQUIRED':'OPTIONAL';
  onChange(next);
 };
 return <Table size="small" aria-label={t.inputs}><TableHead><TableRow><TableCell>{t.inputs}</TableCell><TableCell sx={{width:180}}>{t.inputSetting}</TableCell></TableRow></TableHead><TableBody>
  {['order','style','process'].map(key=><TableRow key={key}><TableCell>{t[key].replace(/ 입력$| input$|^Nhập /g,'')}</TableCell><TableCell><TextField select fullWidth size="small" label={t[key]} value={value[key+'Input']||'HIDDEN'} disabled={disabled} onChange={event=>update(key,event.target.value)}>{['REQUIRED','OPTIONAL','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}
  {['transportDate','origin','destination','reference'].map(key=><TableRow key={key}><TableCell><Typography variant="body2">{t[key]}</Typography></TableCell><TableCell><TextField select fullWidth size="small" label={t[key]} value={(value.requiredFields||[]).includes(key)?'REQUIRED':'HIDDEN'} disabled={disabled} onChange={event=>onChange({...value,requiredFields:event.target.value==='REQUIRED'?[...(value.requiredFields||[]).filter(field=>field!==key),key]:(value.requiredFields||[]).filter(field=>field!==key)})}>{['REQUIRED','HIDDEN'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField></TableCell></TableRow>)}
 </TableBody></Table>;
}
