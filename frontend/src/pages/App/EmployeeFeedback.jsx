import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Checkbox,Chip,FormControlLabel,MenuItem,Paper,Stack,Tab,Tabs,TextField,Typography} from '@mui/material';
import dayjs from 'dayjs';
import AppPageContainer from '../../components/AppPageContainer';
import PageSectionHeader from '../../components/PageSectionHeader';
import PageActions from '../../components/PageActions';
import ListDetailLayout from '../../components/ListDetailLayout';
import DialogRecordList from '../../components/DialogRecordList';
import SearchableSelect from '../../components/SearchableSelect';
import QueryFeedback from '../../components/QueryFeedback';
import {usePageDialogs} from '../../components/PageDialogProvider';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {buildQueryString,requestJSON} from '../../utils/apiClient';
import {employeeFeedbackText} from '../../constants/employeeFeedback';

const emptyRule=()=>({id:crypto.randomUUID(),version:0,employeeId:null,factoryId:null,definition:{name:'',kind:'WARNING',task:'WORK_LOG_ENTRY',effectiveFrom:dayjs().format('YYYY-MM-DD'),dueAfterDays:1,deadlineTime:'09:00',timeZone:'Asia/Ho_Chi_Minh',threshold:1,weekdays:[1,2,3,4,5],message:'',automaticDelivery:false}});
const emptyDraft=()=>({id:crypto.randomUUID(),version:0,employeeId:null,ruleId:null,state:'DRAFT',content:{kind:'WARNING',subject:'',message:'',basis:''}});
const snapshot=value=>JSON.stringify(value);

