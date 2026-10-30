import React, { useEffect, useState } from 'react';
import { Autocomplete, Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { EXPENSE_LOOKUP_TEXT } from '../constants/expenseLookup';
import { exactLookupCode, normalizeLookupText } from '../utils/expenseLookup.mjs';

export default function ExpenseLookupField({ label, options, value, onChange, columns, languageCode, directCode = false, disabled = false, required = false }) {
  const text = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const [draft,setDraft] = useState(directCode ? value?.code || '' : value?.name || '');
  const [open,setOpen] = useState(false), [query,setQuery] = useState('');
  const [suggesting,setSuggesting] = useState(false);
  useEffect(() => { if(value)setDraft(directCode ? value.code : value.name); },[value,directCode]);
  useEffect(() => { if(disabled){setOpen(false);setSuggesting(false);} },[disabled]);
  const title = `${label} · ${text.search}`;
  const showSearch = () => { if(disabled)return;setSuggesting(false);setQuery(directCode && !value ? draft : '');setOpen(true); };
  const choose = option => { if(disabled)return;onChange(option);setDraft(directCode ? option.code : option.name);setOpen(false);setSuggesting(false); };
  const filtered = options.filter(option => normalizeLookupText(columns.map(column=>column.value(option)).join(' ')).includes(normalizeLookupText(query)));
  const searchAdornment = <InputAdornment position="end"><Tooltip title={`${title} (F2)`}><span><IconButton size="small" aria-label={title} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();showSearch();}}><SearchIcon fontSize="small" /></IconButton></span></Tooltip></InputAdornment>;
  return <>
    {directCode ? <Autocomplete fullWidth size="small" freeSolo autoHighlight selectOnFocus handleHomeEndKeys clearOnBlur={false} forcePopupIcon={false}
      disabled={disabled} options={options} value={value || null} inputValue={draft}
      open={suggesting && !open && !disabled} onOpen={()=>setSuggesting(true)} onClose={()=>setSuggesting(false)}
      getOptionLabel={option=>typeof option==='string' ? option : option.code || ''}
      isOptionEqualToValue={(option,selected)=>option.id===selected.id}
      filterOptions={(rows,{inputValue})=>rows.filter(option=>normalizeLookupText(columns.map(column=>column.value(option)).join(' ')).includes(normalizeLookupText(inputValue)))}
      onInputChange={(_,input,reason)=>{if(reason!=='input' && reason!=='clear')return;setDraft(input);const match=exactLookupCode(options,input);if(match){if(match.id!==value?.id)onChange(match);}else if(value)onChange(null);}}
      onChange={(_,option)=>{if(typeof option==='string'){const match=exactLookupCode(options,option);if(match)choose(match);else showSearch();}else if(option)choose(option);else{setDraft('');onChange(null);}}}
      onKeyDown={event=>{if(event.key==='F2'){event.preventDefault();showSearch();}}}
      slotProps={{popper:{sx:{width:'min(420px, calc(100vw - 32px)) !important'}}}}
      renderOption={(props,option)=>{const {key,...rest}=props;return <Box component="li" key={option.id} {...rest} sx={{gap:2,alignItems:'flex-start !important'}}>
        <Typography sx={{fontWeight:600,minWidth:44}}>{option.code}</Typography>
        <Typography color="text.secondary" sx={{minWidth:0,overflowWrap:'anywhere'}}>{columns.slice(1).map(column=>column.value(option)).filter(Boolean).join(' · ')}</Typography>
      </Box>;}}
      renderInput={params=><TextField {...params} required={required} label={label} placeholder={text.codeHint}
        InputProps={{...params.InputProps,endAdornment:<Box sx={{display:'flex',alignItems:'center','& .MuiAutocomplete-endAdornment':{position:'static',transform:'none'}}}>{params.InputProps.endAdornment}{searchAdornment}</Box>}} />}
    /> : <TextField size="small" fullWidth required={required} disabled={disabled} label={label} value={draft}
      placeholder={text.partnerHint} onClick={showSearch}
      onKeyDown={event=>{if(event.key==='F2'||event.key==='Enter'){event.preventDefault();showSearch();}}}
      InputProps={{readOnly:true,endAdornment:searchAdornment}}
    />}
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md" aria-label={title}>
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }}>{title}</DialogTitle>
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
