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
  const [issued, setIssued] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0), [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  useWorkspaceRefreshOnEvent({ orgId, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
    isBlocked: Boolean(selected) || removing, onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([
      requestJSON(`/invoices/drafts${buildQueryString({ orgId, page })}`, { skipCache: true }),
      requestJSON(`/invoices/issued${buildQueryString({ orgId, page })}`, { skipCache: true }),
    ]).then(([drafts, invoices]) => { if (!cancelled) { setResult(drafts); setIssued(invoices); } })
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
  const printIssued = async row => {
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const s = invoice.snapshot || {}, e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      const popup = window.open('', '_blank'); if (!popup) return;
      popup.opener = null; popup.document.write(`<!doctype html><meta charset="utf-8"><title>${e(invoice.invoiceNumber)}</title><style>body{font:12px Arial;margin:30px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #ccc;text-align:left}.num{text-align:right}h1{margin-bottom:4px}</style><h1>INVOICE ${e(invoice.invoiceNumber)}</h1><p>${e(s.fields?.date)} · ${e(invoice.status)} · ${e(invoice.currencyCode)}</p><p><b>${e(s.fields?.seller?.name)}</b> → <b>${e(s.fields?.buyer?.name)}</b></p><table><thead><tr><th>Order / Style</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>${(s.lines || []).filter(line => line.quantity > 0).map(line => `<tr><td>${e(line.orderId)} · ${e(line.styleName)} (${e(line.styleCode)})</td><td class="num">${e(line.quantity)}</td><td class="num">${e(line.unitPrice)}</td><td class="num">${e(line.amount)}</td></tr>`).join('')}</tbody></table><h2 style="text-align:right">TOTAL ${e(invoice.currencyCode)} ${e(invoice.total)}</h2><button onclick="window.print()">Print / Save as PDF</button>`); popup.document.close();
    } catch { setError(t.failed); }
  };
  const cancelIssued = async row => {
    const reason = window.prompt(languageCode === 'ko' ? '취소 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do hủy.' : 'Enter a cancellation reason.');
    if (!reason?.trim()) return;
    try { await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/cancel${buildQueryString({ orgId })}`, { method: 'POST', body: JSON.stringify({ reason }) });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch (e) { setError(String(e.message).includes('REVERSE_ORDER') ? (languageCode === 'ko' ? '후속 회차를 먼저 취소해야 합니다.' : 'Cancel later installments first.') : t.failed); }
  };
  return <Stack spacing={2}>
    <Typography variant="h6">{languageCode === 'ko' ? '발행된 청구서' : languageCode === 'vi' ? 'Hóa đơn đã phát hành' : 'Issued invoices'}</Typography>
    <Table size="small"><TableHead><TableRow>{[common.invoiceNumber, common.customerName, common.amount, t.updated, ''].map((label, i) => <TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
      {!issued.rows.length && <TableRow><TableCell colSpan={5}>{languageCode === 'ko' ? '발행된 청구서가 없습니다.' : 'No issued invoices.'}</TableCell></TableRow>}
      {issued.rows.map(row => <TableRow key={row.id}><TableCell>{row.invoiceNumber}<Typography variant="caption" display="block">{row.status}</Typography></TableCell><TableCell>{row.buyerName}</TableCell><TableCell>{row.currencyCode} {row.total}</TableCell><TableCell>{new Date(row.issuedAt).toLocaleString()}</TableCell><TableCell><Button onClick={() => printIssued(row)}>PDF</Button>{row.status === 'ISSUED' && <Button color="error" onClick={() => cancelIssued(row)}>{languageCode === 'ko' ? '취소' : 'Cancel'}</Button>}</TableCell></TableRow>)}
    </TableBody></Table>
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
