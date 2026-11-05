import React,{useEffect,useRef,useState} from 'react';
import {IconButton,InputAdornment,TextField,Tooltip} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {normalizeLookupText,resolveLookupOption} from '../utils/expenseLookup.mjs';

export default function LookupInput({options=[],value,onChange,onSearch,getLabel=row=>row.name||row.code||'',getCode,getValues,getSearchText,getOptionKey=row=>row.id,hasSelection=false,clearAfterChoose=false,label,hideLabel=false,searchLabel,placeholder,disabled,required,error,helperText,onEdit,...props}){
 const text=value?getLabel(value):'',[draft,setDraft]=useState(text),preserveDraft=useRef(false);
 const key=value?getOptionKey(value):null;
 useEffect(()=>{if(!value&&preserveDraft.current){preserveDraft.current=false;return;}setDraft(text);},[key,text]);
 const eligible=options.filter(row=>row.isActive!==false&&row.base?.isActive!==false);
 const resolve=(input,exactOnly=false)=>resolveLookupOption(eligible,input,{getLabel,...(getCode?{getCode}:{}),...(getValues?{getValues}:{}),...(getSearchText?{getSearchText}:{}),exactOnly});
 const choose=row=>{preserveDraft.current=false;setDraft(clearAfterChoose?'':getLabel(row));if(!value||getOptionKey(row)!==key)onChange(row);};
 const search=()=>{if(!disabled)onSearch(draft);};
 const edit=(input,composing)=>{setDraft(input);onEdit?.(input);const match=!composing&&resolve(input,true);if(match){choose(match);return;}if(value){preserveDraft.current=true;onChange(null);}};
 const keyDown=event=>{
  if(disabled||event.nativeEvent?.isComposing||event.isComposing||event.keyCode===229)return;
  if(event.key==='F2'){event.preventDefault();event.stopPropagation();search();return;}
  if(!['Tab','Enter'].includes(event.key)||event.shiftKey)return;
  if(value&&normalizeLookupText(draft)===normalizeLookupText(text)||hasSelection&&!draft.trim()){if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}return;}
  const match=resolve(draft);if(match){choose(match);if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}return;}
  event.preventDefault();event.stopPropagation();search();
 };
 return <TextField {...props} fullWidth size="small" value={draft} disabled={disabled} required={required} error={error} helperText={helperText} label={hideLabel?undefined:label} placeholder={placeholder} autoComplete="off" onChange={event=>edit(event.target.value,event.nativeEvent?.isComposing)} onCompositionEnd={event=>edit(event.target.value,false)} onKeyDown={keyDown} inputProps={{'aria-label':label,spellCheck:false}} InputProps={{endAdornment:<InputAdornment position="end" sx={{m:0,ml:.5}}><Tooltip title={searchLabel||label}><span><IconButton type="button" tabIndex={-1} size="small" aria-label={searchLabel||label} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={search} sx={{width:28,height:28,p:.5}}><SearchIcon fontSize="small"/></IconButton></span></Tooltip></InputAdornment>}}/>;
}
