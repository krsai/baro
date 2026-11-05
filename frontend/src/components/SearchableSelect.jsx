import React,{useState} from 'react';
import {Autocomplete,Box,Chip,Stack} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import {createAutocompleteFilterOptions,buildAutocompleteSearchBlob} from '../utils/autocompleteSearch';
import {getCurrentLanguageCode} from '../utils/appLanguage';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';

// Compatibility boundary for existing entity selectors; all regular selections
// use the same commit and search behavior as accounting lookup fields.
export default function SearchableSelect({label,hideCode=false,options=[],value,onChange,getOptionLabel=option=>option?.name||String(option??''),disabled=false,textFieldProps={},getOptionDisabled,isOptionEqualToValue=(a,b)=>a===b,filterOptions,renderInput,multiple=false,onInputChange,onKeyboardSelect,advanceFocusOnKeyboardSelect=false,inputSuffix,inputValue,getOptionKey,languageCode=getCurrentLanguageCode(),...props}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState([]);
 const t=EXPENSE_LOOKUP_TEXT[languageCode]||EXPENSE_LOOKUP_TEXT.en;
 const codeLabel=languageCode==='ko'?'코드':languageCode==='vi'?'Mã':'Code';
 if(props.freeSolo)return <Autocomplete {...props} multiple={multiple} options={options} value={value} inputValue={inputValue} disabled={disabled} getOptionLabel={getOptionLabel} isOptionEqualToValue={isOptionEqualToValue} filterOptions={filterOptions} getOptionDisabled={getOptionDisabled} onChange={onChange} onInputChange={onInputChange} renderInput={renderInput} openOnFocus={false} autoSelect={false}/>;
 const rendered=renderInput?.({InputProps:{},inputProps:{},disabled,size:props.size||'small'}),fields={...rendered?.props,...textFieldProps};
 const title=label||fields.label||fields.placeholder||t.search;
 const key=getOptionKey||(row=>typeof row==='object'?String(row.kind||'')+':'+String(row.id??row.dbId??row.code??options.indexOf(row)):String(row));
 const current=multiple?value||[]:value==null?null:options.find(row=>isOptionEqualToValue(row,value))||value;
 const eligible=options.filter(row=>!getOptionDisabled?.(row));
 const filter=filterOptions||createAutocompleteFilterOptions({getOptionLabel});
 const searchText=row=>buildAutocompleteSearchBlob(row,getOptionLabel);
 const commit=(row,event)=>{onChange?.(event,multiple?[...(current||[]).filter(item=>!isOptionEqualToValue(item,row)),row]:row,row?'selectOption':'clear');};
 const close=()=>{setOpen(false);props.onClose?.(null,'escape');};
 const advance=(row,event)=>{
  if(onKeyboardSelect){onKeyboardSelect({event,highlightedOption:row,inputElement:event.target});return true;}
  if(advanceFocusOnKeyboardSelect&&event.key==='Enter'){
   const nodes=[...document.querySelectorAll('input,textarea,select,button,[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length),index=nodes.indexOf(event.target);nodes[index+1]?.focus();return true;
  }
  return false;
 };
 return <Box sx={props.sx} className={['MuiAutocomplete-root',props.className].filter(Boolean).join(' ')} data-testid={props['data-testid']}>
  <LookupInput options={eligible} value={multiple?null:current} getLabel={getOptionLabel} getOptionKey={key} getValues={row=>[row?.name,row?.nameEn,row?.nameKo,row?.nameVi,row?.label,row?.displayName]} getCode={row=>hideCode?'':row?.code||row?.employeeNo||''} getSearchText={searchText} disabled={disabled||fields.disabled||props.readOnly} label={title} hideLabel={!label&&!fields.label} required={fields.required} error={fields.error} helperText={fields.helperText} placeholder={fields.placeholder} inputValue={inputValue} onInputChange={onInputChange} clearAfterChoose={multiple} hasSelection={multiple&&current.length>0} onChange={commit} onCommit={advance} textFieldProps={{...fields,InputProps:{...fields.InputProps,endAdornment:<>{inputSuffix}{fields.InputProps?.endAdornment}</>}}} onSearch={input=>{setQuery(input);setSelected(multiple?[...current]:[]);setOpen(true);props.onOpen?.();}}/>
  {multiple&&<Stack direction="row" useFlexGap flexWrap="wrap" gap={.5} sx={{mt:.5}}>{current.map(row=><Chip key={key(row)} size="small" label={getOptionLabel(row)} onDelete={disabled||getOptionDisabled?.(row)?undefined:event=>onChange?.(event,current.filter(item=>!isOptionEqualToValue(item,row)),'removeOption')}/>)}</Stack>}
  <LookupSearchDialog open={open&&!disabled} onClose={close} title={title+' \u00b7 '+t.search} query={query} onQueryChange={next=>{setQuery(next);onInputChange?.(null,next,'input');}} options={eligible} filterOptions={(rows,inputValue)=>filter(rows,{inputValue,getOptionLabel})} columns={[...(hideCode?[]:[{key:'code',label:codeLabel,value:row=>row?.code||row?.employeeNo||''}]),{key:'name',label:title,value:getOptionLabel}]} getSearchText={searchText} getOptionKey={key} languageCode={languageCode} multiple={multiple} selected={selected} onSelect={row=>{if(multiple)setSelected(current=>current.some(item=>isOptionEqualToValue(item,row))?current.filter(item=>!isOptionEqualToValue(item,row)):[...current,row]);else{commit(row);onInputChange?.(null,getOptionLabel(row),'reset');close();}}} {...(multiple?{onConfirm:()=>{onChange?.(null,selected,'selectOption');close();}}:{})}/>
 </Box>;
}
