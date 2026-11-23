import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import PageActions from '../../../components/PageActions';
import SaveButton from '../../../components/SaveButton';
import SearchPanel from '../../../components/SearchPanel';
import SearchInput from '../../../components/SearchInput';
import ListDetailLayout from '../../../components/ListDetailLayout';
import DialogRecordList from '../../../components/DialogRecordList';
import DialogDetailPanel from '../../../components/DialogDetailPanel';
import AppNotice from '../../../components/AppNotice';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {useLanguage} from '../../../context/LanguageContext';
import {requestJSON} from '../../../utils/apiClient';
import {applyTextAcronyms} from '../../../utils/textAcronymLoader.mjs';
import {textAcronymText} from '../../../constants/textAcronyms';

const payloadRows=rows=>rows.map(({acronym,expansion,meaning})=>({acronym:acronym.trim(),expansion:expansion.trim(),meaning:meaning.trim()}));
export default function SystemTextAcronyms(){
 const {languageCode}=useLanguage(),t=textAcronymText[languageCode]||textAcronymText.en,dialogs=usePageDialogs();
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false),[reload,setReload]=useState(0);
 const baseline=useRef('[]'),pending=useRef(null),locked=useRef(false);
 const draft=JSON.stringify(payloadRows(rows)),dirty=draft!==baseline.current;
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{let live=true;setLoading(true);setLoadError(false);setError('');requestJSON('/system/text-acronyms',{skipCache:true}).then(value=>{
  if(!live)return;const next=value.entries.map(row=>({...row,_key:crypto.randomUUID()}));setRows(next);setRevision(value.revision);setSelected(next[0]?._key??null);baseline.current=JSON.stringify(payloadRows(next));applyTextAcronyms(value);pending.current=null;setUncertain(false);
 }).catch(()=>{if(live)setLoadError(true);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[reload]);
 const reloadRows=async()=>{if(busy||uncertain)return;if(dirty&&!await dialogs.confirm(t.discard))return;setReload(n=>n+1);};
 const edit=(key,value)=>{if(busy||uncertain)return;setRows(current=>current.map(row=>row._key===selected?{...row,[key]:value}:row));setError('');setSuccess(false);pending.current=null;};
 const save=async()=>{
  if(locked.current)return;
  const entries=payloadRows(rows),keys=entries.map(row=>row.acronym.toUpperCase());
  if(entries.length>2000||entries.some(row=>!/^[A-Za-z][A-Za-z0-9]*(?:\/[A-Za-z][A-Za-z0-9]*)*$/.test(row.acronym)||(row.acronym.match(/[A-Z]/g)||[]).length<2||row.acronym.length>40||row.expansion.length>500||row.meaning.length>500)||new Set(keys).size!==keys.length){setError(t.invalid);return;}
  locked.current=true;setBusy(true);setError('');setSuccess(false);
  pending.current??={revision,entries,clientKey:crypto.randomUUID()};
  try{
   const value=await requestJSON('/system/text-acronyms',{method:'PUT',body:JSON.stringify(pending.current)});
   const currentAcronym=rows.find(row=>row._key===selected)?.acronym.trim(),next=value.entries.map(row=>({...row,_key:crypto.randomUUID()}));
   setRows(next);setSelected(next.find(row=>row.acronym===currentAcronym)?._key??next[0]?._key??null);setRevision(value.revision);baseline.current=JSON.stringify(payloadRows(next));applyTextAcronyms(value);pending.current=null;setUncertain(false);setSuccess(true);
  }catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setError(e.message==='TEXT_ACRONYMS_CHANGED'?t.changed:e.message==='INVALID_TEXT_ACRONYMS'?t.invalid:t.saveFailed);}
  finally{locked.current=false;setBusy(false);}
 };
 const disabled=busy||uncertain||loading||loadError,row=rows.find(item=>item._key===selected),q=query.trim().toLocaleLowerCase();
 const filtered=rows.filter(item=>!q||[item.acronym,item.expansion,item.meaning].some(value=>value.toLocaleLowerCase().includes(q)));
 return <AppPageContainer title={t.title} titleActions={<PageActions><Button disabled={disabled} onClick={()=>{const entry={_key:crypto.randomUUID(),acronym:'',expansion:'',meaning:''};setRows(current=>[...current,entry]);setSelected(entry._key);setQuery('');setSuccess(false);}}>{t.add}</Button><SaveButton loading={busy} disabled={loading||loadError||busy||!dirty&&!uncertain} onClick={save}>{t.save}</SaveButton></PageActions>}>
 <Stack spacing={2}>
 {error&&<AppNotice severity="error" action={!uncertain?<Button onClick={reloadRows}>{t.reload}</Button>:<Button disabled={busy} onClick={save}>{t.save}</Button>}>{error}</AppNotice>}
 {success&&<AppNotice severity="success">{t.saved}</AppNotice>}
 <SearchPanel onReset={()=>setQuery('')} search={<SearchInput value={query} placeholder={t.search} inputProps={{'aria-label':t.search}} onChange={e=>setQuery(e.target.value)}/>}/>
 <ListDetailLayout list={<DialogRecordList languageCode={languageCode} rows={filtered} getKey={item=>item._key} selectedKey={selected} onSelect={item=>setSelected(item._key)} onPreview={item=>setSelected(item._key)} disabled={busy||uncertain} loading={loading} error={loadError} onRetry={reloadRows} columns={[{key:'acronym',label:t.acronym,textCase:'preserve',value:item=>item.acronym||t.new},{key:'expansion',label:t.expansion,textCase:'preserve',value:item=>item.expansion}]}/>}
 detail={!loading&&!loadError?<DialogDetailPanel title={t.detail} footer={row?<Button color="error" disabled={disabled} onClick={()=>{setRows(current=>current.filter(item=>item._key!==selected));setSelected(null);setSuccess(false);pending.current=null;}}>{t.remove}</Button>:null}>{row?<Stack spacing={2}>{['acronym','expansion','meaning'].map(key=><TextField key={key} label={t[key]} required={key==='acronym'} value={row[key]} disabled={disabled} multiline={key!=='acronym'} inputProps={{maxLength:key==='acronym'?40:500,'data-text-case':'preserve'}} onChange={e=>edit(key,e.target.value)}/>)}</Stack>:<Typography>{t.empty}</Typography>}</DialogDetailPanel>:null}/>
 </Stack></AppPageContainer>;
}
