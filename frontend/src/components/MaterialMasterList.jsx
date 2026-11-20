import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField} from '@mui/material';
import AppNotice from './AppNotice';
import ExpenseLookupField from './ExpenseLookupField';
import LocalizedNameFields from './LocalizedNameFields';
import SaveButton from './SaveButton';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {useAppActions} from '../context/AppContext';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText,materialItemName,materialItemSpec} from '../constants/materialItems';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
export default function MaterialMasterList({keyword='',open,onClose}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions(),t=materialItemText[languageCode]||materialItemText.en;
 const [rows,setRows]=useState([]),[catalogue,setCatalogue]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState(null);
 const [pending,setPending]=useState(null);
 useUnsavedChanges(Boolean(open&&(form?.baseId||pending)));
 const sequence=useRef(0),scope=useRef(orgId);scope.current=orgId;
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');setRows([]);setCatalogue(null);try{const [items,options]=await Promise.all([requestJSON('/material-items'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/material-items/catalogue'+buildQueryString({orgId}),{skipCache:true})]);if(token!==sequence.current)return;setRows(items);setCatalogue(options);}catch{if(token===sequence.current)setError(t.failed);}finally{if(token===sequence.current)setLoading(false);}},[orgId,t.failed]);
 useEffect(()=>{scope.current=orgId;load();return()=>{sequence.current++;scope.current=null;};},[load]);
 useEffect(()=>{if(open){setPending(null);setForm({key:'material',clientKey:crypto.randomUUID(),baseId:null,unitId:null,details:{}});}},[open,orgId]);
 const registeredBaseIds=new Set(rows.map(row=>row.baseId));
 const availableCodes=(catalogue?.codes||[]).filter(row=>!registeredBaseIds.has(row.baseId));
 const code=catalogue?.codes.find(row=>row.baseId===form?.baseId);
 const selectedUnit=catalogue?.units.find(row=>row.id===form?.unitId);
 const save=async()=>{if(!pending&&(!code||!selectedUnit)){setError(t.invalid);return;}
  const saveScope=orgId;setSaving(true);setError('');try{const industry=code.base.industryLinks.find(link=>link.industry.isActive&&!link.industry.retirement&&link.industry.materialManagement).industry;const payload=pending||{...form,sharedMaster:true,policyAuditId:code.linkPolicyAuditId??null,materialRevision:code.base.materialRevision,industryRevision:industry.materialManagementRevision};setPending(payload);await requestJSON('/material-items'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(payload)});if(scope.current!==saveScope)return;setPending(null);emitWorkspaceDataChanged({orgId,topics:['inventory-movements']});onClose();showNotification?.(t.saved,'success');await load();}catch(e){if(scope.current===saveScope){if([400,403,404,409,422].includes(e.status))setPending(null);setError(e.message==='MATERIAL_ITEM_DUPLICATE'?t.duplicate:e.message==='ACCOUNTING_INDUSTRY_CHANGED'?t.changed:t.failed);}}finally{if(scope.current===saveScope)setSaving(false);}};
 return <Stack spacing={2}>{error&&<AppNotice severity="error" action={<Button onClick={pending?save:load} disabled={loading||saving}>{t.retry}</Button>}>{error}</AppNotice>}<TableContainer><Table size="small"><TableHead><TableRow>{[t.code,t.name,t.spec,t.unit].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.filter(row=>JSON.stringify(row.data).toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase())).map(row=><TableRow key={row.id}><TableCell>{catalogue?.codes.find(c=>c.baseId===row.baseId)?.base.code||row.data.baseSnapshot?.code}</TableCell><TableCell>{materialItemName(row,languageCode)}</TableCell><TableCell>{materialItemSpec(row)||'—'}</TableCell><TableCell>{materialItemName(row.data.unit,languageCode)}</TableCell></TableRow>)}{!loading&&!error&&!rows.length&&<TableRow><TableCell colSpan={4}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>
 <Dialog open={Boolean(open&&form)} onClose={()=>!saving&&!pending&&onClose()} fullWidth maxWidth="md"
   slotProps={{paper:{sx:{maxWidth:760}}}}>
  <DialogTitle>{t.add}</DialogTitle>
  <DialogContent>
   <Stack spacing={2.5} sx={{pt:1.5,pb:1}}>{error&&<AppNotice severity="error">{error}</AppNotice>}<Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:code?'minmax(0,1fr) minmax(140px, 24%)':'minmax(0,1fr)'},gap:2}}><ExpenseLookupField label={t.productSearch} required disabled={saving||Boolean(pending)||!catalogue} languageCode={languageCode} options={availableCodes} value={code||null} getOptionLabel={row=>row.base.code+' · '+materialItemName(row.base,languageCode)} getCode={row=>row.base.code} columns={[{key:'code',label:t.code,value:row=>row.base.code},{key:'name',label:t.name,value:row=>materialItemName(row.base,languageCode)}]} onChange={row=>setForm(current=>({...current,baseId:row?.baseId??null,unitId:row?.base?.materialUnitId??null,details:{}}))}/>{code&&(code.base.materialUnitId?<TextField size="small" label={t.unit} value={materialItemName(selectedUnit,languageCode)} error={!selectedUnit} helperText={!selectedUnit?t.changed:undefined} slotProps={{input:{readOnly:true},inputLabel:{shrink:true}}}/>:<ExpenseLookupField label={t.unit} required languageCode={languageCode} disabled={saving||Boolean(pending)} options={catalogue.units} value={selectedUnit||null} getOptionLabel={row=>materialItemName(row,languageCode)} getCode={row=>row.code} columns={[{key:'code',label:t.code,value:row=>row.code},{key:'name',label:t.unit,value:row=>materialItemName(row,languageCode)}]} onChange={row=>setForm(current=>({...current,unitId:row?.id??null}))}/>)}</Box>{code&&<LocalizedNameFields readOnly value={code.base} languageCode={languageCode}/>}</Stack>
  </DialogContent>
  <DialogActions sx={{borderTop:1,borderColor:'divider'}}>
   <Button variant="outlined" sx={{minWidth:88}} disabled={saving||Boolean(pending)} onClick={onClose}>{t.cancel}</Button>
   <SaveButton loading={saving} disabled={loading||!catalogue} onClick={save}>{t.save}</SaveButton>
  </DialogActions>
 </Dialog>
 </Stack>;
}
