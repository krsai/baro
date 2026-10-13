import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
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

export default function PartnerTransactionCosts({ onNewRequest, onOpenHistorical, onPreview }) {
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const labels = { ...(TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko), ...(OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko) };
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => dayjs().startOf('month'));
  const [dateTo, setDateTo] = useState(() => dayjs().endOf('month').startOf('day'));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await requestJSON(`/outsourcing-requests${buildQueryString({ orgId: activeOrgId })}`, { skipGlobalLoading: true, skipCache: true })); }
    catch { setError(labels.loadError); } finally { setLoading(false); }
  }, [activeOrgId, labels.loadError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeWorkspaceDataChanged(detail => { if (['transaction-request', 'business-partner'].includes(detail?.source) && Number(detail.orgId) === Number(activeOrgId)) load(); }), [activeOrgId, load]);
  const filtered = useMemo(() => rows.filter(row => row.transactionDate >= dateFrom.format('YYYY-MM-DD') && row.transactionDate <= dateTo.format('YYYY-MM-DD') && [row.partner?.name, serviceName(row.serviceType, languageCode), row.transactionCode?.code, row.description, row.workOrder?.orderNumber].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [rows, search, languageCode, dateFrom, dateTo]);
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
  const locale = languageCode === 'vi' ? 'vi-VN' : languageCode === 'en' ? 'en-US' : 'ko-KR';
  const money = (value, currency) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value));
  return <AppPageContainer title={labels.costs} titleActions={<Stack direction="row" spacing={1}>{onPreview && <Button variant="outlined" onClick={onPreview}>{languageCode === 'ko' ? 'UI 미리보기' : languageCode === 'vi' ? 'Xem UI' : 'UI preview'}</Button>}<Button variant="contained" disabled={loading || Boolean(error)} onClick={onNewRequest}>{labels.addCost}</Button></Stack>} toolbar={<PageToolbar left={<SearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder={labels.search} />} right={<MonthRangeSelector monthOnly={false} languageCode={languageCode} startValue={dateFrom} endValue={dateTo} onStartChange={changeDate(setDateFrom)} onEndChange={changeDate(setDateTo)} onShift={shiftRange} />} />}>
    <Stack spacing={2}>{error && <Alert severity="error">{error}</Alert>}{loading ? <Box textAlign="center"><CircularProgress /></Box> : <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{['date','partner','industry','description','order','amount','creator'].map(key => <TableCell key={key}>{labels[key]}</TableCell>)}</TableRow></TableHead><TableBody>
      {!filtered.length && <TableRow><TableCell colSpan={7} align="center">{labels.empty}</TableCell></TableRow>}
      {filtered.map(row => <TableRow key={row.id} hover={Boolean(row.workLogId)} onClick={() => row.workLogId && onOpenHistorical?.(row.workLogId)} sx={{ cursor: row.workLogId ? 'pointer' : 'default' }}>
        <TableCell>{row.transactionDate}</TableCell><TableCell>{row.partner?.name}</TableCell><TableCell>{row.sourceKind === 'HISTORICAL_WORK_RECORD' ? <Stack>{labels.process}<Box sx={{ color: 'text.secondary', fontSize: 12 }}>{labels.historical}</Box></Stack> : serviceName(row.serviceType, languageCode)}</TableCell>
        <TableCell>{row.description}{row.transactionCode && <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{row.transactionCode.code} · {row.unitPrice} × {row.quantity} · VAT {row.vatRate}% ({money(row.vatAmount, row.currency)})</Box>}{row.style && <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{row.style.name} · {row.styleProcess?.processName}</Box>}{Object.entries(row.details || {}).filter(([, value]) => value).map(([key,value]) => <Box key={key} sx={{ color: 'text.secondary', fontSize: 12 }}>{labels[key]}: {value}</Box>)}</TableCell>
        <TableCell>{row.workOrder?.orderNumber || '-'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{money(row.amount, row.currency)}</TableCell><TableCell>{row.createdByEmployee?.name}</TableCell>
      </TableRow>)}
    </TableBody></Table></TableContainer>}</Stack>
  </AppPageContainer>;
}
