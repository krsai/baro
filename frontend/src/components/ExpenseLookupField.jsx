import React,{useEffect,useState} from 'react';
import {Chip,Stack} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';
export default function ExpenseLookupField({label,options=[],value,onChange,columns,languageCode,directCode=false,disabled=false,required=false,hideLabel=false,error=false,helperText,multiple=false,getOptionKey=row=>row.id,getOptionLabel,getCode,placeholder}){
 const text=EXPENSE_LOOKUP_TEXT[languageCode]||EXPENSE_LOOKUP_TEXT.en;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[selection,setSelection]=useState([]);
 const display=getOptionLabel||(row=>directCode?row.code||'':row.name||row.label||'');
 const searchText=row=>[...columns.map(column=>column.value(row)),row.code,row.name,row.nameEn,row.nameKo,row.nameVi].filter(Boolean).join(' ');
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const choose=row=>{if(multiple){if(!row)return;const selected=value||[];if(!selected.some(item=>getOptionKey(item)===getOptionKey(row)))onChange([...selected,row]);}else onChange(row);};
 const title=label+' \u00b7 '+text.search;
 return <Stack spacing={.5} sx={{minWidth:0}}><LookupInput label={label} hideLabel={hideLabel} options={options} value={multiple?null:value} getLabel={display} getCode={getCode} getValues={row=>[...columns.map(column=>column.value(row)),row.name,row.nameEn,row.nameKo,row.nameVi]} getSearchText={searchText} getOptionKey={getOptionKey} onChange={choose} disabled={disabled} required={required} error={error} helperText={helperText} searchLabel={title} placeholder={placeholder} hasSelection={multiple&&value?.length>0} clearAfterChoose={multiple} onSearch={input=>{setQuery(input);setSelection(multiple?[...(value||[])]:[]);setOpen(true);}}/>
 {multiple&&value?.length>0&&<Stack direction="row" spacing={.5} useFlexGap flexWrap="wrap">{value.map(row=><Chip key={getOptionKey(row)} size="small" label={display(row)} onDelete={disabled?undefined:()=>onChange(value.filter(item=>getOptionKey(item)!==getOptionKey(row)))}/>)}</Stack>}
 <LookupSearchDialog open={open} onClose={()=>setOpen(false)} title={title} query={query} onQueryChange={setQuery} options={options.filter(row=>row.isActive!==false&&row.base?.isActive!==false)} columns={columns} getSearchText={searchText} getOptionKey={getOptionKey} languageCode={languageCode} multiple={multiple} selected={selection} onSelect={row=>{if(multiple)setSelection(current=>current.some(item=>getOptionKey(item)===getOptionKey(row))?current.filter(item=>getOptionKey(item)!==getOptionKey(row)):[...current,row]);else{choose(row);setOpen(false);}}} {...(multiple?{onConfirm:()=>{onChange(selection);setOpen(false);}}:{})}/>
 </Stack>;
}
