import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { getUiMessage } from '../../constants/uiMessages';
import ExpenseLookupField from '../../components/ExpenseLookupField';
import { EXPENSE_LOOKUP_TEXT } from '../../constants/expenseLookup';
import './expenseRequests.css';
import CustomDatePicker from '../../components/CustomDatePicker';
import ExpenseRequestLine from '../../components/ExpenseRequestLine';
import { useManagementPeriod } from '../../context/ManagementPeriodContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import { EXPENSE_REQUEST_TEXT } from '../../constants/expenseRequest';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currencyFormat';
import { expenseDocumentTotals, expenseLinePayload, newExpenseLine } from '../../utils/expenseRequest.mjs';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const ENTRY_TITLES = { ko: '비용 신청 등록', en: 'New expense request', vi: 'Tạo đề nghị chi phí' };

export const REQUEST_FORM_TEXT = EXPENSE_REQUEST_TEXT;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const newDocument = () => { const date = today(); return { title: '', requestDate: date, partnerOrgId: '', currency: 'VND', clientKey: crypto.randomUUID(), items: [newExpenseLine()] }; };

export default function TransactionRequestEntry() {
  const { activeOrgId, user, accessProfile } = useAuth(), { languageCode } = useLanguage();
  const period = useManagementPeriod(), { navigateToPath, showNotification } = useAppActions();
  const labels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const lookup = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const organizationRef = useRef(activeOrgId);
  organizationRef.current = activeOrgId;
  const [form, setForm] = useState(newDocument), [data, setData] = useState({ partners: [], codes: [], orders: [], settings: { defaultVatRate: '10' } });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [submission, setSubmission] = useState(null), [dirty, setDirty] = useState(false), [statuses, setStatuses] = useState({});
  const [saved,setSaved] = useState(false);
  useUnsavedChanges(dirty);
  useEffect(() => { if (saved) navigateToPath('/outsourcing-record', { label: labels.document, closeTabId: '/outsourcing-record/new' }); }, [saved,navigateToPath,labels.document]);
  useEffect(() => { setForm(newDocument()); setDirty(false); setStatuses({}); setSubmission(null); setError(''); setSaving(false); setSaved(false); }, [activeOrgId]);
  useEffect(() => {
    let alive = true; setLoading(true); setLoadError(false);
    const query = buildQueryString({ orgId: activeOrgId });
    Promise.all(['business-partners','transaction-codes','app-settings','orders'].map(path => requestJSON(`/${path}${query}`, { skipCache: true })))
      .then(([partners,codes,settings,orders]) => { if (alive) setData({ partners, codes, settings, orders: orders.filter(row => row.ownerOrgId === Number(activeOrgId)) }); })
      .catch(() => { if (alive) setLoadError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrgId, reload]);
  const update = patch => { setDirty(true); setForm(current => ({ ...current, ...patch })); };
  const changeLine = useCallback((key, patch) => { setDirty(true); setForm(current => ({ ...current, items: current.items.map(line => line.key === key ? { ...line, ...patch } : line) })); }, []);
  const lineStatus = useCallback((key, valid) => setStatuses(current => current[key] === valid ? current : { ...current, [key]: valid }), []);
  const removeLine = key => { setDirty(true); setForm(current => ({ ...current, items: current.items.length === 1 ? [newExpenseLine()] : current.items.filter(line => line.key !== key) })); };
  const totals = useMemo(() => expenseDocumentTotals(form.items, form.currency), [form.items, form.currency]);
  const partner = data.partners.find(row => row.id === form.partnerOrgId);
  const disabled = loading || loadError || saving || Boolean(submission);
  const valid = !period.loading && !period.error && form.title.trim() && form.title.trim().length <= 200 && partner?.isActive &&
    form.requestDate && (!period.startDate || form.requestDate >= period.startDate) && form.items.every(line => statuses[line.key]);
  const money = value => formatCurrency(value, { currencyCode: form.currency, languageCode });
  const close = () => navigateToPath('/outsourcing-record', { label: labels.document, closeTabId: '/outsourcing-record/new' });
  const save = async () => {
    if (saving || !submission && !valid) return;
    const body = submission || { title: form.title, requestDate: form.requestDate, partnerOrgId: form.partnerOrgId, currency: form.currency, clientKey: form.clientKey, items: form.items.map(expenseLinePayload) };
    setSubmission(body); setSaving(true); setError('');
    try {
      await requestJSON(`/expense-requests${buildQueryString({ orgId: activeOrgId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      emitWorkspaceDataChanged({ orgId: activeOrgId, topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD], source: 'transaction-request' });
      if (organizationRef.current !== activeOrgId) return;
      setDirty(false); setSaved(true); showNotification(labels.saved, 'success');
    } catch (failure) {
      if (organizationRef.current !== activeOrgId) return;
      if ([400,403,404,422].includes(failure.status)) { setSubmission(null); setError(labels.invalid); }
      else setError(labels.saveError);
    } finally { if (organizationRef.current === activeOrgId) setSaving(false); }
  };
  return <AppPageContainer
    title={ENTRY_TITLES[languageCode] || ENTRY_TITLES.en}
    titleActions={<Stack direction="row" spacing={1}>
      <Button disabled={saving} onClick={close}>{labels.cancel}</Button>
      <SaveButton loading={saving} disabled={loading || loadError || !submission && !valid} onClick={save}>
        {submission ? labels.retry : getUiMessage('common.save', 'Save', languageCode)}
      </SaveButton>
    </Stack>}
  >
    <Stack spacing={2}>
      {loadError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {period.error && <Alert severity="error">{labels.loadError}</Alert>}
      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2.5 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{p:2}}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{labels.hint}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 2fr) minmax(220px, 1.5fr) 180px 120px' }, gap: 2 }}>
            <TextField size="small" required label={labels.title} disabled={disabled} value={form.title} inputProps={{ maxLength: 200 }} onChange={event => update({ title: event.target.value })} />
            <ExpenseLookupField key={activeOrgId} label={labels.payee} options={data.partners.filter(row => row.isActive)} value={partner || null} onChange={value => update({partnerOrgId:value?.id || ''})} columns={[{key:'name',label:labels.payee,value:row=>row.name}]} languageCode={languageCode} disabled={disabled} required />
            <CustomDatePicker label={labels.date} value={form.requestDate} minDate={period.startDate} adapterLocale={languageCode} disabled={disabled} onChange={(date, context) => { if (date?.isValid() && !context?.validationError) update({ requestDate: date.format('YYYY-MM-DD') }); }} />
            <TextField size="small" select label={labels.currency} disabled={disabled} value={form.currency} onChange={event => update({ currency: event.target.value })}>{['VND','USD','KRW'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mt={2}><TextField size="small" label={lookup.issuer} value={accessProfile?.orgName || '\u2014'} InputProps={{readOnly:true}} /><TextField size="small" label={lookup.author} value={accessProfile?.employeeName || user?.user_metadata?.full_name || user?.email || '\u2014'} InputProps={{readOnly:true}} /></Stack></Box>
        </Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle2">{lookup.details} · {form.items.length} {labels.count}</Typography>{loading && <CircularProgress size={20} />}</Stack>
        <TableContainer><Table size="small" sx={{ minWidth: 1430 }}>
          <TableHead><TableRow>{[['#',36],[labels.code,210],[labels.description,230],[labels.quantity,90],[labels.price,120],[labels.vat,85],[labels.subtotal,130],[labels.tax,120],[labels.total,140],['',100]].map(([label,width],index) => <TableCell key={index} sx={{ minWidth: width }} align={index >= 6 && index <= 8 ? 'right' : 'left'}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{form.items.map((line,index) => <ExpenseRequestLine key={line.key} line={line} index={index} {...data} partner={partner} currency={form.currency} orgId={activeOrgId} labels={labels} languageCode={languageCode} disabled={disabled} onChange={changeLine} onRemove={removeLine} onStatus={lineStatus} />)}</TableBody>
        </Table></TableContainer>
        <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Button startIcon={<Add />} disabled={disabled || form.items.length >= 50} onClick={() => update({ items: [...form.items, newExpenseLine()] })}>{labels.add}</Button><Typography component="span" variant="caption" color="text.secondary" ml={2}>{labels.limit}</Typography></Box>
        <Stack alignItems="flex-end" spacing={1} sx={{ p: 3, bgcolor: 'grey.50' }} data-testid="expense-totals">
          <Stack direction="row" justifyContent="space-between" sx={{ width: { xs: '100%', sm: 360 } }}><Typography color="text.secondary">{labels.subtotal}</Typography><Typography>{money(totals.subtotal)}</Typography></Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ width: { xs: '100%', sm: 360 } }}><Typography color="text.secondary">{labels.tax}</Typography><Typography>{money(totals.vatAmount)}</Typography></Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ width: { xs: '100%', sm: 360 }, pt: 1.5, borderTop: 1, borderColor: 'divider' }}><Typography fontWeight={700}>{labels.total}</Typography><Typography variant="h6" fontWeight={700} color="primary">{money(totals.amount)}</Typography></Stack>
        </Stack>
      {form.items.some(line => data.codes.find(code => code.id === line.transactionCodeId)?.base?.entryMode === 'PROCESS') && <Alert severity="info">{labels.processInfo}</Alert>}
      </Paper>
    </Stack>
  </AppPageContainer>;
}
