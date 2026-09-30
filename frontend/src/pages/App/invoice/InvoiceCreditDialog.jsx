import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { buildInvoiceCreditPrintHtml } from '../../../utils/invoiceCreditPrint.mjs';

const messages = {
  ko: { title: '채권 감액', info: '청구 원본·수량·입금은 유지하고 채권만 감액합니다. 이미 잠긴 주문은 먼저 해제하세요. 기존 회차의 채권을 감액하려면 후속 회차부터 취소해야 합니다.', order: '주문', amount: '감액액', reason: '사유 (필수)', save: '감액 문서 발행', close: '닫기', void: '감액 취소', error: '저장하지 못했습니다. 금액·사유와 잠금·후속 회차를 확인하세요.', empty: '감액 이력 없음', cancelled: '취소됨', confirm: '채권을 감액하시겠습니까? 현금 환불은 별도입니다.' },
  en: { title: 'Credit notes', info: 'Reduce debt without changing the original invoice, quantities or cash. Unlock first. Cancel later installments before crediting an earlier installment.', order: 'Order', amount: 'Credit amount', reason: 'Reason (required)', save: 'Issue credit note', close: 'Close', void: 'Void credit', error: 'Unable to save. Check amount, reason, locks and later installments.', empty: 'No credit notes', cancelled: 'Voided', confirm: 'Reduce the receivable? Cash refunds are separate.' },
  vi: { title: 'Giảm công nợ', info: 'Giảm công nợ, giữ nguyên hóa đơn, số lượng và tiền thu. Mở khóa trước. Hủy các đợt sau trước khi giảm công nợ đợt trước.', order: 'Đơn hàng', amount: 'Số tiền giảm', reason: 'Lý do (bắt buộc)', save: 'Phát hành chứng từ giảm', close: 'Đóng', void: 'Hủy giảm', error: 'Không thể lưu. Kiểm tra số tiền, lý do, khóa và các đợt sau.', empty: 'Chưa có chứng từ giảm', cancelled: 'Đã hủy', confirm: 'Giảm khoản phải thu? Hoàn tiền được ghi riêng.' },
};
export default function InvoiceCreditDialog({ invoiceId, orgId, languageCode, onClose, onChanged }) {
  const t = messages[languageCode] || messages.en;
  const [invoice, setInvoice] = useState(null), [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const retry = useRef(null);
  const load = () => requestJSON(`/invoices/issued/${encodeURIComponent(invoiceId)}${buildQueryString({ orgId })}`, { skipCache: true }).then(setInvoice);
  useEffect(() => { let active = true;
    requestJSON(`/invoices/issued/${encodeURIComponent(invoiceId)}${buildQueryString({ orgId })}`, { skipCache: true })
      .then(row => { if (active) { setInvoice(row); setOrderId(row.orders[0]?.id || ''); } })
      .catch(() => { if (active) setError(t.error); });
    return () => { active = false; };
  }, [invoiceId, orgId, t.error]);
  const save = async credit => {
    const why = credit ? window.prompt(t.reason) : reason;
    if (!why?.trim() || (!credit && !window.confirm(t.confirm))) return;
    const input = { invoiceOrderId: Number(orderId), amount, reason: why.trim() };
    const signature = JSON.stringify(input);
    if (!credit && retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError('');
    let saved = false;
    try {
      await requestJSON(`${credit ? `/invoices/credits/${encodeURIComponent(credit.id)}/void` : `/invoices/issued/${encodeURIComponent(invoiceId)}/credits`}${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify(credit ? { reason: why.trim() } : { ...input, clientKey: retry.current.key }),
      });
      saved = true; onChanged(); await load();
      if (!credit) { setAmount(''); setReason(''); retry.current = null; }
    } catch (e) { setError(`${t.error} ${saved ? '(saved; refresh failed)' : ''} ${e.message}`); }
    finally { setBusy(false); }
  };
  const print = credit => {
    const popup = window.open('', '_blank'); if (!popup) return;
    popup.opener = null; popup.document.write(buildInvoiceCreditPrintHtml({ ...credit, invoiceStatus: invoice.status })); popup.document.close();
  };
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t.title}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
      <Alert severity="info">{t.info}</Alert>{error && <Alert severity="error">{error}</Alert>}
      {invoice?.status === 'ISSUED' && <>
        <TextField select label={t.order} value={orderId} disabled={busy} onChange={e => setOrderId(e.target.value)}>
          {invoice.orders.map(order => <MenuItem key={order.id} value={order.id}>{order.sourceOrderNumber}</MenuItem>)}
        </TextField>
        <TextField label={`${t.amount} (${invoice.currencyCode})`} value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} />
        <TextField label={t.reason} value={reason} disabled={busy} multiline onChange={e => setReason(e.target.value)} />
        <Button disabled={busy || !amount || !reason.trim()} onClick={() => save(null)}>{t.save}</Button>
      </>}
      {invoice && !invoice.credits.length && <Typography>{t.empty}</Typography>}
      {invoice?.credits.map(credit => <Stack key={credit.id} spacing={1}>
        <Typography>{credit.snapshot.sourceOrderNumber}: {credit.amount} {invoice.currencyCode} · {credit.reason} {credit.voidedAt ? `(${t.cancelled})` : ''}</Typography>
        <Typography variant="caption">{credit.createdBy} · {new Date(credit.createdAt).toLocaleString()}</Typography>
        <Stack direction="row"><Button onClick={() => print(credit)}>PDF</Button>
          {!credit.voidedAt && invoice.status === 'ISSUED' && <Button disabled={busy} onClick={() => save(credit)}>{t.void}</Button>}
        </Stack>
      </Stack>)}
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{t.close}</Button></DialogActions>
  </Dialog>;
}
