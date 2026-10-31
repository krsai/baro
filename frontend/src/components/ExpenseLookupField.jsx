import React, { useEffect, useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { EXPENSE_LOOKUP_TEXT } from '../constants/expenseLookup';
import { exactLookupCode, normalizeLookupText } from '../utils/expenseLookup.mjs';
import '../pages/App/expenseRequests.css';

export default function ExpenseLookupField({ label, options, value, onChange, columns, languageCode, directCode = false, disabled = false, required = false }) {
  const text = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const [draft,setDraft] = useState(directCode ? value?.code || '' : value?.name || '');
  const [open,setOpen] = useState(false), [query,setQuery] = useState('');
  useEffect(() => { if(value)setDraft(directCode ? value.code : value.name); },[value,directCode]);
  useEffect(() => { if(disabled){setOpen(false);} },[disabled]);
  const title = `${label} · ${text.search}`;
  const eligible=options.filter(option=>option.isActive!==false&&option.base?.isActive!==false);
  const searchable=(option,query)=>normalizeLookupText(columns.map(column=>column.value(option)).join(' ')).includes(normalizeLookupText(query));
  const showSearch=()=>{if(disabled)return;const search=directCode&&!value?draft:'';setQuery(eligible.some(option=>searchable(option,search))?search:'');setOpen(true);};
  const choose=option=>{if(disabled)return;if(option?.id!==value?.id)onChange(option);setDraft(directCode?option.code:option.name);setOpen(false);};
  const confirm=event=>{
    if(disabled||event.shiftKey||event.nativeEvent?.isComposing||event.isComposing||event.keyCode===229)return;
    if(event.key==='F2'){event.preventDefault();event.stopPropagation();showSearch();return;}
    if(!directCode){if(event.key==='Enter'){event.preventDefault();showSearch();}return;}
    if(!['Tab','Enter'].includes(event.key)||!draft.trim())return;
    const match=exactLookupCode(eligible,draft);
    if(event.key==='Enter'){event.preventDefault();event.stopPropagation();}
    if(match)choose(match);else if(value&&normalizeLookupText(value.code)===normalizeLookupText(draft))setDraft(value.code);else{event.preventDefault();showSearch();}
  };
  const filtered=eligible.filter(option=>searchable(option,query));
  const searchAdornment=<InputAdornment position="end" sx={{m:0,ml:.5,flexShrink:0}}><Tooltip title={title+' (F2)'}><span><IconButton type="button" tabIndex={-1} size="small" aria-label={title} disabled={disabled} sx={{width:28,height:28,p:.5,m:0}} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();showSearch();}}><SearchIcon fontSize="small"/></IconButton></span></Tooltip></InputAdornment>;
  return <>
    <TextField size="small" fullWidth required={required} disabled={disabled} label={label} value={draft} placeholder={directCode?text.codeHint:text.partnerHint}
      onClick={directCode?undefined:showSearch} onKeyDown={confirm}
      onChange={event=>{const input=event.target.value;setDraft(input);const match=exactLookupCode(eligible,input);if(match){if(match.id!==value?.id)onChange(match);}else if(value)onChange(null);}}
      sx={{minWidth:directCode?120:0,'& .MuiOutlinedInput-root':{pr:.5,gap:0},'& .MuiInputBase-input':{minWidth:directCode?'5ch':0,flex:'1 1 0',width:0,textOverflow:'clip'}}}
      inputProps={{spellCheck:false,autoCapitalize:directCode?'characters':undefined}}
      InputProps={{readOnly:!directCode,endAdornment:searchAdornment}}
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
