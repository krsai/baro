import React, { useEffect, useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { EXPENSE_LOOKUP_TEXT } from '../constants/expenseLookup';
import { exactLookupCode, normalizeLookupText } from '../utils/expenseLookup.mjs';

export default function ExpenseLookupField({ label, options, value, onChange, columns, languageCode, directCode = false, disabled = false, required = false }) {
  const text = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const [draft,setDraft] = useState(directCode ? value?.code || '' : value?.name || '');
  const [open,setOpen] = useState(false), [query,setQuery] = useState('');
  useEffect(() => { if(value)setDraft(directCode ? value.code : value.name); },[value,directCode]);
  useEffect(() => { if(disabled)setOpen(false); },[disabled]);
  const title = `${label} · ${text.search}`;
  const showSearch = () => { if(disabled)return;setQuery(directCode && !value ? draft : '');setOpen(true); };
  const choose = option => { if(disabled)return;onChange(option);setDraft(directCode ? option.code : option.name);setOpen(false); };
  const resolve = () => {
    const match = directCode ? exactLookupCode(options,draft) : null;
    if(match){if(match.id!==value?.id)choose(match);return;}
    showSearch();
  };
  const filtered = options.filter(option => normalizeLookupText(columns.map(column=>column.value(option)).join(' ')).includes(normalizeLookupText(query)));
  return <>
    <TextField size="small" fullWidth required={required} disabled={disabled} label={label} value={draft}
      placeholder={directCode ? text.codeHint : text.partnerHint}
      onClick={!directCode ? showSearch : undefined}
      onChange={event=>{
        const input=event.target.value;setDraft(input);
        const match=exactLookupCode(options,input);
        if(match){if(match.id!==value?.id)onChange(match);}
        else if(value)onChange(null);
      }}
      onBlur={()=>{if(directCode && draft.trim() && !value && !open)resolve();}}
      onKeyDown={event=>{if(event.key==='F2'||event.key==='Enter'){event.preventDefault();if(event.key==='F2')showSearch();else resolve();}}}
      InputProps={{readOnly:!directCode,endAdornment:<InputAdornment position="end"><Tooltip title={`${title} (F2)`}><span><IconButton size="small" aria-label={title} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();showSearch();}}><SearchIcon fontSize="small" /></IconButton></span></Tooltip></InputAdornment>}}
    />
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md" aria-label={title}>
      <DialogTitle sx={{bgcolor:'#e5f0f6',color:'#235e77',borderBottom:'1px solid #bfd2dc',fontSize:18}}>{title}</DialogTitle>
      <DialogContent sx={{p:0}}><div className="compact-costs cc-lookup">
        <TextField size="small" fullWidth autoFocus label={text.keyword} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&filtered.length===1){event.preventDefault();choose(filtered[0]);}}} />
        <div className="cc-table-scroll"><table><thead><tr>{columns.map(column=><th key={column.key}>{column.label}</th>)}<th>{text.select}</th></tr></thead><tbody>
          {filtered.map(option=><tr key={option.id} onDoubleClick={()=>choose(option)}>{columns.map(column=><td key={column.key}>{column.value(option) || '—'}</td>)}<td><button className="cc-button" onClick={()=>choose(option)}>{text.select}</button></td></tr>)}
          {!filtered.length && <tr><td className="cc-empty" colSpan={columns.length+1}>{text.empty}</td></tr>}
        </tbody></table></div>
      </div></DialogContent><DialogActions><button className="cc-button" onClick={()=>setOpen(false)}>{text.close}</button></DialogActions>
    </Dialog>
  </>;
}
