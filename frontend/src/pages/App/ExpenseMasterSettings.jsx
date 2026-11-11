import {partnerIndustryLabel} from '../../utils/partnerIndustry.mjs';
import {PARTNER_CLASSIFICATION_TEXT} from '../../utils/partnerClassification.mjs';
import SettingDeleteButton from '../../components/SettingDeleteButton';
import LocalizedNameFields from '../../components/LocalizedNameFields';
import { hasLocalizedName } from '../../utils/localizedName.mjs';
import React, { useCallback,useEffect,useRef,useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography, TableContainer, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import StatusLabel from '../../components/StatusLabel';
import HierarchyPanel from '../../components/HierarchyPanel';
import { INDUSTRY_TREE_TEXT,TRANSACTION_CLASSIFICATION_FLOW } from '../../constants/industryHierarchy';
import EditIcon from '@mui/icons-material/Edit';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { EXPENSE_TEXT } from '../../constants/expenseTypes';
import OutsourcingServiceDialog, { serviceName, TRANSACTION_TEXT } from '../../components/OutsourcingServiceDialog';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import {subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {systemIndustryUsageReason} from '../../utils/systemIndustryUsage.mjs';

export default function ExpenseMasterSettings({ units = false }) {
  const industries=!units;
  const { languageCode } = useLanguage(), { activeOrgId } = useAuth();
  const {active}=useRequestScopeContext();
  const loadSequence=useRef(0);
  const original = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko, common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const unitLabels={ko:{types:'단위 관리',type:'단위',add:'단위 등록'},en:{types:'Units',type:'Unit',add:'Add unit'},vi:{types:'Quản lý đơn vị',type:'Đơn vị',add:'Thêm đơn vị'}}[languageCode]||{types:'Units',type:'Unit',add:'Add unit'};
  const text=units?{...original,...unitLabels}:original;
  const path = units ? '/system-setting-defaults/expense-units' : '/system-setting-defaults/services';
  const tree = INDUSTRY_TREE_TEXT[languageCode] || INDUSTRY_TREE_TEXT.en;
  const rolePath='/system-setting-defaults/partner-roles';
  const roleText=({ko:{add:'구분 등록',edit:'구분 수정'},en:{add:'Add category',edit:'Edit category'},vi:{add:'Thêm nhóm',edit:'Sửa nhóm'}})[languageCode]||{add:'Add category',edit:'Edit category'};
  const [roleForm,setRoleForm]=useState(null),[roleError,setRoleError]=useState('');
  const saveRole=async()=>{
    setSaving(true);setRoleError('');
    try{const {nameEn,nameKo,nameVi}=roleForm;await requestJSON(rolePath+(roleForm.id?'/'+roleForm.id:''),{method:roleForm.id?'PUT':'POST',body:JSON.stringify({nameEn,nameKo,nameVi})});setRoleForm(null);await load();}
    catch{setRoleError(common.error);}finally{setSaving(false);}
  };
  const [types,setTypes] = useState([]), [category,setCategory] = useState(null), [loading,setLoading] = useState(true);
  const [rows,setRows] = useState([]), [form,setForm] = useState(null), [industryId,setIndustryId] = useState(null), [open,setOpen] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const load = useCallback(async () => {
    const sequence=++loadSequence.current;
    setLoading(true);setError('');
    try {
      const [items,parents]=await Promise.all([requestJSON(path,{skipCache:true}),industries?requestJSON('/system-setting-defaults/partner-roles',{skipCache:true}):Promise.resolve([])]);
      if(sequence!==loadSequence.current)return;
      setRows(items);setTypes(parents);
      if(industries)setCategory(current=>parents.some(row=>row.id===current)?current:parents.find(row=>row.code==='PROCESS_OUTSOURCING')?.id||parents[0]?.id||null);
    }catch{if(sequence===loadSequence.current)setError(common.loadError);}finally{if(sequence===loadSequence.current)setLoading(false);}
  },[path,industries,common.loadError]);
  useEffect(() => {if(active)load();return()=>{loadSequence.current++;};}, [active,load]);
  useEffect(()=>subscribeWorkspaceDataChanged(detail=>{
    if(active&&detail?.topics?.some(topic=>['customers','business-partners','accounting-codes'].includes(topic)))load();
  }),[active,load]);
  const save = async () => {
    setSaving(true); setError('');
    try { await requestJSON(`${path}${form.id?'/'+form.id:''}`, { method: form.id?'PUT':'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) }); setForm(null); await load(); }
    catch { setError(common.error); } finally { setSaving(false); }
  };
  const reorder=async(from,to)=>{
    const next=[...types];next.splice(to,0,next.splice(from,1)[0]);setSaving(true);setError('');
    try{await requestJSON('/system-setting-defaults/partner-roles/order',{method:'PUT',body:JSON.stringify({previousIds:types.map(row=>row.id),ids:next.map(row=>row.id)})});setTypes(next);}
    catch{await load();setError(common.error);}finally{setSaving(false);}
  };
  const parents=types;
  const selected=parents.find(row=>row.id===category);
  const visible=industries?rows.filter(row=>(row.partnerRoleId||0)===category&&row.code!=='GENERAL'):rows;
  const table=<TableContainer><Table size="small"><TableHead><TableRow>{units&&<TableCell>{common.code}</TableCell>}<TableCell>{industries ? tree.industry : text.type}</TableCell><TableCell>{tree.active}</TableCell><TableCell /></TableRow></TableHead><TableBody>
    {visible.map((row,index)=><TableRow key={row.id}>{units&&<TableCell>{row.code}</TableCell>}<TableCell>{industries?partnerIndustryLabel(row,languageCode):serviceName(row,languageCode)}</TableCell><TableCell><StatusLabel tone={row.isActive?'blue':'gray'} label={row.isActive?tree.active:tree.inactive}/></TableCell><TableCell align="right"><Stack direction="row" justifyContent="flex-end"><IconButton disabled={saving} color="primary" aria-label={tree.edit} onClick={()=>{if(industries){setIndustryId(row.id);setOpen(true);}else setForm(row);}}><EditIcon fontSize="small"/></IconButton>{industries&&<SettingDeleteButton path={path} id={row.id} name={serviceName(row,languageCode)} used={row.hasUsageHistory!==false} usedReason={systemIndustryUsageReason(row,languageCode)} disabled={loading||Boolean(error)} languageCode={languageCode} onDeleted={load} onError={async message=>{await load();setError(message);}}/>}</Stack></TableCell></TableRow>)}
    {!visible.length&&<TableRow><TableCell colSpan={units?4:3}>{tree.empty}</TableCell></TableRow>}
  </TableBody></Table></TableContainer>;
  return <AppPageContainer title={industries ? text.industries : text.types} titleActions={units?<Button variant="contained" disabled={loading} onClick={()=>setForm({code:'',nameEn:'',nameKo:'',nameVi:'',isActive:true,sortOrder:0})}>{unitLabels.add}</Button>:industries && <Stack direction="row" spacing={1}><Button variant="outlined" disabled={loading||saving} onClick={()=>{setRoleError('');setRoleForm({nameEn:'',nameKo:'',nameVi:''});}}>{roleText.add}</Button><Button variant="contained" disabled={loading||Boolean(error)} onClick={() => { setIndustryId(null); setOpen(true); }}>{common.addIndustry}</Button></Stack>}>
    {industries&&<Typography variant="body2" color="text.secondary" sx={{mb:2}}>{TRANSACTION_CLASSIFICATION_FLOW[languageCode]||TRANSACTION_CLASSIFICATION_FLOW.en}</Typography>}
    {error&&<Alert severity="error">{error}<Button onClick={load}>{common.loadError}</Button></Alert>}
    {loading?<CircularProgress size={24}/>:industries?<HierarchyPanel label={tree.category} items={parents.map(parent=>({id:parent.id,label:serviceName(parent,languageCode),count:rows.filter(row=>(row.partnerRoleId||0)===parent.id&&row.code!=='GENERAL').length}))} selectedId={category} onSelect={setCategory} onReorder={reorder} reorderDisabled={saving||loading}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{mb:2}}><Typography variant="subtitle2">{serviceName(selected,languageCode)}</Typography><ChevronRight fontSize="small" color="disabled"/><Typography variant="subtitle2">{tree.industry}</Typography></Stack>
      {selected&&<Stack direction="row" spacing={1} justifyContent="flex-end" sx={{mb:1}}><Button disabled={saving} onClick={()=>{setRoleError('');setRoleForm({...selected});}}>{roleText.edit}</Button><SettingDeleteButton path={rolePath} id={selected.id} name={serviceName(selected,languageCode)} used={rows.some(row=>row.partnerRoleId===selected.id)} disabled={saving||loading} languageCode={languageCode} onDeleted={load} onError={setError}/></Stack>}
      {table}
      {rows.some(row=>row.code==='GENERAL'&&row.partnerRoleId===category)&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>{(PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en).legacy}: GENERAL</Typography>}
    </HierarchyPanel>:<Paper variant="outlined">{table}</Paper>}
    <OutsourcingServiceDialog systemDefaults partnerIndustryOnly initialServiceId={industryId} initialPartnerRoleId={category||null} open={open} onClose={() => setOpen(false)} onSaved={load} orgId={activeOrgId} languageCode={languageCode} />
    <Dialog open={Boolean(roleForm)} onClose={()=>!saving&&setRoleForm(null)} fullWidth maxWidth="sm"><DialogTitle>{roleForm?.id?roleText.edit:roleText.add}</DialogTitle><DialogContent>{roleForm&&<Stack spacing={2} sx={{pt:1}}>{roleError&&<Alert severity="error">{roleError}</Alert>}<LocalizedNameFields value={roleForm} languageCode={languageCode} disabled={saving} onChange={(key,value)=>setRoleForm(prev=>({...prev,[key]:value}))}/></Stack>}</DialogContent><DialogActions><SaveButton loading={saving} disabled={!roleForm||!hasLocalizedName(roleForm)} onClick={saveRole}>{common.save}</SaveButton></DialogActions></Dialog>
    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm"><DialogTitle>{text.type}</DialogTitle><DialogContent>{form && <Stack spacing={2} sx={{ pt: 1 }}>{<TextField label={common.code} required value={form.code} disabled={saving} onChange={event=>setForm({...form,code:event.target.value.toUpperCase()})}/>}<LocalizedNameFields value={form} languageCode={languageCode} disabled={saving} onChange={(key, value) => setForm(prev => ({ ...prev, [key]: value }))} /><FormControlLabel label={languageCode === 'ko' ? '사용 중' : 'Active'} control={<Checkbox checked={form.isActive} disabled={saving} onChange={event => setForm({ ...form, isActive: event.target.checked })} />} /></Stack>}</DialogContent><DialogActions><SaveButton loading={saving} disabled={saving || !form || (!hasLocalizedName(form)||units&&!/^[A-Z][A-Z0-9_]{0,29}$/.test(form.code))} onClick={save}>{common.save}</SaveButton></DialogActions></Dialog>
  </AppPageContainer>;
}
