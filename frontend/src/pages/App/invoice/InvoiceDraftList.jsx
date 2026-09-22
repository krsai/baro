import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceDraftStorageMessages } from '../../../constants/invoiceDraftStorageMessages';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceDraftDialog from '../order/InvoiceDraftDialog';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

export default function InvoiceDraftList({ orgId, languageCode }) {
  const t = invoiceDraftStorageMessages[languageCode] || invoiceDraftStorageMessages.en;
  const common = invoiceMessages[languageCode] || invoiceMessages.en;
  const [result, setResult] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0), [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  useWorkspaceRefreshOnEvent({ orgId, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS],
    isBlocked: Boolean(selected) || removing, onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError('');
    requestJSON(`/invoices/drafts${buildQueryString({ orgId, page })}`, { skipCache: true })
      .then(data => { if (!cancelled) setResult(data); })
      .catch(() => { if (!cancelled) setError(t.failed); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, page, reload, t.failed]);
  const remove = async row => {
    if (!window.confirm(t.confirmDelete)) return;
    setRemoving(true); setError('');
    try {
      await requestJSON(`/invoices/drafts/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, {
        method: 'DELETE', body: JSON.stringify({ revision: row.revision }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS], orgId });
      if (result.rows.length === 1 && page > 0) setPage(value => value - 1);
      else setReload(value => value + 1);
    } catch (e) { setError(String(e.message).includes('STALE_EDIT') ? t.conflict : t.failed); }
    finally { setRemoving(false); }
  };
  return <Stack spacing={2}>
    <Typography variant="h6">{t.title}</Typography>
    {error && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)}>{common.retry}</Button>}>{error}</Alert>}
    {loading ? <CircularProgress /> : <Table size="small"><TableHead><TableRow>
      {[common.invoiceNumber, common.customerName, t.updated, ''].map((label, i) => <TableCell key={i}>{label}</TableCell>)}
    </TableRow></TableHead><TableBody>
      {!result.rows.length && <TableRow><TableCell colSpan={4}>{t.empty}</TableCell></TableRow>}
      {result.rows.map(row => <TableRow key={row.id}>
        <TableCell>{row.number || 'DRAFT'}</TableCell><TableCell>{row.buyerName}</TableCell>
        <TableCell>{new Date(row.updatedAt).toLocaleString()}<Typography variant="caption" display="block">{row.updatedBy}</Typography></TableCell>
        <TableCell><Button disabled={removing} onClick={() => setSelected(row.id)}>{t.resume}</Button><Button disabled={removing} onClick={() => remove(row)}>{t.remove}</Button></TableCell>
      </TableRow>)}
    </TableBody></Table>}
    <Stack direction="row"><Button disabled={!page || loading} onClick={() => setPage(value => value - 1)}>{common.previous}</Button>
      <Button disabled={!result.hasMore || loading} onClick={() => setPage(value => value + 1)}>{common.next}</Button></Stack>
    {selected && <InvoiceDraftDialog key={selected} open draftId={selected} orgId={orgId} languageCode={languageCode}
      onClose={() => { setSelected(null); setReload(value => value + 1); }} />}
  </Stack>;
}
