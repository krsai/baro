import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, List, ListItemButton, Typography, TableContainer, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';
import StatusLabel from '../../components/StatusLabel';
import { INDUSTRY_TREE_TEXT } from '../../constants/industryHierarchy';
import EditIcon from '@mui/icons-material/Edit';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { EXPENSE_TEXT } from '../../constants/expenseTypes';
import OutsourcingServiceDialog, { serviceName, TRANSACTION_TEXT } from '../../components/OutsourcingServiceDialog';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { requestJSON } from '../../utils/apiClient';

export default function ExpenseMasterSettings({ industries = false }) {
  const { languageCode } = useLanguage(), { activeOrgId } = useAuth();
  const text = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko, common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const path = industries ? '/system-setting-defaults/services' : '/expense-types';
  const tree = INDUSTRY_TREE_TEXT[languageCode] || INDUSTRY_TREE_TEXT.en;
  const [types,setTypes] = useState([]), [category,setCategory] = useState(null), [loading,setLoading] = useState(true);
  const [rows,setRows] = useState([]), [form,setForm] = useState(null), [industryId,setIndustryId] = useState(null), [open,setOpen] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const load = async () => {
    setLoading(true);setError('');
    try {
      const [items,parents]=await Promise.all([requestJSON(path,{skipCache:true}),industries?requestJSON('/expense-types',{skipCache:true}):Promise.resolve([])]);
      setRows(items);setTypes(parents);
      if(industries)setCategory(current=>(current===0&&items.some(row=>!row.expenseTypeId)||parents.some(row=>row.id===current))?current:parents[0]?.id||0);
    }catch{setError(common.loadError);}finally{setLoading(false);}
  };
  useEffect(() => { load(); }, [path]);
  const save = async () => {
    setSaving(true); setError('');
    try { await requestJSON(`${path}/${form.id}`, { method: 'PUT', body: JSON.stringify(form) }); setForm(null); await load(); }
    catch { setError(common.error); } finally { setSaving(false); }
  };
  const parents=[...types,...(rows.some(row=>!row.expenseTypeId)?[{id:0,nameKo:tree.unclassified,nameEn:tree.unclassified,nameVi:tree.unclassified}]:[])];
  const selected=parents.find(row=>row.id===category);
  const visible=industries?rows.filter(row=>(row.expenseTypeId||0)===category):rows;
  const table=<TableContainer><Table size="small"><TableHead><TableRow><TableCell>{common.code}</TableCell><TableCell>{industries ? tree.industry : text.type}</TableCell><TableCell>{tree.active}</TableCell><TableCell /></TableRow></TableHead><TableBody>
    {visible.map(row=><TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{serviceName(row,languageCode)}</TableCell><TableCell><StatusLabel tone={row.isActive?'blue':'gray'} label={row.isActive?tree.active:tree.inactive}/></TableCell><TableCell align="right"><IconButton color="primary" aria-label={tree.edit} onClick={()=>{if(industries){setIndustryId(row.id);setOpen(true);}else setForm(row);}}><EditIcon fontSize="small"/></IconButton></TableCell></TableRow>)}
    {!visible.length&&<TableRow><TableCell colSpan={4}>{tree.empty}</TableCell></TableRow>}
  </TableBody></Table></TableContainer>;
  return <AppPageContainer title={industries ? text.industries : text.types} titleActions={industries && <Button variant="contained" disabled={loading||Boolean(error)} onClick={() => { setIndustryId(null); setOpen(true); }}>{common.addIndustry}</Button>}>
    {error&&<Alert severity="error">{error}<Button onClick={load}>{common.loadError}</Button></Alert>}
    {loading?<CircularProgress size={24}/>:industries?<Paper variant="outlined" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'260px minmax(0,1fr)'},overflow:'hidden'}}>
      <Box sx={{p:2,borderRight:{md:1},borderBottom:{xs:1,md:0},borderColor:'divider'}}>
        <Typography variant="subtitle2" sx={{mb:1}}>{tree.category}</Typography>
        <List disablePadding aria-label={tree.category}>{parents.map(parent=><ListItemButton key={parent.id} selected={parent.id===category} onClick={()=>setCategory(parent.id)} sx={{borderRadius:1,mb:.5}}>
          <Typography sx={{flex:1}}>{serviceName(parent,languageCode)}</Typography><Typography variant="caption" color="text.secondary" sx={{mx:1}}>{rows.filter(row=>(row.expenseTypeId||0)===parent.id).length}</Typography><ChevronRight fontSize="small"/>
        </ListItemButton>)}</List>
      </Box>
      <Box sx={{minWidth:0,p:2}}><Stack direction="row" alignItems="center" spacing={1} sx={{mb:2}}><Typography variant="subtitle2">{serviceName(selected,languageCode)}</Typography><ChevronRight fontSize="small" color="disabled"/><Typography variant="subtitle2">{tree.industry}</Typography></Stack>
        {category===0&&<Alert severity="info" sx={{mb:2}}>{tree.review}</Alert>}{table}
      </Box>
    </Paper>:<Paper variant="outlined">{table}</Paper>}
    <OutsourcingServiceDialog systemDefaults partnerIndustryOnly initialServiceId={industryId} initialExpenseTypeId={category||null} open={open} onClose={() => setOpen(false)} onSaved={load} orgId={activeOrgId} languageCode={languageCode} />
    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm"><DialogTitle>{text.type}</DialogTitle><DialogContent>{form && <Stack spacing={2} sx={{ pt: 1 }}>{['nameKo','nameEn','nameVi'].map(key => <TextField key={key} label={common[key]} value={form[key]} disabled={saving} onChange={event => setForm({ ...form, [key]: event.target.value })} />)}<FormControlLabel label={languageCode === 'ko' ? '사용 중' : 'Active'} control={<Checkbox checked={form.isActive} disabled={saving} onChange={event => setForm({ ...form, isActive: event.target.checked })} />} /></Stack>}</DialogContent><DialogActions><Button disabled={saving} onClick={() => setForm(null)}>{common.cancel}</Button><SaveButton loading={saving} disabled={saving || !form || ['nameKo','nameEn','nameVi'].some(key => !form[key].trim())} onClick={save}>{common.save}</SaveButton></DialogActions></Dialog>
  </AppPageContainer>;
}