export default function EmployeeFeedback(){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions(),dialogs=usePageDialogs();
 const t=employeeFeedbackText[languageCode]||employeeFeedbackText.en;
 const [category,setCategory]=useState('rules'),[data,setData]=useState(null),[draft,setDraft]=useState(null),[baseline,setBaseline]=useState(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0),[result,setResult]=useState(null),[simulating,setSimulating]=useState(false);
 const [sample,setSample]=useState({workDate:dayjs().format('YYYY-MM-DD'),submittedAt:'',evidenceState:'UNKNOWN',matchingCount:1,excludedDay:false});
 const orgRef=useRef(activeOrgId),lock=useRef(false),transition=useRef(null);orgRef.current=activeOrgId;
 const dirty=Boolean(draft&&snapshot(draft)!==baseline),final=category==='drafts'&&draft?.state!=='DRAFT';
 useUnsavedChanges(dirty);
 useEffect(()=>{
  setData(null);setDraft(null);setBaseline(null);setResult(null);lock.current=false;transition.current=null;setSaving(false);setSimulating(false);
 },[activeOrgId]);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setLoadError(false);
  if(!activeOrgId){setLoading(false);setLoadError(true);return ()=>abort.abort();}
  requestJSON('/employee-feedback'+buildQueryString({orgId:activeOrgId}),{signal:abort.signal,skipCache:true,forceRefresh:true}).then(value=>{if(!abort.signal.aborted)setData(value);}).catch(()=>{if(!abort.signal.aborted)setLoadError(true);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[activeOrgId,retry]);
 const switchTo=async(nextCategory,row=null)=>{
  if(lock.current||saving||simulating||transition.current)return;
  const token={},orgId=activeOrgId;transition.current=token;
  try{
   if(dirty&&!await dialogs.confirm(t.discard))return;
   if(orgRef.current!==orgId)return;
   setCategory(nextCategory);setDraft(row?structuredClone(row):null);setBaseline(row?snapshot(row):null);setResult(null);
  }finally{if(transition.current===token)transition.current=null;}
 };
 const start=async()=>{
  if(lock.current||simulating||transition.current)return;
  const token={},orgId=activeOrgId;transition.current=token;
  try{if(dirty&&!await dialogs.confirm(t.discard))return;if(orgRef.current!==orgId)return;setDraft(category==='rules'?emptyRule():emptyDraft());setBaseline(null);setResult(null);}
  finally{if(transition.current===token)transition.current=null;}
 };
 const change=(key,value)=>{setDraft(current=>({...current,[key]:value}));setResult(null);};
 const field=(key,value)=>{const prop=category==='rules'?'definition':'content';setDraft(current=>({...current,[prop]:{...current[prop],[key]:value}}));setResult(null);};
 const save=async(state)=>{
  if(!draft||lock.current||loading||loadError)return;
  const orgId=activeOrgId,body=state?{...draft,state}:draft;lock.current=true;setSaving(true);
  try{
   const saved=await requestJSON(`/employee-feedback/${category}/${draft.id}`+buildQueryString({orgId}),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(orgRef.current!==orgId)return;
   setData(current=>({...current,[category]:[saved,...(current?.[category]||[]).filter(row=>row.id!==saved.id)]}));setDraft(saved);setBaseline(snapshot(saved));showNotification(t.saved,'success');
  }catch(error){if(orgRef.current===orgId)showNotification(error?.status===409?t.changed:error?.status===400?t.invalid:t.error,'error');}
  finally{if(orgRef.current===orgId){lock.current=false;setSaving(false);}}
 };
 const simulate=async()=>{
  if(!draft||lock.current||simulating)return;const orgId=activeOrgId;setSimulating(true);setResult(null);
  try{
   const submittedAt=sample.submittedAt?`${sample.submittedAt}:00${draft.definition.timeZone==='Asia/Seoul'?'+09:00':'+07:00'}`:null;
   const value=await requestJSON('/employee-feedback/preview'+buildQueryString({orgId}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({definition:draft.definition,sample:{...sample,submittedAt}})});
   if(orgRef.current===orgId)setResult(value);
  }catch{if(orgRef.current===orgId)showNotification(t.invalid,'error');}finally{if(orgRef.current===orgId)setSimulating(false);}
 };
 const values=category==='rules'?draft?.definition:draft?.content,rows=data?.[category]||[],busy=saving||simulating||loading;
 const people=data?.employees||[],factories=data?.factories||[],personName=id=>people.find(person=>person.id===id)?.name||String(id||'');
 const options=(key,keys)=> <TextField select fullWidth size="small" label={t[key]} value={values?.[key]||''} disabled={busy||final} onChange={event=>field(key,event.target.value)}>{keys.map(item=><MenuItem key={item} value={item}>{t[item]||item}</MenuItem>)}</TextField>;
 return <AppPageContainer header={<PageSectionHeader title={t.title} titleComponent="h1" context={<Chip label={t.mode} size="small"/>} actions={<PageActions><Button disabled={!data||busy||loadError} onClick={start}>{t.new}</Button><Button variant="contained" disabled={!draft||!dirty||busy||final||loadError} onClick={()=>save()}>{t.save}</Button></PageActions>}/> }>
  <QueryFeedback error={loadError} onRetry={()=>setRetry(value=>value+1)}/>
  <Tabs value={category} onChange={(_event,value)=>switchTo(value)}><Tab value="rules" label={t.rules}/><Tab value="drafts" label={t.drafts}/></Tabs>
  <Typography variant="caption" color="text.secondary">{t.recent}</Typography>
  <ListDetailLayout listWidth="minmax(0,0.85fr)" detailWidth="minmax(0,1.5fr)" list={<DialogRecordList rows={rows} columns={[{key:'name',label:t.name,value:row=>row.definition?.name||row.content?.subject},{key:'employee',label:t.employee,value:row=>personName(row.employeeId)},{key:'kind',label:t.kind,value:row=>t[row.definition?.kind||row.content?.kind]}]} selectedKey={draft?.id} onPreview={()=>{}} onSelect={row=>switchTo(category,row)} disabled={busy} loading={loading} error={loadError} loaded={Boolean(data)} onRetry={()=>setRetry(value=>value+1)} languageCode={languageCode}/>}
   detail={draft?<Paper variant="outlined" sx={{p:2,minWidth:0}}><Stack spacing={2}>
    {final&&<Chip label={t[draft.state]}/>}
    <SearchableSelect label={t.employee} options={people} getOptionDisabled={person=>person.status!==undefined&&person.status!=='ACTIVE'} value={people.find(person=>person.id===draft.employeeId)||null} getOptionLabel={person=>`${person.employeeNo||''} ${person.name}`} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={busy||final} onChange={(_event,value)=>change('employeeId',value?.id||null)} textFieldProps={{size:'small',required:true}}/>
    {options('kind',['WARNING','PRAISE'])}
    {category==='rules'?<>
     <TextField label={t.name} value={values.name} disabled={busy} onChange={event=>field('name',event.target.value)} size="small" required/>
     {options('task',['WORK_LOG_ENTRY','LEDGER_ENTRY','OTHER'])}
     <SearchableSelect label={t.factory} options={factories} value={factories.find(factory=>factory.id===draft.factoryId)||null} getOptionLabel={factory=>factory.name} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={busy} onChange={(_event,value)=>change('factoryId',value?.id||null)} textFieldProps={{size:'small',required:values.task==='WORK_LOG_ENTRY'}}/>
     <TextField label={t.effectiveFrom} type="date" value={values.effectiveFrom} disabled={busy} onChange={event=>field('effectiveFrom',event.target.value)} size="small" slotProps={{inputLabel:{shrink:true}}}/>
     <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>
      <TextField label={t.dueAfterDays} type="number" value={values.dueAfterDays} disabled={busy} onChange={event=>field('dueAfterDays',Number(event.target.value))} size="small" slotProps={{htmlInput:{min:0,max:30}}}/>
      <TextField label={t.deadlineTime} type="time" value={values.deadlineTime} disabled={busy} onChange={event=>field('deadlineTime',event.target.value)} size="small" slotProps={{inputLabel:{shrink:true}}}/>
     </Box>
     {options('timeZone',['Asia/Ho_Chi_Minh','Asia/Seoul'])}
     <TextField label={t.threshold} type="number" value={values.threshold} disabled={busy} onChange={event=>field('threshold',Number(event.target.value))} size="small" slotProps={{htmlInput:{min:1,max:365}}}/>
     <Box><Typography variant="body2">{t.weekdays}</Typography><Stack direction="row" useFlexGap flexWrap="wrap">{t.week.map((label,index)=><FormControlLabel key={index} label={label} control={<Checkbox checked={values.weekdays.includes(index)} disabled={busy} onChange={(_event,checked)=>field('weekdays',checked?[...values.weekdays,index]:values.weekdays.filter(day=>day!==index))}/>}/>)}</Stack></Box>
    </>:<>
     <TextField label={t.subject} value={values.subject} disabled={busy||final} onChange={event=>field('subject',event.target.value)} size="small" required/>
     <TextField select label={t.rule} value={draft.ruleId||''} disabled={busy||final} onChange={event=>change('ruleId',event.target.value||null)} size="small"><MenuItem value="">{t.none}</MenuItem>{(data?.rules||[]).filter(rule=>rule.employeeId===draft.employeeId&&rule.definition.kind===values.kind).map(rule=><MenuItem key={rule.id} value={rule.id}>{rule.definition.name}</MenuItem>)}</TextField>
     <TextField label={t.basis} value={values.basis} disabled={busy||final} onChange={event=>field('basis',event.target.value)} multiline minRows={3} required/>
    </>}
    <TextField label={t.message} value={values.message} disabled={busy||final} onChange={event=>field('message',event.target.value)} multiline minRows={4} required/>
    {category==='drafts'&&draft.version>0&&!final&&<PageActions><Button disabled={busy||dirty} onClick={()=>save('DISMISSED')}>{t.dismiss}</Button><Button variant="outlined" disabled={busy||dirty} onClick={()=>save('REVIEWED')}>{t.review}</Button></PageActions>}
    {category==='rules'&&<Box sx={{borderTop:1,borderColor:'divider',pt:2}}><Stack spacing={2}>
     <Typography variant="subtitle2">{t.sample}</Typography>
     <TextField label={t.workDate} type="date" value={sample.workDate} disabled={busy} onChange={event=>{setSample({...sample,workDate:event.target.value});setResult(null);}} size="small" slotProps={{inputLabel:{shrink:true}}}/>
     <TextField label={t.submittedAt} type="datetime-local" value={sample.submittedAt} disabled={busy} onChange={event=>{setSample({...sample,submittedAt:event.target.value});setResult(null);}} size="small" slotProps={{inputLabel:{shrink:true}}}/>
     <TextField select label={t.evidenceState} value={sample.evidenceState} disabled={busy} onChange={event=>{setSample({...sample,evidenceState:event.target.value});setResult(null);}} size="small">{['UNKNOWN','VERIFIED','SYSTEM_ERROR'].map(key=><MenuItem key={key} value={key}>{t[key]}</MenuItem>)}</TextField>
     <TextField label={t.matchingCount} type="number" value={sample.matchingCount} disabled={busy} onChange={event=>{setSample({...sample,matchingCount:Number(event.target.value)});setResult(null);}} size="small"/>
     <FormControlLabel label={t.excludedDay} control={<Checkbox checked={sample.excludedDay} disabled={busy} onChange={(_event,checked)=>{setSample({...sample,excludedDay:checked});setResult(null);}}/>}/>
     <Button disabled={busy} onClick={simulate}>{t.preview}</Button>{result&&<Chip role="status" label={t[result.result]}/>}
    </Stack></Box>}
   </Stack></Paper>:<Typography sx={{p:2}} color="text.secondary">{t.noSelection}</Typography>}/>
 </AppPageContainer>;
}
