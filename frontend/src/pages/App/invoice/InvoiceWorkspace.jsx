import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchableSelect from '../../../components/SearchableSelect';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceDraftDialog from '../order/InvoiceDraftDialog';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';

export default function InvoiceWorkspace({ view = 'list' } = {}) {
  const { activeOrgId } = useAuth();
  return <InvoiceMenuWorkspace key={activeOrgId || 'none'} activeOrgId={activeOrgId} view={view} />;
}

function InvoiceMenuWorkspace({ activeOrgId, view = 'list' }) {
  const { navigateToPath } = useAppActions();
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  if (view === 'editor') {
    return <InvoiceCustomerWorkspace activeOrgId={activeOrgId} onBack={() => navigateToPath('/invoices')} />;
  }
  return <AppPageContainer title={t.title}>
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Typography variant="h6">{t.issuedInvoices}</Typography>
        <Button variant="contained" disabled={!activeOrgId} onClick={() => navigateToPath('/invoices/new')}>{t.newInvoice}</Button>
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={t.issuedInvoices}>
          <TableHead><TableRow>
            {[t.invoiceNumber, t.issuedDate, t.customerName, t.invoiceAmount, t.invoiceStatus].map(label => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead>
          <TableBody><TableRow><TableCell colSpan={5} sx={{ py: 7, textAlign: 'center' }}>
            <Typography color="text.secondary">{t.historyUnavailable}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t.historyDraftHint}</Typography>
          </TableCell></TableRow></TableBody>
        </Table>
      </Box>
    </Stack>
  </AppPageContainer>;
}

function InvoiceCustomerWorkspace({ activeOrgId, onBack }) {
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ rows: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [chosenOrders, setChosenOrders] = useState([]);
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCustomersLoading(true); setCustomersError(false);
    if (!activeOrgId) { setCustomersLoading(false); return undefined; }
    requestJSON(`/invoices/customers${buildQueryString({ orgId: activeOrgId })}`, { skipCache: true })
      .then((data) => { if (!cancelled) setCustomers(data.rows); })
      .catch(() => { if (!cancelled) setCustomersError(true); })
      .finally(() => { if (!cancelled) setCustomersLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId, revision]);
  useEffect(() => {
    let cancelled = false;
    setError(false); setResult({ rows: [], hasMore: false });
    if (!activeOrgId || !customer) { setLoading(false); return undefined; }
    setLoading(true);
    const timer = setTimeout(() => {
      requestJSON(`/invoices/orders${buildQueryString({ orgId: activeOrgId, buyerOrgId: customer.id, search, page })}`, { skipCache: true })
        .then((data) => { if (!cancelled) setResult(data); })
        .catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeOrgId, customer, search, page, revision]);
  useWorkspaceRefreshOnEvent({ orgId: activeOrgId, topics: ['orders', 'customers'],
    isBlocked: Boolean(selected), onRefresh: () => setRevision((v) => v + 1) });
  return <AppPageContainer title={t.newInvoice}>
    <Stack spacing={2}>
      <Box><Button onClick={onBack} disabled={Boolean(selected)}>{t.backToInvoices}</Button></Box>
      <Alert severity="info">{t.notice}</Alert>
      <Typography variant="body2" color="text.secondary">{t.workflow}</Typography>
      <SearchableSelect label={t.customer} options={customers} value={customer} loading={customersLoading}
        disabled={Boolean(selected) || !activeOrgId} autoSelect={false}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionLabel={(option) => (languageCode === 'ko' ? option.nameKo : languageCode === 'vi' ? option.nameVi : option.name) || option.name || ''}
        noOptionsText={t.noCustomers}
        onChange={(_event, value) => {
          if ((value?.id ?? null) === (customer?.id ?? null)) return;
          setCustomer(value); setExpandedOrders([]); setSelected(null); setChosenOrders([]); setSearch(''); setPage(0);
          setResult({ rows: [], hasMore: false }); setError(false); setLoading(Boolean(value));
        }} />
      {customersError && <Alert severity="error" action={<Button onClick={() => setRevision((v) => v + 1)}>{t.retry}</Button>}>{t.customersFailed}</Alert>}
      {!customer && <Typography color="text.secondary">{t.selectCustomer}</Typography>}
      {customer && <>
      <Typography variant="h6">{t.orders}</Typography>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography>{t.selectedOrders}: {chosenOrders.length}</Typography>
        <Button variant="contained" disabled={!chosenOrders.length} onClick={() => setSelected([...chosenOrders])}>{t.create}</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">{t.billingHistoryUnknown}</Typography>
      <TextField size="small" label={t.search} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); setResult({ rows: [], hasMore: false }); setLoading(true); }} inputProps={{ maxLength: 200 }} />
      {error && <Alert severity="error" action={<Button onClick={() => setRevision((v) => v + 1)}>{t.retry}</Button>}>{t.failed}</Alert>}
      {loading ? <CircularProgress /> : <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 850 }}><TableHead><TableRow>
        <TableCell sx={{ width: 64, whiteSpace: 'nowrap' }}>{t.selectOrder}</TableCell>
        <TableCell>{languageCode === 'ko' ? '주문번호' : languageCode === 'vi' ? 'Mã đơn hàng' : 'Order'}</TableCell>
        <TableCell>{t.dueDate}</TableCell><TableCell align="right">{t.productionProgress}</TableCell><TableCell>{t.assignmentDetails}</TableCell>
        <TableCell align="right">{languageCode === 'ko' ? '주문 수량' : languageCode === 'vi' ? 'Số lượng đặt' : 'Ordered quantity'}</TableCell>
      </TableRow></TableHead><TableBody>
        {result.rows.map((order) => <React.Fragment key={order.orderId}><TableRow hover>
          <TableCell padding="checkbox"><Checkbox checked={chosenOrders.includes(order.orderId)} inputProps={{ 'aria-label': `${t.selectOrder} ${order.orderNumber}` }}
            onChange={(_event, checked) => setChosenOrders(ids => checked ? [...new Set([...ids, order.orderId])] : ids.filter(id => id !== order.orderId))} /></TableCell>
          <TableCell>{order.orderNumber}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.dueDate?.slice(0, 10) || '—'}</TableCell>
          <TableCell align="right">{order.progressPercent == null ? '—' : `${order.progressPercent.toFixed(1)}%`}<Typography variant="caption" display="block">{order.producedQuantity ?? '—'} / {order.totalQuantity}</Typography></TableCell>
          <TableCell><Button size="small" aria-expanded={expandedOrders.includes(order.orderId)} disabled={!order.assignments?.length}
            onClick={() => setExpandedOrders(ids => ids.includes(order.orderId) ? ids.filter(id => id !== order.orderId) : [...ids, order.orderId])}>
            {expandedOrders.includes(order.orderId) ? '▾' : '▸'} {t.assignmentDetails} ({order.assignments?.length || 0})</Button></TableCell>
          <TableCell align="right">{order.totalQuantity}</TableCell>
        </TableRow>
        {expandedOrders.includes(order.orderId) && <TableRow><TableCell colSpan={6} sx={{ bgcolor: 'grey.50' }}>
          <Table size="small" aria-label={`${t.assignmentDetails} ${order.orderNumber}`}><TableHead><TableRow>
            {[t.orderStyle, t.factory, t.planned, t.produced, t.productionProgress].map(label => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{(order.assignments || []).map(plan => <TableRow key={plan.id}>
            <TableCell>{plan.style}<Typography variant="caption" display="block">{plan.id}</Typography></TableCell><TableCell>{plan.factory || '—'}</TableCell>
            <TableCell>{plan.plannedQuantity ?? '—'}</TableCell><TableCell>{plan.producedQuantity ?? '—'}</TableCell>
            <TableCell>{plan.progressPercent == null ? '—' : `${plan.progressPercent.toFixed(1)}%`}</TableCell>
          </TableRow>)}</TableBody></Table>
        </TableCell></TableRow>}
        </React.Fragment>)}
        {!result.rows.length && !error && <TableRow><TableCell colSpan={6}>{t.empty}</TableCell></TableRow>}
      </TableBody></Table></Box>}
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button disabled={loading || page === 0} onClick={() => setPage((v) => v - 1)}>{t.previous}</Button>
        <Button disabled={loading || !result.hasMore} onClick={() => setPage((v) => v + 1)}>{t.next}</Button>
      </Stack>
      </>}
    </Stack>
    <InvoiceDraftDialog open={Boolean(selected)} orderIds={selected} orgId={activeOrgId} buyerOrgId={customer?.id} languageCode={languageCode} onClose={() => setSelected(null)} />
  </AppPageContainer>;
}
