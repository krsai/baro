import {advanceAfterSelection} from '../utils/formFocus.mjs';
﻿import React,{useEffect,useRef,useState} from 'react';
import {IconButton,InputAdornment,TextField,Tooltip} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {normalizeLookupText,resolveLookupOption} from '../utils/expenseLookup.mjs';

export default function LookupInput({options=[],getOptionDisabled=()=>false,value,onChange,onSearch,getLabel=row=>row.name||row.code||'',getCode,getValues,getSearchText,getOptionKey=row=>row.id,hasSelection=false,allowEmpty=false,clearAfterChoose=false,label,hideLabel=false,showSearchIcon=true,searchLabel,placeholder,disabled,required,error,helperText,onEdit,onCommit,resetKey,inputValue,onInputChange,textFieldProps={},...props}){
 const text=value?getLabel(value):'',[draft,setDraft]=useState(text),preserveDraft=useRef(false),skipBlur=useRef(false),composing=useRef(false);
 const key=value?getOptionKey(value):null,input=inputValue===undefined?draft:inputValue;
 const setInput=(next,event,reason)=>{setDraft(next);onInputChange?.(event,next,reason);};
 useEffect(()=>{if(!value&&preserveDraft.current){preserveDraft.current=false;return;}setDraft(text);},[key,text,resetKey]);
 const eligible=options.filter(row=>row.isActive!==false&&row.base?.isActive!==false);
 const resolve=query=>{const match=resolveLookupOption(eligible,query,{getLabel,...(getCode?{getCode}:{}),...(getValues?{getValues}:{})});return match&&!getOptionDisabled(match)?match:null;};
 const choose=(row,event)=>{preserveDraft.current=false;setInput(clearAfterChoose?'':getLabel(row),event,'reset');if(!value||getOptionKey(row)!==key)onChange(row,event);};
 const search=()=>{if(!disabled){skipBlur.current=true;if(value&&normalizeLookupText(input)!==normalizeLookupText(text)){preserveDraft.current=true;onChange(null);}onSearch(input);}};
 const keyDown=event=>{
  if(disabled||composing.current||event.nativeEvent?.isComposing||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
  if(event.key==='F2'){event.preventDefault();event.stopPropagation();search();return;}
  if(!['Tab','Enter'].includes(event.key)||event.shiftKey)return;
  const selected=value&&normalizeLookupText(input)===normalizeLookupText(text),match=selected?value:resolve(input);
  if(match||(hasSelection||allowEmpty)&&!input.trim()){
   skipBlur.current=true;if(match&&!selected)choose(match,event);else if(!match&&allowEmpty&&value)onChange(null,event);
   const handled=onCommit?.(match,event);
   const advancing=!handled&&!clearAfterChoose;
   if(advancing)advanceAfterSelection(event.target);
   if(event.key==='Enter'||handled||advancing){event.preventDefault();event.stopPropagation();}return;
  }
  event.preventDefault();event.stopPropagation();search();
 };
 const {inputProps={},InputProps={},InputLabelProps={},slotProps={},onBlur,onFocus,onKeyDown:customKeyDown,...fieldProps}=textFieldProps;
 const labelSlot=slotProps.inputLabel;
 const inputSlot=slotProps.input;
 const lookupInputProps=state=>{
  const extra=typeof inputSlot==='function'?inputSlot(state):inputSlot;
  const merged={...InputProps,...extra};
  const inputLayout={
   '& > .MuiInputBase-input':{paddingRight:0,textOverflow:'ellipsis',...(clearAfterChoose&&merged.startAdornment?{}:{minWidth:0,width:0,flex:'1 1 0'})},
   '& > .MuiInputAdornment-root':{flexShrink:0},
  };
  return {...merged,...((state.variant||fieldProps.variant||props.variant||'outlined')==='outlined'?{notched:!hideLabel&&Boolean(label)}:{}),
   sx:[...(Array.isArray(merged.sx)?merged.sx:[merged.sx]),inputLayout],
   endAdornment:<>{merged.endAdornment}{showSearchIcon&&<InputAdornment position="end" sx={{m:0,ml:.5,flexShrink:0}}><Tooltip title={searchLabel||label||''}><span style={{display:'inline-flex'}}><IconButton type="button" tabIndex={-1} size="small" aria-label={searchLabel||label} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={search}><SearchIcon fontSize="small"/></IconButton></span></Tooltip></InputAdornment>}</>,
  };
 };
 return <TextField {...props} {...fieldProps} fullWidth size={fieldProps.size||'small'} value={input} disabled={disabled} required={required} error={error} helperText={helperText} label={hideLabel?undefined:label} placeholder={placeholder||fieldProps.placeholder} autoComplete="off"
  onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
  onChange={event=>{skipBlur.current=false;setInput(event.target.value,event,'input');onEdit?.(event.target.value);}}
  onFocus={event=>{skipBlur.current=false;onFocus?.(event);}}
  onBlur={event=>{if(!disabled&&!skipBlur.current&&!composing.current&&!event.nativeEvent?.isComposing){const selected=value&&normalizeLookupText(input)===normalizeLookupText(text),match=resolve(input);if(!selected&&match)choose(match,event);else if(!selected&&value){preserveDraft.current=true;onChange(null,event);}}skipBlur.current=false;onBlur?.(event);}}
  onKeyDown={event=>{keyDown(event);if(!event.defaultPrevented){inputProps.onKeyDown?.(event);if(!event.defaultPrevented)customKeyDown?.(event);}}}
  inputProps={{...inputProps,title:inputProps.title??input,onKeyDown:undefined,'aria-label':inputProps['aria-label']||label,'aria-haspopup':'dialog',spellCheck:false}}
  slotProps={{...slotProps,input:lookupInputProps,inputLabel:state=>({...InputLabelProps,...(typeof labelSlot==='function'?labelSlot(state):labelSlot),shrink:true,...(typeof label==='string'?{title:label}:{})})}}/>;
}
