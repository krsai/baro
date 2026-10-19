import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
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
  const [rows,setRows] = useState([]), [form,setForm] = useState(null), [industryId,setIndustryId] = useState(null), [open,setOpen] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const load = () => requestJSON(path, { skipCache: true }).then(setRows).catch(() => setError(common.loadError));
  useEffect(() => { load(); }, [path]);
  const save = async () => {
    setSaving(true); setError('');
    try { await requestJSON(`${path}/${form.id}`, { method: 'PUT', body: JSON.stringify(form) }); setForm(null); await load(); }
    catch { setError(common.error); } finally { setSaving(false); }
  };
  return <AppPageContainer title={industries ? text.industries : text.types} titleActions={industries && <Button variant="contained" onClick={() => { setIndustryId(null); setOpen(true); }}>{common.addIndustry}</Button>}>
    {error && <Alert severity="error">{error}</Alert>}<Paper variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>{common.code}</TableCell><TableCell>{industries ? text.industry : text.type}</TableCell><TableCell>{languageCode === 'ko' ? '사용 설정' : 'Active'}</TableCell><TableCell /></TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{serviceName(row,languageCode)}</TableCell><TableCell>{row.isActive ? '✓' : '—'}</TableCell><TableCell><IconButton color="primary" aria-label={languageCode === 'ko' ? '수정' : 'Edit'} onClick={() => { if (industries) { setIndustryId(row.id); setOpen(true); } else setForm(row); }}><EditIcon fontSize="small" /></IconButton></TableCell></TableRow>)}</TableBody></Table></Paper>
    <OutsourcingServiceDialog systemDefaults partnerIndustryOnly initialServiceId={industryId} open={open} onClose={() => setOpen(false)} onSaved={load} orgId={activeOrgId} languageCode={languageCode} />
    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm"><DialogTitle>{text.type}</DialogTitle><DialogContent>{form && <Stack spacing={2} sx={{ pt: 1 }}>{['nameKo','nameEn','nameVi'].map(key => <TextField key={key} label={common[key]} value={form[key]} disabled={saving} onChange={event => setForm({ ...form, [key]: event.target.value })} />)}<FormControlLabel label={languageCode === 'ko' ? '사용 중' : 'Active'} control={<Checkbox checked={form.isActive} disabled={saving} onChange={event => setForm({ ...form, isActive: event.target.checked })} />} /></Stack>}</DialogContent><DialogActions><Button disabled={saving} onClick={() => setForm(null)}>{common.cancel}</Button><SaveButton loading={saving} disabled={saving || !form || ['nameKo','nameEn','nameVi'].some(key => !form[key].trim())} onClick={save}>{common.save}</SaveButton></DialogActions></Dialog>
  </AppPageContainer>;
}
