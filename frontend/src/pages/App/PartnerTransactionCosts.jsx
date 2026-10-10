import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SearchInput from '../../components/SearchInput';
import { TRANSACTION_TEXT, OUTSOURCING_REQUEST_TEXT, serviceName } from '../../components/OutsourcingServiceDialog';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';

const initialForm = () => ({ partnerOrgId: '', serviceTypeId: '', workOrderId: '', transactionDate: '', description: '', amount: '', currency: 'VND', details: {}, clientKey: crypto.randomUUID() });
export default function PartnerTransactionCosts({ unified = false, onProcessRequest, onOpenHistorical } = {}) {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const baseLabels = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const requestLabels = OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko;
  const labels = unified ? { ...baseLabels, ...requestLabels } : baseLabels;
  const [rows, setRows] = useState([]), [partners, setPartners] = useState([]), [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const results = await Promise.all([requestJSON(`${unified ? '/outsourcing-requests' : '/partner-transaction-costs'}${query}`, { skipGlobalLoading: true, skipCache: true }), requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId, type: 'PROCESS_OUTSOURCING' })}`, { skipGlobalLoading: true }), requestJSON(`/orders${query}`, { skipGlobalLoading: true })]);
      setRows(results[0]); setPartners(results[1]); setOrders(Array.isArray(results[2]) ? results[2] : results[2]?.orders || []);
    } catch { setError(labels.loadError); } finally { setLoading(false); }
  }, [activeOrgId, labels.loadError, unified]);
  useEffect(() => { load(); }, [load]);
  const options = partners.filter(partner => partner.isActive && partner.serviceTypes?.some(service => service.isActive && (unified || service.entryMode !== 'PROCESS')));
  const selectedPartner = options.find(partner => partner.id === form.partnerOrgId);
  const services = selectedPartner?.serviceTypes?.filter(service => service.isActive && (unified || service.entryMode !== 'PROCESS')) || [];
  const selectedService = services.find(service => service.id === form.serviceTypeId);
  const isProcess = selectedService?.entryMode === 'PROCESS';
  const required = selectedService?.requiredFields || [];
  const fields = selectedService?.entryMode === 'LOGISTICS' ? ['transportDate', 'origin', 'destination', 'reference'] : required;
  const filtered = useMemo(() => rows.filter(row => [row.partner?.name, serviceName(row.serviceType, languageCode), row.description, row.workOrder?.orderNumber].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [rows, search, languageCode]);
  const valid = selectedService && form.transactionDate && form.description.trim() && /^\d+(\.\d{1,2})?$/.test(form.amount) && Number(form.amount) > 0 && (form.currency === 'USD' || Number.isInteger(Number(form.amount))) && required.every(key => form.details[key]?.trim());
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setFormError('');
    try {
      await requestJSON(`/partner-transaction-costs${buildQueryString({ orgId: activeOrgId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, workOrderId: form.workOrderId || null }) });
      setOpen(false); await load();
    } catch { setFormError(labels.error); } finally { setSaving(false); }
  };
  const locale = languageCode === 'vi' ? 'vi-VN' : languageCode === 'en' ? 'en-US' : 'ko-KR';
  return <AppPageContainer title={labels.costs} titleActions={<Button variant="contained" disabled={loading || Boolean(error)} onClick={() => { setForm(initialForm()); setFormError(''); setOpen(true); }}>{labels.addCost}</Button>} toolbar={<SearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder={labels.search} />}>
    <Stack spacing={2}><Alert severity="info">{labels.help}</Alert>{error && <Alert severity="error">{error}</Alert>}
      {loading ? <Box textAlign="center"><CircularProgress /></Box> : <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{['date', 'partner', 'industry', 'description', 'order', 'amount', 'creator'].map(key => <TableCell key={key}>{labels[key]}</TableCell>)}</TableRow></TableHead><TableBody>
        {!filtered.length && <TableRow><TableCell colSpan={7} align="center">{labels.empty}</TableCell></TableRow>}
        {filtered.map(row => <TableRow key={row.id} hover={Boolean(row.workLogId)} onClick={() => row.workLogId && onOpenHistorical?.(row.workLogId)} sx={{ cursor: row.workLogId ? 'pointer' : 'default' }}><TableCell>{row.transactionDate}</TableCell><TableCell>{row.partner?.name}</TableCell><TableCell>{row.sourceKind === 'HISTORICAL_WORK_RECORD' ? <Stack>{labels.process}<Box sx={{ color: 'text.secondary', fontSize: 12 }}>{requestLabels.historical}</Box></Stack> : serviceName(row.serviceType, languageCode)}</TableCell><TableCell>{row.description}{Object.entries(row.details || {}).filter(([, value]) => value).map(([key, value]) => <Box key={key} sx={{ color: 'text.secondary', fontSize: 12 }}>{labels[key]}: {value}</Box>)}</TableCell><TableCell>{row.workOrder?.orderNumber || '-'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{new Intl.NumberFormat(locale, { style: 'currency', currency: row.currency }).format(Number(row.amount))}</TableCell><TableCell>{row.createdByEmployee?.name}</TableCell></TableRow>)}
      </TableBody></Table></TableContainer>}
    </Stack>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{labels.addCost}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {formError && <Alert severity="error">{formError}</Alert>}
      {!options.length && <Alert severity="info">{labels.adminHelp}</Alert>}
      <TextField select required label={labels.partner} value={form.partnerOrgId} onChange={event => setForm({ ...form, partnerOrgId: event.target.value, serviceTypeId: '', details: {} })}>{options.map(partner => <MenuItem key={partner.id} value={partner.id}>{partner.name}</MenuItem>)}</TextField>
      <TextField select required disabled={!selectedPartner} label={labels.industry} value={form.serviceTypeId} onChange={event => setForm({ ...form, serviceTypeId: event.target.value, details: {} })}>{services.map(service => <MenuItem key={service.id} value={service.id}>{serviceName(service, languageCode)}</MenuItem>)}</TextField>
      {isProcess ? <Alert severity="info">{requestLabels.processHelp}</Alert> : <>
      <TextField required type="date" label={labels.date} slotProps={{ inputLabel: { shrink: true } }} value={form.transactionDate} onChange={update('transactionDate')} />
      <TextField required multiline label={labels.description} value={form.description} onChange={update('description')} />
      <Stack direction="row" spacing={2}><TextField required label={labels.amount} value={form.amount} onChange={update('amount')} inputProps={{ inputMode: 'decimal' }} /><TextField select label={labels.currency} value={form.currency} onChange={update('currency')}>{['VND', 'USD', 'KRW'].map(currency => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}</TextField></Stack>
      {fields.map(key => <TextField key={key} required={required.includes(key)} type={key === 'transportDate' ? 'date' : 'text'} slotProps={key === 'transportDate' ? { inputLabel: { shrink: true } } : {}} label={labels[key]} value={form.details[key] || ''} onChange={event => setForm({ ...form, details: { ...form.details, [key]: event.target.value } })} />)}
      <TextField select label={labels.order} value={form.workOrderId} onChange={update('workOrderId')}><MenuItem value="">{labels.none}</MenuItem>{orders.map(order => <MenuItem key={order.dbId} value={order.dbId}>{order.orderNumber}</MenuItem>)}</TextField>
      </>}
    </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => setOpen(false)}>{labels.cancel}</Button><Button disabled={saving || (isProcess ? !onProcessRequest : !valid)} variant="contained" onClick={isProcess ? () => { setOpen(false); onProcessRequest?.({ partner: selectedPartner, serviceType: selectedService }); } : save}>{isProcess ? requestLabels.next : labels.save}</Button></DialogActions></Dialog>
  </AppPageContainer>;
}
