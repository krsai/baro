import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceDraftDialog from '../order/InvoiceDraftDialog';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';

export default function InvoiceWorkspace() {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ rows: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => { setSelected(null); setSearch(''); setPage(0); }, [activeOrgId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setResult({ rows: [], hasMore: false });
    const timer = setTimeout(() => {
      requestJSON(`/invoices/orders${buildQueryString({ orgId: activeOrgId, search, page })}`, { skipCache: true })
        .then((data) => { if (!cancelled) setResult(data); })
        .catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeOrgId, search, page, revision]);
  useWorkspaceRefreshOnEvent({ orgId: activeOrgId, topics: ['orders', 'customers'],
    isBlocked: Boolean(selected), onRefresh: () => setRevision((v) => v + 1) });
  return <AppPageContainer title={t.title}>
    <Stack spacing={2}>
      <Alert severity="info">{t.notice}</Alert>
      <Typography variant="h6">{t.orders}</Typography>
      <TextField size="small" label={t.search} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} inputProps={{ maxLength: 200 }} />
      {error && <Alert severity="error" action={<Button onClick={() => setRevision((v) => v + 1)}>{t.retry}</Button>}>{t.failed}</Alert>}
      {loading ? <CircularProgress /> : <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>
        <TableCell>{languageCode === 'ko' ? '주문번호' : languageCode === 'vi' ? 'Mã đơn hàng' : 'Order'}</TableCell>
        <TableCell>{languageCode === 'ko' ? '고객' : languageCode === 'vi' ? 'Khách hàng' : 'Customer'}</TableCell>
        <TableCell align="right">{languageCode === 'ko' ? '주문 수량' : languageCode === 'vi' ? 'Số lượng đặt' : 'Ordered quantity'}</TableCell>
        <TableCell />
      </TableRow></TableHead><TableBody>
        {result.rows.map((order) => <TableRow key={order.orderId} hover>
          <TableCell>{order.orderNumber}</TableCell><TableCell>{order.buyerOrg?.name || '—'}</TableCell>
          <TableCell align="right">{order.totalQuantity}</TableCell>
          <TableCell align="right"><Button onClick={() => setSelected(order.orderId)}>{t.create}</Button></TableCell>
        </TableRow>)}
        {!result.rows.length && !error && <TableRow><TableCell colSpan={4}>{t.empty}</TableCell></TableRow>}
      </TableBody></Table></Box>}
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button disabled={loading || page === 0} onClick={() => setPage((v) => v - 1)}>{t.previous}</Button>
        <Button disabled={loading || !result.hasMore} onClick={() => setPage((v) => v + 1)}>{t.next}</Button>
      </Stack>
    </Stack>
    <InvoiceDraftDialog open={Boolean(selected)} orderId={selected} orgId={activeOrgId} languageCode={languageCode} onClose={() => setSelected(null)} />
  </AppPageContainer>;
}
