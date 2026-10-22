import React, {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EntityDetailSection from './EntityDetailSection';
import DeleteActionButton from './DeleteActionButton';
import StatusLabel from './StatusLabel';
import {useAuth} from '../context/AuthContext';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function EntityBankAccounts({entityId,orgId,languageCode='ko',onAccountsChange}) {
 const {activeOrgId}=useAuth(),scope=orgId || activeOrgId || entityId,labels=ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
 const [data,setData]=useState({accounts:[],currencies:[]}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
 const callback=useRef(onAccountsChange);callback.current=onAccountsChange;
 const scopeRef=useRef('');scopeRef.current=`${scope}:${entityId}`;
 const query=buildQueryString({orgId:scope}),path=`/entities/${entityId}/bank-accounts`;
 useEffect(()=>{setDraft(null);setData({accounts:[],currencies:[]});if(!entityId)return;let alive=true;setLoading(true);setError('');
  requestJSON(`${path}${query}`,{skipCache:true}).then(result=>{if(alive){setData(result);callback.current?.(result.accounts);}}).catch(()=>{if(alive)setError(labels.error);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[entityId,scope,reload]);
 const save=async value=>{if(saving)return;const token=scopeRef.current;setSaving(true);setError('');try{
  await requestJSON(`${path}${value.id?`/${encodeURIComponent(value.id)}`:''}${query}`,{method:value.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(token!==scopeRef.current)return;setDraft(null);setReload(n=>n+1);emitWorkspaceDataChanged({orgId:scope,topics:['business-partners'],source:'business-partner'});
 }catch{if(token===scopeRef.current)setError(labels.error);}finally{if(token===scopeRef.current)setSaving(false);}};
 const valid=draft && draft.currencyId && ['bankName','accountNumber','accountHolder'].every(key=>draft[key]?.trim());
 return <EntityDetailSection title={labels.banks}>
  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{mb:2}}><Typography variant="caption" color="text.secondary">{labels.help}</Typography><Button disabled={!entityId||loading||saving} onClick={()=>setDraft({bankName:'',accountNumber:'',accountHolder:'',currencyId:data.currencies.find(row=>row.code==='VND')?.id || data.currencies[0]?.id || '',isActive:true,isDefault:false})}>{labels.add}</Button></Stack>
  {error && <Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{labels.settings}</Button>}>{error}</Alert>}
  {!entityId ? <Typography color="text.secondary">{labels.firstSave}</Typography> : loading ? <CircularProgress size={20} /> : <TableContainer><Table size="small" sx={{minWidth:650}}><TableHead><TableRow>{[labels.currency,labels.bank,labels.number,labels.holder,labels.default,''].map((label,i)=><TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
   {data.accounts.map(account=><TableRow key={account.id} sx={{opacity:account.isActive?1:.55}}><TableCell>{account.currency.code}</TableCell><TableCell>{account.bankName}</TableCell><TableCell>{account.accountNumber}</TableCell><TableCell>{account.accountHolder}</TableCell><TableCell>{!account.isActive?<StatusLabel tone="gray" label={labels.inactive}/>:account.isDefault?<StatusLabel tone="blue" label={labels.default}/>:<Button disabled={saving} onClick={()=>save({...account,isDefault:true})}>{labels.setDefault}</Button>}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}><Button aria-label={labels.edit} disabled={saving} onClick={()=>setDraft({...account})} sx={{minWidth:32,p:0.5}}><EditOutlined fontSize="small"/></Button><DeleteActionButton title={labels.deactivate} disabled={saving||!account.isActive} onClick={()=>save({...account,isActive:false})}/></TableCell></TableRow>)}
   {!data.accounts.length && <TableRow><TableCell colSpan={6}>{labels.empty}</TableCell></TableRow>}
  </TableBody></Table></TableContainer>}
  <Dialog open={Boolean(draft)} onClose={()=>!saving&&setDraft(null)} scroll="paper" fullWidth maxWidth="sm" PaperProps={{sx:{m:{xs:1,sm:3},maxHeight:{xs:"calc(100dvh - 16px)",sm:"calc(100dvh - 48px)"},overflow:"hidden"}}}><DialogTitle sx={{flexShrink:0}}>{draft?.id?labels.edit:labels.add}</DialogTitle><DialogContent dividers sx={{minHeight:0,overflowY:"auto"}}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2,pt:1}}>
   <TextField select label={labels.currency} value={draft?.currencyId||''} disabled={saving} onChange={e=>setDraft({...draft,currencyId:Number(e.target.value)})}>{data.currencies.map(row=><MenuItem key={row.id} value={row.id}>{row.code}</MenuItem>)}</TextField>
   {['bankName','accountNumber','accountHolder'].map((key,index)=><TextField key={key} required disabled={saving} label={labels[['bank','number','holder'][index]]} value={draft?.[key]||''} inputProps={{maxLength:{bankName:120,accountNumber:100,accountHolder:160}[key]}} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>)}
   <FormControlLabel control={<Checkbox disabled={saving||!draft?.isActive} checked={Boolean(draft?.isDefault)} onChange={e=>setDraft({...draft,isDefault:e.target.checked})}/>} label={labels.default}/><FormControlLabel control={<Checkbox disabled={saving} checked={Boolean(draft?.isActive)} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/>} label={labels.active}/>
  </Box>{error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}</DialogContent><DialogActions sx={{flexShrink:0}}><Button disabled={saving} onClick={()=>setDraft(null)}>{labels.cancel}</Button><Button variant="contained" disabled={!valid||saving} onClick={()=>save(draft)}>{labels.save}</Button></DialogActions></Dialog>
 </EntityDetailSection>;
}
