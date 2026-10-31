import CatalogueOrderButtons from '../../components/CatalogueOrderButtons';
import {partnerIndustryLabel} from '../../utils/partnerIndustry.mjs';
import SettingDeleteButton from '../../components/SettingDeleteButton';
import LocalizedNameFields from '../../components/LocalizedNameFields';
import { hasLocalizedName } from '../../utils/localizedName.mjs';
import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography, TableContainer, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import StatusLabel from '../../components/StatusLabel';
import HierarchyPanel from '../../components/HierarchyPanel';
import { INDUSTRY_TREE_TEXT } from '../../constants/industryHierarchy';
import EditIcon from '@mui/icons-material/Edit';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { EXPENSE_TEXT } from '../../constants/expenseTypes';
import OutsourcingServiceDialog, { serviceName, TRANSACTION_TEXT } from '../../components/OutsourcingServiceDialog';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';

export default function ExpenseMasterSettings({ industries = false, units = false }) {
  const { languageCode } = useLanguage(), { activeOrgId } = useAuth();
  const original = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko, common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const unitLabels={ko:{types:'단위 관리',type:'단위',add:'단위 등록'},en:{types:'Units',type:'Unit',add:'Add unit'},vi:{types:'Quản lý đơn vị',type:'Đơn vị',add:'Thêm đơn vị'}}[languageCode]||{types:'Units',type:'Unit',add:'Add unit'};
  const text=units?{...original,...unitLabels}:original;
  const path = units ? '/system-setting-defaults/expense-units' : industries ? '/system-setting-defaults/services' : '/expense-types';
  const tree = INDUSTRY_TREE_TEXT[languageCode] || INDUSTRY_TREE_TEXT.en;
  const [types,setTypes] = useState([]), [category,setCategory] = useState(null), [loading,setLoading] = useState(true);
  const [rows,setRows] = useState([]), [form,setForm] = useState(null), [industryId,setIndustryId] = useState(null), [open,setOpen] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const load = async () => {
    setLoading(true);setError('');
    try {
      const [items,parents]=await Promise.all([requestJSON(industries||units ? path : '/system-setting-defaults/expense-types',{skipCache:true}),industries?requestJSON('/system-setting-defaults/partner-roles',{skipCache:true}):Promise.resolve([])]);
      setRows(items);setTypes(parents);
      if(industries)setCategory(current=>parents.some(row=>row.id===current)?current:parents.find(row=>row.code==='PROCESS_OUTSOURCING')?.id||parents[0]?.id||null);
    }catch{setError(common.loadError);}finally{setLoading(false);}
  };
  useEffect(() => { load(); }, [path]);
  const save = async () => {
    setSaving(true); setError('');
    try { await requestJSON(`${path}${form.id?'/'+form.id:''}`, { method: form.id?'PUT':'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) }); setForm(null); await load(); }
    catch { setError(common.error); } finally { setSaving(false); }
  };
  const reorder=async(index,direction,roles=false)=>{
    const current=roles?types:rows,next=[...current];[next[index],next[index+direction]]=[next[index+direction],next[index]];
    setSaving(true);setError('');
    try{await requestJSON(roles?'/system-setting-defaults/partner-roles/order':'/expense-types/order',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({previousIds:current.map(row=>row.id),ids:next.map(row=>row.id)})});if(roles)setTypes(next);else setRows(next);}
    catch{await load();setError(common.error);}finally{setSaving(false);}
  };
  const parents=types;
  const selected=parents.find(row=>row.id===category);
  const visible=industries?rows.filter(row=>(row.partnerRoleId||0)===category):rows;
  const table=<TableContainer><Table size="small"><TableHead><TableRow><TableCell>{common.code}</TableCell><TableCell>{industries ? tree.industry : text.type}</TableCell><TableCell>{tree.active}</TableCell><TableCell /></TableRow></TableHead><TableBody>
    {visible.map((row,index)=><TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{industries?partnerIndustryLabel(row,languageCode):serviceName(row,languageCode)}</TableCell><TableCell><StatusLabel tone={row.isActive?'blue':'gray'} label={row.isActive?tree.active:tree.inactive}/></TableCell><TableCell align="right"><Stack direction="row" justifyContent="flex-end">{!industries&&!units&&<CatalogueOrderButtons label={serviceName(row,languageCode)} index={index} count={visible.length} disabled={saving||loading} languageCode={languageCode} onMove={reorder}/>}<IconButton disabled={saving} color="primary" aria-label={tree.edit} onClick={()=>{if(industries){setIndustryId(row.id);setOpen(true);}else setForm(row);}}><EditIcon fontSize="small"/></IconButton>{industries&&<SettingDeleteButton path={path} id={row.id} name={serviceName(row,languageCode)} used={row.hasUsageHistory} disabled={loading} languageCode={languageCode} onDeleted={load} onError={async message=>{await load();setError(message);}}/>}</Stack></TableCell></TableRow>)}
    {!visible.length&&<TableRow><TableCell colSpan={4}>{tree.empty}</TableCell></TableRow>}
  </TableBody></Table></TableContainer>;
  return <AppPageContainer title={industries ? text.industries : text.types} titleActions={units?<Button variant="contained" disabled={loading} onClick={()=>setForm({code:'',nameEn:'',nameKo:'',nameVi:'',isActive:true,sortOrder:0})}>{unitLabels.add}</Button>:industries && <Button variant="contained" disabled={loading||Boolean(error)} onClick={() => { setIndustryId(null); setOpen(true); }}>{common.addIndustry}</Button>}>
    {error&&<Alert severity="error">{error}<Button onClick={load}>{common.loadError}</Button></Alert>}
    {loading?<CircularProgress size={24}/>:industries?<HierarchyPanel label={tree.category} items={parents.map((parent,index)=>({id:parent.id,label:serviceName(parent,languageCode),actions:<CatalogueOrderButtons label={serviceName(parent,languageCode)} index={index} count={parents.length} disabled={saving||loading} languageCode={languageCode} onMove={(i,d)=>reorder(i,d,true)}/>,count:rows.filter(row=>(row.partnerRoleId||0)===parent.id).length}))} selectedId={category} onSelect={setCategory}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{mb:2}}><Typography variant="subtitle2">{serviceName(selected,languageCode)}</Typography><ChevronRight fontSize="small" color="disabled"/><Typography variant="subtitle2">{tree.industry}</Typography></Stack>
      {table}
    </HierarchyPanel>:<Paper variant="outlined">{table}</Paper>}
    <OutsourcingServiceDialog systemDefaults partnerIndustryOnly initialServiceId={industryId} initialPartnerRoleId={category||null} open={open} onClose={() => setOpen(false)} onSaved={load} orgId={activeOrgId} languageCode={languageCode} />
    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm"><DialogTitle>{text.type}</DialogTitle><DialogContent>{form && <Stack spacing={2} sx={{ pt: 1 }}>{<TextField label={common.code} required value={form.code} disabled={saving} onChange={event=>setForm({...form,code:event.target.value.toUpperCase()})}/>}<LocalizedNameFields value={form} languageCode={languageCode} disabled={saving} onChange={(key, value) => setForm(prev => ({ ...prev, [key]: value }))} /><FormControlLabel label={languageCode === 'ko' ? '사용 중' : 'Active'} control={<Checkbox checked={form.isActive} disabled={saving} onChange={event => setForm({ ...form, isActive: event.target.checked })} />} /></Stack>}</DialogContent><DialogActions><Button disabled={saving} onClick={() => setForm(null)}>{common.cancel}</Button><SaveButton loading={saving} disabled={saving || !form || (!hasLocalizedName(form)||units&&!/^[A-Z][A-Z0-9_]{0,29}$/.test(form.code))} onClick={save}>{common.save}</SaveButton></DialogActions></Dialog>
  </AppPageContainer>;
}
