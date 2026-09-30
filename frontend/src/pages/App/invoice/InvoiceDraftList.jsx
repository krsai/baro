import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceDraftStorageMessages } from '../../../constants/invoiceDraftStorageMessages';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import { buildIssuedInvoicePrintHtml } from '../../../utils/issuedInvoicePrint.mjs';
import InvoiceDraftDialog from '../order/InvoiceDraftDialog';
import InvoiceFinalReviewDialog from './InvoiceFinalReviewDialog';
import InvoiceCreditDialog from './InvoiceCreditDialog';
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
  const [finalReviewId, setFinalReviewId] = useState(null);
  const [creditId, setCreditId] = useState(null);
  useWorkspaceRefreshOnEvent({ orgId, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
    isBlocked: Boolean(selected) || Boolean(finalReviewId) || Boolean(creditId) || removing, onRefresh: () => setReload(value => value + 1) });
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
    // Open synchronously from the click so browsers do not block the print tab.
    const popup = window.open('', '_blank');
    if (!popup) { setError(t.failed); return; }
    popup.opener = null;
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const html = buildIssuedInvoicePrintHtml(invoice);
      if (popup.closed) return;
      popup.document.write(html); popup.document.close();
    } catch { popup.close(); setError(t.failed); }
  };
  const cancelIssued = async row => {
    const policy = languageCode === 'ko' ? '취소하면 이 회차의 채권은 제거되지만 이전 개정본이 다시 활성화되지는 않습니다. 기록된 입금은 보존되어 고객 예수금/환급 검토에 계속 표시됩니다.'
      : languageCode === 'vi' ? 'Hủy sẽ xóa khoản phải thu của đợt này nhưng không khôi phục bản sửa đổi trước. Khoản đã thu vẫn được giữ để kiểm tra số dư hoặc hoàn tiền.'
      : 'Cancellation removes this installment debt but does not reactivate an earlier revision. Recorded receipts remain as customer credit/refund review.';
    if (!window.confirm(policy)) return;
    const reason = window.prompt(languageCode === 'ko' ? '취소 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do hủy.' : 'Enter a cancellation reason.');
    if (!reason?.trim()) return;
    try { await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/cancel${buildQueryString({ orgId })}`, { method: 'POST', body: JSON.stringify({ reason }) });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch (e) { setError(String(e.message).includes('REVERSE_ORDER') ? (languageCode === 'ko' ? '후속 회차를 먼저 취소해야 합니다.' : 'Cancel later installments first.') : t.failed); }
  };
  const addPayment = async row => {
    let recorded = false;
    const amount = window.prompt(languageCode === 'ko' ? `실입금액을 입력하세요. (${row.currencyCode})` : `Enter received amount (${row.currencyCode}).`);
    if (!amount?.trim()) return;
    const reference = window.prompt(languageCode === 'ko' ? '입금 참고번호를 입력하세요. (선택)' : 'Payment reference (optional).') || '';
    try { const payment = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/payments${buildQueryString({ orgId })}`, {
      method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), amount: amount.trim(),
        receivedAt: new Date().toISOString(), reference, note: '', kind: 'RECEIPT' }),
    });
      recorded = true;
      window.alert(languageCode === 'ko' ? '입금이 저장되었습니다. 다음 배분 입력을 취소해도 입금은 유지됩니다. 배분 버튼에서 이어서 처리할 수 있습니다.' : languageCode === 'vi' ? 'Đã lưu khoản thu. Hủy nhập phân bổ không hủy khoản thu. Có thể tiếp tục bằng nút phân bổ.' : 'Receipt saved. Cancelling allocation will keep this receipt. Use Allocate to resume.');
      if (row.orders.length > 1) {
        const allocations = [];
        for (const order of row.orders) {
          const allocated = window.prompt(languageCode === 'ko'
            ? `${order.sourceOrderNumber} 주문에 배분할 금액을 입력하세요. (배분하지 않으면 0)`
            : `Amount allocated to order ${order.sourceOrderNumber} (0 for none).`, '0');
          if (allocated === null) return;
          if (Number(allocated) > 0) allocations.push({ invoiceOrderId: order.id, amount: allocated.trim() });
        }
        if (allocations.length) await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
          method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: '', allocations }),
        });
      }
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch { setError(recorded ? (languageCode === 'ko' ? '입금은 저장되었으나 배분하지 못했습니다. 다시 입금하지 말고 배분 버튼을 사용하세요.' : languageCode === 'vi' ? 'Đã lưu khoản thu nhưng phân bổ thất bại. Hãy phân bổ lại, không nhập khoản thu lần nữa.' : 'Receipt saved, allocation failed. Use Allocate; do not record the receipt again.') : t.failed); }
    finally { if (recorded) { emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1); } }
  };
  const refundPayment = async row => {
    let recorded = false;
    const amount = window.prompt(`Refund amount (${row.currencyCode}).`);
    if (!amount?.trim()) return;
    const reference = window.prompt('Refund reference (optional).') || '';
    try {
      const payment = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/payments${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), amount: amount.trim(),
          receivedAt: new Date().toISOString(), reference, note: '', kind: 'REFUND' }),
      });
      recorded = true;
      window.alert(languageCode === 'ko' ? '환불이 저장되었습니다. 배분 입력을 취소해도 환불은 유지됩니다. 배분 버튼에서 이어서 처리할 수 있습니다.' : languageCode === 'vi' ? 'Đã lưu hoàn tiền. Hủy phân bổ không hủy hoàn tiền. Có thể tiếp tục bằng nút phân bổ.' : 'Refund saved. Cancelling allocation will keep this refund. Use Allocate to resume.');
      if (row.orders.length > 1) {
        const allocations = [];
        for (const order of row.orders) {
          const allocated = window.prompt(`Refund allocated to order ${order.sourceOrderNumber} (0 for none).`, '0');
          if (allocated === null) return;
          if (Number(allocated) > 0) allocations.push({ invoiceOrderId: order.id, amount: allocated.trim() });
        }
        if (allocations.length) await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
          method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: '', allocations }),
        });
      }
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId });
      setReload(value => value + 1);
    } catch { setError(recorded ? (languageCode === 'ko' ? '환불은 저장되었으나 배분하지 못했습니다. 다시 환불하지 말고 배분 버튼을 사용하세요.' : languageCode === 'vi' ? 'Đã lưu hoàn tiền nhưng phân bổ thất bại. Hãy phân bổ lại, không hoàn tiền lần nữa.' : 'Refund saved, allocation failed. Use Allocate; do not record the refund again.') : t.failed); }
    finally { if (recorded) { emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1); } }
  };
  const reviseIssued = async row => {
    const reason = window.prompt(languageCode === 'ko' ? '개정 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do sửa đổi.' : 'Enter a revision reason.');
    if (!reason?.trim()) return;
    try {
      const draft = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/revision-draft${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason.trim() }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS], orgId }); setSelected(draft.id);
    } catch (e) { setError(String(e.message).includes('INVOICE_REVISION_SOURCE_REMOVED')
      ? (languageCode === 'ko' ? '원본 주문 또는 품목이 삭제되어 개정할 수 없습니다.' : 'The source order or item was removed, so this invoice cannot be revised.') : t.failed); }
  };
  const allocateExistingPayment = async row => {
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const payments = (invoice.payments || []).filter(payment => !payment.voidedAt);
      if (!payments.length) return;
      const options = payments.map((payment, index) => `${index + 1}. ${payment.receivedAt} · ${invoice.currencyCode} ${payment.amount} · ${payment.reference || '-'}`).join('\n');
      const selectedIndex = Number(window.prompt(`${options}\n\n${languageCode === 'ko' ? '배분할 입금 번호를 선택하세요.' : 'Select the payment number to allocate.'}`, '1')) - 1;
      const payment = payments[selectedIndex]; if (!payment) return;
      const allocations = [];
      for (const order of invoice.orders || []) {
        const current = (payment.allocations || []).find(item => !item.voidedAt && item.invoiceOrderId === order.id);
        const amount = window.prompt(languageCode === 'ko' ? `${order.sourceOrderNumber} 주문 배분액` : `Allocation for ${order.sourceOrderNumber}`, current?.amount || '0');
        if (amount === null) return;
        if (Number(amount) > 0) allocations.push({ invoiceOrderId: order.id, amount: amount.trim() });
      }
      if (!allocations.length) return;
      const hasCurrent = (payment.allocations || []).some(item => !item.voidedAt);
      const reason = hasCurrent ? window.prompt(languageCode === 'ko' ? '기존 배분을 바꾸는 사유를 입력하세요.' : 'Reason for changing the allocation.') : '';
      if (hasCurrent && !reason?.trim()) return;
      await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason?.trim() || '', allocations }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch { setError(t.failed); }
  };
  const showHistory = async row => {
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const lines = [
        `${invoice.invoiceNumber} · r${invoice.revisionNumber || 1} · ${invoice.status}`,
        invoice.revisedFrom ? `← ${invoice.revisedFrom.invoiceNumber} (r${invoice.revisedFrom.revisionNumber})` : '',
        invoice.revision ? `→ ${invoice.revision.invoiceNumber} (r${invoice.revision.revisionNumber})` : '',
        ...(invoice.finalLockEvents || []).map(event => `[${event.action}] ${event.createdAt} · ${event.actor} · ${event.recognizedQuantity ?? '-'} · ${event.reason}`),
        ...(invoice.payments || []).map(payment => `${payment.voidedAt ? '[VOID] ' : ''}${payment.kind === 'REFUND' ? '[REFUND] ' : ''}${payment.receivedAt} ${invoice.currencyCode} ${payment.amount}${payment.allocations?.filter(item => !item.voidedAt).map(item => ` · #${item.invoiceOrderId} ${item.amount}`).join('') || ''}`),
      ].filter(Boolean);
      window.alert(lines.join('\n'));
    } catch { setError(t.failed); }
  };
  const approveFinalLock = row => setFinalReviewId(row.id);
  const unlockFinalLock = async row => {
    const reason = window.prompt(languageCode === 'ko' ? '최종 정산 잠금 해제 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do mở khóa quyết toán cuối cùng.' : 'Enter a reason for unlocking the final settlement.');
    if (!reason?.trim()) return;
    try {
      await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/final-unlock${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason.trim() }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES, WORKSPACE_DATA_TOPICS.ORDERS], orgId }); setReload(value => value + 1);
    } catch { setError(t.failed); }
  };
  return <Stack spacing={2}>
    <Typography variant="h6">{languageCode === 'ko' ? '발행된 청구서' : languageCode === 'vi' ? 'Hóa đơn đã phát hành' : 'Issued invoices'}</Typography>
    <Table size="small"><TableHead><TableRow>{[common.invoiceNumber, common.customerName, languageCode === 'ko' ? '안내금액 / 신규채권' : 'Statement / New debt', languageCode === 'ko' ? '입금 / 신규미수' : 'Received / New due', t.updated, ''].map((label, i) => <TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
      {!issued.rows.length && <TableRow><TableCell colSpan={6}>{languageCode === 'ko' ? '발행된 청구서가 없습니다.' : 'No issued invoices.'}</TableCell></TableRow>}
      {issued.rows.map(row => { const balanceLabel = row.familyBalanceKind === 'CREDIT'
        ? (languageCode === 'ko' ? '예수금/환급 검토' : languageCode === 'vi' ? 'Số dư/hoàn tiền' : 'Credit/refund review')
        : row.familyBalanceKind === 'SETTLED' ? (languageCode === 'ko' ? '정산 완료' : languageCode === 'vi' ? 'Đã quyết toán' : 'Settled')
          : (languageCode === 'ko' ? '미수' : languageCode === 'vi' ? 'Còn phải thu' : 'Due');
        return <TableRow key={row.id}><TableCell>{row.invoiceNumber}<Typography variant="caption" display="block">{row.status} · r{row.revisionNumber || 1} · {row.orders.map(order => `${order.sourceOrderNumber} ${order.installmentNumber}차`).join(', ')}</Typography>{!row.isCurrentRevision && <Typography variant="caption" color="text.secondary" display="block">{languageCode === 'ko' ? '이력 문서 — 현재 채권 아님' : 'Historical revision — not current debt'}</Typography>}{row.isFinalLocked && <Typography variant="caption" color="success.main" display="block">{languageCode === 'ko' ? '최종 정산 잠금' : 'Final settlement locked'}</Typography>}</TableCell><TableCell>{row.buyerName}</TableCell><TableCell>{row.currencyCode} {row.total} / {row.receivableAdded}<Typography variant="caption" display="block">{languageCode === 'ko' ? '감액 반영 채권' : languageCode === 'vi' ? 'Công nợ sau giảm' : 'Debt after credits'}: {row.familyDebtAmount}</Typography></TableCell><TableCell>{row.currencyCode} {row.receivedAmount}<Typography variant="caption" display="block" color={row.familyBalanceKind === 'CREDIT' ? 'warning.main' : undefined}>{balanceLabel}: {row.currencyCode} {row.familyBalanceAmount}</Typography>{row.orders.length > 1 && <Typography variant="caption" display="block">{languageCode === 'ko' ? '이 문서 주문 배분' : 'This document allocated'}: {row.allocatedAmount}</Typography>}</TableCell><TableCell>{new Date(row.issuedAt).toLocaleString()}</TableCell><TableCell><Button onClick={() => printIssued(row)}>PDF</Button><Button onClick={() => setCreditId(row.id)}>{languageCode === 'ko' ? '감액' : languageCode === 'vi' ? 'Giảm công nợ' : 'Credits'}</Button><Button onClick={() => showHistory(row)}>{languageCode === 'ko' ? '이력' : 'History'}</Button>{row.status !== 'ISSUED' && row.orders.length > 1 && <Button onClick={() => allocateExistingPayment(row)}>{languageCode === 'ko' ? '배분' : languageCode === 'vi' ? 'Phân bổ' : 'Allocate'}</Button>}{row.status === 'ISSUED' && <><Button onClick={() => addPayment(row)}>{languageCode === 'ko' ? '입금' : 'Payment'}</Button>{row.orders.length > 1 && <Button onClick={() => allocateExistingPayment(row)}>{languageCode === 'ko' ? '배분' : 'Allocate'}</Button>}<Button onClick={() => reviseIssued(row)}>{languageCode === 'ko' ? '개정' : 'Revise'}</Button>{row.isFinalLocked ? <Button color="warning" onClick={() => unlockFinalLock(row)}>{languageCode === 'ko' ? '잠금 해제' : 'Unlock'}</Button> : <Button color="success" onClick={() => approveFinalLock(row)}>{languageCode === 'ko' ? '최종 마감' : 'Final close'}</Button>}<Button color="error" onClick={() => cancelIssued(row)}>{languageCode === 'ko' ? '취소' : 'Cancel'}</Button></>} {Number(row.receivedAmount) > 0 && <Button color="warning" onClick={() => refundPayment(row)}>{languageCode === 'ko' ? '환불' : 'Refund'}</Button>}</TableCell></TableRow>; })}
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
      <Button disabled={!(result.hasMore || issued.hasMore) || loading} onClick={() => setPage(value => value + 1)}>{common.next}</Button></Stack>
    {creditId && <InvoiceCreditDialog key={creditId} invoiceId={creditId} orgId={orgId} languageCode={languageCode}
      onClose={() => setCreditId(null)} onChanged={() => { setReload(value => value + 1);
        emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); }} />}
    {selected && <InvoiceDraftDialog key={selected} open draftId={selected} orgId={orgId} languageCode={languageCode}
      onClose={() => { setSelected(null); setReload(value => value + 1); }} />}
    {finalReviewId && <InvoiceFinalReviewDialog key={finalReviewId} invoiceId={finalReviewId} orgId={orgId} languageCode={languageCode}
      onClose={() => setFinalReviewId(null)} onSaved={() => { setFinalReviewId(null); setReload(value => value + 1);
        emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES, WORKSPACE_DATA_TOPICS.ORDERS], orgId }); }} />}
  </Stack>;
}
