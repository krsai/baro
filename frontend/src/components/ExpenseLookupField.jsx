import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete, Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { EXPENSE_LOOKUP_TEXT } from '../constants/expenseLookup';
import { exactLookupCode, normalizeLookupText } from '../utils/expenseLookup.mjs';
import '../pages/App/expenseRequests.css';

export default function ExpenseLookupField({ label, options, value, onChange, columns, languageCode, directCode = false, disabled = false, required = false, hideLabel = false, error = false, helperText }) {
  const text = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const [draft,setDraft] = useState(directCode ? value?.code || '' : value?.name || '');
  const [open,setOpen] = useState(false), [query,setQuery] = useState(''),[suggestions,setSuggestions]=useState(false),typingClear=useRef(false);
  const display=option=>option?(directCode?option.code:option.name)||'':'';
  const selectedText=display(value);
  useEffect(() => {if(!value&&typingClear.current){typingClear.current=false;return;}setDraft(selectedText);},[value?.id,selectedText]);
  useEffect(() => { if(disabled){setOpen(false);setSuggestions(false);} },[disabled]);
  const title = `${label} · ${text.search}`;
  const eligible=options.filter(option=>option.isActive!==false&&option.base?.isActive!==false);
  const searchable=(option,query)=>normalizeLookupText(columns.map(column=>column.value(option)).join(' ')).includes(normalizeLookupText(query));
  const showSearch=()=>{if(disabled)return;const search=directCode&&!value?draft:'';setQuery(eligible.some(option=>searchable(option,search))?search:'');setSuggestions(false);setOpen(true);};
  const choose=option=>{if(disabled)return;typingClear.current=false;if(option?.id!==value?.id)onChange(option);setDraft(display(option));setOpen(false);setSuggestions(false);};
  const confirm=event=>{
    if(disabled||event.shiftKey)return;
    if(event.nativeEvent?.isComposing||event.isComposing||event.keyCode===229){event.defaultMuiPrevented=true;return;}
    if(event.key==='F2'){event.preventDefault();event.stopPropagation();showSearch();return;}
    if(event.key==='Enter'){
      const match=directCode?exactLookupCode(eligible,draft):null;
      if(match){event.defaultMuiPrevented=true;event.preventDefault();event.stopPropagation();choose(match);return;}
      if(!eligible.some(option=>searchable(option,draft))){event.defaultMuiPrevented=true;event.preventDefault();}
    }
    if(event.key==='Tab'){
      const match=directCode?exactLookupCode(eligible,draft):null;
      if(match)choose(match);else setDraft(selectedText);
      setSuggestions(false);
      // Tab always continues to the next field; it never opens or traps a dialog.
    }
  };
  const filtered=eligible.filter(option=>searchable(option,query));
  const searchAdornment=<InputAdornment position="end" sx={{m:0,ml:.5,flexShrink:0}}><Tooltip title={title+' (F2)'}><span><IconButton type="button" tabIndex={-1} size="small" aria-label={title} disabled={disabled} sx={{width:28,height:28,p:.5,m:0}} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();showSearch();}}><SearchIcon fontSize="small"/></IconButton></span></Tooltip></InputAdornment>;
  return <>
    <Autocomplete fullWidth size="small" disabled={disabled} options={eligible} value={value||null} inputValue={draft} open={suggestions&&!open&&!disabled} forcePopupIcon={false}
      sx={{'& .MuiAutocomplete-endAdornment':{position:'static',display:'flex'},'& .MuiOutlinedInput-root':{paddingRight:'.5rem!important'}}}
      slotProps={{popper:{sx:{minWidth:'min(360px, calc(100vw - 32px))',maxWidth:'calc(100vw - 32px)'},modifiers:[{name:'preventOverflow',options:{padding:8}}]}}}
      onOpen={()=>{if(!open&&!disabled)setSuggestions(true);}} onClose={()=>setSuggestions(false)} getOptionLabel={display} isOptionEqualToValue={(a,b)=>a.id===b.id}
      openOnFocus autoHighlight selectOnFocus noOptionsText={text.empty} onKeyDown={confirm}
      filterOptions={(rows,{inputValue})=>rows.filter(option=>searchable(option,value&&inputValue===selectedText?'':inputValue))}
      onChange={(_,option)=>choose(option)} onInputChange={(event,input,reason)=>{
        if(reason==='input'){setDraft(input);const composing=event?.nativeEvent?.isComposing;const match=directCode&&!composing?exactLookupCode(eligible,input):null;
          if(match){if(match.id!==value?.id)onChange(match);}else if(value){typingClear.current=true;onChange(null);}
        }else if(reason==='clear'){setDraft('');}else if(reason==='blur')setDraft(selectedText);
      }}
      renderOption={(props,option)=>{const {key,...rest}=props;return <Box component="li" key={key} {...rest} sx={{display:'grid!important',gridTemplateColumns:columns.length>1?'minmax(60px,90px) minmax(0,1fr)':'minmax(0,1fr)',gap:1,alignItems:'start!important'}}>{columns.map(column=><Box component="span" key={column.key} sx={{fontWeight:column.key==='code'?600:400,whiteSpace:'normal',overflowWrap:'anywhere'}}>{column.value(option)||'—'}</Box>)}</Box>;}}
      renderInput={params=><TextField {...params} fullWidth error={error} helperText={helperText} required={required} disabled={disabled} label={hideLabel?undefined:label} placeholder={hideLabel?'':directCode?text.codeHint:text.partnerHint}
        inputProps={{...params.inputProps,'aria-label':label,spellCheck:false,autoCapitalize:directCode?'characters':undefined}}
        InputProps={{...params.InputProps,endAdornment:<>{params.InputProps.endAdornment}{searchAdornment}</>}}
      />}
    />
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md" aria-label={title}>
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }}>{title}</DialogTitle>
      <DialogContent sx={{p:0}}><div className="compact-costs cc-lookup">
        <TextField size="small" fullWidth autoFocus label={text.keyword} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&filtered.length===1){event.preventDefault();choose(filtered[0]);}}} />
        <div className="cc-table-scroll"><table><thead><tr>{columns.map(column=><th key={column.key}>{column.label}</th>)}<th>{text.select}</th></tr></thead><tbody>
          {filtered.map(option=><tr key={option.id} onDoubleClick={()=>choose(option)}>{columns.map(column=><td key={column.key}>{column.value(option) || '—'}</td>)}<td><button type="button" className="cc-button" onClick={()=>choose(option)}>{text.select}</button></td></tr>)}
          {!filtered.length && <tr><td className="cc-empty" colSpan={columns.length+1}>{text.empty}</td></tr>}
        </tbody></table></div>
      </div></DialogContent><DialogActions><button type="button" className="cc-button" onClick={()=>setOpen(false)}>{text.close}</button></DialogActions>
    </Dialog>
  </>;
}
