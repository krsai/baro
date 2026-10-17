import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import ExpenseRequestView, { expenseRequestNumber } from '../../components/ExpenseRequestView';
import { EXPENSE_REQUEST_TEXT } from '../../constants/expenseRequest';
import { formatCurrency } from '../../utils/currencyFormat';
import AppPageContainer from '../../components/AppPageContainer';
import SearchInput from '../../components/SearchInput';
import PageToolbar from '../../components/PageToolbar';
import MonthRangeSelector from '../../components/MonthRangeSelector';
import dayjs from 'dayjs';
import { TRANSACTION_TEXT, OUTSOURCING_REQUEST_TEXT, serviceName } from '../../components/OutsourcingServiceDialog';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { subscribeWorkspaceDataChanged } from '../../utils/workspaceDataEvents';

export default function PartnerTransactionCosts({ onNewRequest, onOpenHistorical, onPreview, previewLabel }) {
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const labels = { ...(TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko), ...(OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko) };
  const documentLabels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const [documents,setDocuments] = useState([]), [view,setView] = useState('documents'), [selected,setSelected] = useState(null);
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => dayjs().startOf('month'));
  const [dateTo, setDateTo] = useState(() => dayjs().endOf('month').startOf('day'));
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setRows([]); setDocuments([]); setSelected(null);
    setLoading(true); setError('');
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const [items, requests] = await Promise.all([requestJSON(`/outsourcing-requests${query}`, { skipGlobalLoading: true, skipCache: true }), requestJSON(`/expense-requests${query}`, { skipGlobalLoading: true, skipCache: true })]);
      if (sequence === loadSequence.current) { setRows(items); setDocuments(requests); }
    }
    catch { if (sequence === loadSequence.current) setError(labels.loadError); } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [activeOrgId, labels.loadError]);
  useEffect(() => { load(); return () => { loadSequence.current++; }; }, [load]);
  useEffect(() => subscribeWorkspaceDataChanged(detail => { if (['transaction-request', 'business-partner'].includes(detail?.source) && Number(detail.orgId) === Number(activeOrgId)) load(); }), [activeOrgId, load]);
  const filtered = useMemo(() => rows.filter(row => row.transactionDate >= dateFrom.format('YYYY-MM-DD') && row.transactionDate <= dateTo.format('YYYY-MM-DD') && [row.partner?.name, serviceName(row.serviceType, languageCode), row.transactionCode?.code, row.description, row.workOrder?.orderNumber].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [rows, search, languageCode, dateFrom, dateTo]);
  const filteredDocuments = useMemo(() => documents.filter(row => row.requestDate >= dateFrom.format('YYYY-MM-DD') && row.requestDate <= dateTo.format('YYYY-MM-DD') && [expenseRequestNumber(row.id),row.title,row.partner?.name,row.createdByEmployee?.name,...row.items.flatMap(item => [item.description,item.transactionCode?.code,item.workOrder?.orderNumber])].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [documents, search, dateFrom, dateTo]);
  const changeDate = (setter) => (value, context) => {
    if (!value?.isValid?.() || context?.validationError) return;
    if (setter === setDateFrom && value.isAfter(dateTo, 'day')) return;
    if (setter === setDateTo && value.isBefore(dateFrom, 'day')) return;
    setter(value.startOf('day'));
  };
  const shiftRange = (amount) => {
    setDateFrom(current => current.add(amount, 'month').startOf('month'));
    setDateTo(current => current.add(amount, 'month').endOf('month').startOf('day'));
  };
  const money = (value, currency) => formatCurrency(value, { currencyCode: currency, languageCode });
  return <AppPageContainer title={labels.costs} titleActions={<Stack direction="row" spacing={1}>{onPreview && <Button variant="outlined" onClick={onPreview}>{previewLabel}</Button>}<Button variant="contained" disabled={loading || Boolean(error)} onClick={onNewRequest}>{labels.addCost}</Button></Stack>} toolbar={<PageToolbar left={<SearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder={labels.search} />} right={<MonthRangeSelector monthOnly={false} languageCode={languageCode} startValue={dateFrom} endValue={dateTo} onStartChange={changeDate(setDateFrom)} onEndChange={changeDate(setDateTo)} onShift={shiftRange} />} />}>
    <Stack spacing={2}><Tabs value={view} onChange={(_,value) => setView(value)}><Tab value="documents" label={documentLabels.documentList} /><Tab value="items" label={documentLabels.all} /></Tabs><ExpenseRequestView document={selected} languageCode={languageCode} onClose={() => setSelected(null)} />{error && <Alert severity="error" action={<Button onClick={load}>{documentLabels.retryLoad}</Button>}>{error}</Alert>}{loading ? <Box textAlign="center"><CircularProgress /></Box> : error ? null : view === 'documents' ? <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{[documentLabels.numbering,documentLabels.title,documentLabels.payee,documentLabels.date,documentLabels.applicant,documentLabels.items,documentLabels.total].map(label => <TableCell key={label} sx={{ fontWeight: 700 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
      {!filteredDocuments.length && <TableRow><TableCell colSpan={7} align="center">{documentLabels.empty}</TableCell></TableRow>}
      {filteredDocuments.map(document => <TableRow key={document.id} hover>
        <TableCell><Button size="small" onClick={() => setSelected(document)}>{expenseRequestNumber(document.id)}</Button></TableCell><TableCell><Button size="small" color="inherit" onClick={() => setSelected(document)} sx={{ textAlign: 'left', justifyContent: 'flex-start' }}>{document.title}</Button></TableCell><TableCell>{document.partner?.name}</TableCell><TableCell>{document.requestDate}</TableCell><TableCell>{document.createdByEmployee?.name}</TableCell><TableCell>{document.items.length}</TableCell><TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{money(document.amount,document.currency)}</TableCell>
      </TableRow>)}
    </TableBody></Table></TableContainer> : <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{['date','partner','industry','description','order','amount','creator'].map(key => <TableCell key={key}>{labels[key]}</TableCell>)}</TableRow></TableHead><TableBody>
      {!filtered.length && <TableRow><TableCell colSpan={7} align="center">{labels.empty}</TableCell></TableRow>}
      {filtered.map(row => <TableRow key={row.id} hover={Boolean(row.workLogId)} onClick={() => row.workLogId && onOpenHistorical?.(row.workLogId)} sx={{ cursor: row.workLogId ? 'pointer' : 'default' }}>
        <TableCell>{row.transactionDate}</TableCell><TableCell>{row.partner?.name}</TableCell><TableCell>{row.sourceKind === 'HISTORICAL_WORK_RECORD' ? labels.process : serviceName(row.serviceType, languageCode)}</TableCell>
        <TableCell>{row.description}{row.transactionCode && <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{row.transactionCode.code} · {row.unitPrice} × {row.quantity} · VAT {row.vatRate}% ({money(row.vatAmount, row.currency)})</Box>}{row.style && <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{row.style.name} · {row.styleProcess?.processName}</Box>}{Object.entries(row.details || {}).filter(([, value]) => value).map(([key,value]) => <Box key={key} sx={{ color: 'text.secondary', fontSize: 12 }}>{labels[key]}: {value}</Box>)}</TableCell>
        <TableCell>{row.workOrder?.orderNumber || '-'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{money(row.amount, row.currency)}</TableCell><TableCell>{row.createdByEmployee?.name}</TableCell>
      </TableRow>)}
    </TableBody></Table></TableContainer>}</Stack>
  </AppPageContainer>;
}
