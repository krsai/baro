import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Table, TableHead, TableBody, TableRow, TableCell, TextField, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';

const labels = {
  ko: { title: '품목별 최종 마감 검토', notice: '문서 수량 합계는 출하량이 아닙니다. 비율 청구도 수량을 비례 차감하지 않습니다. 생산 실적은 품목별로 추정 배분하지 않습니다. 부족·초과가 있는 각 행에 사유를 입력하세요.', order: '주문 / 스타일 / 색상 / 성별 / 사이즈', ordered: '주문', billed: '유효 문서 수량 합계', current: '이번 문서', difference: '차이', recognized: '최종 인정', reason: '품목 사유', orderReason: '주문 마감 사유', reviewed: '품목별 차이를 확인하고 최종 마감을 승인합니다.', save: '승인 및 잠금', close: '닫기', error: '검토 내용을 확인하세요. 데이터가 변경됐다면 닫고 다시 열어 주세요.' },
  en: { title: 'Final settlement by item', notice: 'Document quantities are not shipments. Billing percentages do not scale quantities. Production is not guessed per item. Explain every shortage or excess.', order: 'Order / Style / Color / Gender / Size', ordered: 'Ordered', billed: 'Active document qty', current: 'This document', difference: 'Difference', recognized: 'Final quantity', reason: 'Item reason', orderReason: 'Settlement reason', reviewed: 'I reviewed every item difference and approve final settlement.', save: 'Approve and lock', close: 'Close', error: 'Review the inputs. If data changed, close and reopen this review.' },
  vi: { title: 'Kiểm tra quyết toán theo từng mục', notice: 'Tổng số lượng trên hóa đơn không phải số lượng giao hàng. Tỷ lệ thanh toán không làm giảm số lượng. Không suy đoán sản lượng theo từng mục. Nhập lý do cho từng chênh lệch.', order: 'Đơn / Mã hàng / Màu / Giới tính / Cỡ', ordered: 'Đặt hàng', billed: 'SL hóa đơn hiệu lực', current: 'Hóa đơn này', difference: 'Chênh lệch', recognized: 'SL cuối cùng', reason: 'Lý do từng mục', orderReason: 'Lý do quyết toán', reviewed: 'Tôi đã kiểm tra từng chênh lệch và xác nhận quyết toán.', save: 'Xác nhận và khóa', close: 'Đóng', error: 'Kiểm tra dữ liệu. Nếu dữ liệu đã thay đổi, đóng và mở lại.' },
};

export default function InvoiceFinalReviewDialog({ invoiceId, orgId, languageCode, onClose, onSaved, request = requestJSON }) {
  const t = labels[languageCode] || labels.en;
  const [review, setReview] = useState(null), [orders, setOrders] = useState([]);
  const [checked, setChecked] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [clientKey] = useState(() => globalThis.crypto.randomUUID());
  useEffect(() => {
    let cancelled = false;
    request(`/invoices/issued/${encodeURIComponent(invoiceId)}/final-review${buildQueryString({ orgId })}`, { skipCache: true })
      .then(data => { if (!cancelled) { setReview(data); setOrders(data.orders.map(order => ({ ...order, reason: '',
        lines: order.lines.map(line => ({ ...line, recognizedQuantity: String(line.orderedQuantity), reason: '' })) }))); } })
      .catch(() => { if (!cancelled) setError(t.error); });
    return () => { cancelled = true; };
  }, [invoiceId, orgId, request, t.error]);
  const edit = (oi, li, field, value) => {
    setChecked(false);
    setOrders(previous => previous.map((order, i) => i !== oi ? order : li === null ? { ...order, [field]: value }
      : { ...order, lines: order.lines.map((line, j) => j === li ? { ...line, [field]: value } : line) }));
  };
  const valid = orders.length > 0 && orders.every(order => order.reason.trim() && order.lines.every(line =>
    /^\d+$/.test(line.recognizedQuantity) && Number(line.recognizedQuantity) <= 2147483647
    && (!(line.difference || Number(line.recognizedQuantity) !== line.orderedQuantity) || line.reason.trim())));
  const save = async () => {
    setSaving(true); setError('');
    try {
      await request(`/invoices/issued/${encodeURIComponent(invoiceId)}/final-lock${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey, reviewRevision: review.revision,
          orders: orders.map(order => ({ sourceOrderId: order.sourceOrderId, reason: order.reason.trim(),
            recognizedQuantity: order.lines.reduce((sum, line) => sum + Number(line.recognizedQuantity), 0),
            lines: order.lines.map(line => ({ key: line.key, recognizedQuantity: Number(line.recognizedQuantity), reason: line.reason.trim() })) })) }),
      });
      onSaved();
    } catch { setError(t.error); } finally { setSaving(false); }
  };
  return <Dialog open maxWidth="xl" fullWidth onClose={saving ? undefined : onClose}>
    <DialogTitle>{t.title}</DialogTitle><DialogContent>
      <Alert severity="info">{t.notice}</Alert>{error && <Alert severity="error">{error}</Alert>}
      {!review && !error && <CircularProgress />}
      {orders.map((order, oi) => <React.Fragment key={order.sourceOrderId}>
        <Typography variant="h6" sx={{ mt: 2 }}>{order.orderNumber}</Typography>
        <Table size="small"><TableHead><TableRow>{[t.order, t.ordered, t.billed, t.current, t.difference, t.recognized, t.reason].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{order.lines.map((line, li) => <TableRow key={line.key}>
            <TableCell>{[line.style, line.color, line.gender, line.size].filter(Boolean).join(' / ')}</TableCell>
            <TableCell>{line.orderedQuantity}</TableCell><TableCell>{line.invoicedQuantity}</TableCell><TableCell>{line.currentInvoiceQuantity}</TableCell>
            <TableCell sx={{ color: line.difference ? 'warning.main' : undefined }}>{line.difference > 0 ? '+' : ''}{line.difference}</TableCell>
            <TableCell><TextField size="small" label={t.recognized} value={line.recognizedQuantity} disabled={saving} onChange={event => edit(oi, li, 'recognizedQuantity', event.target.value)} /></TableCell>
            <TableCell><TextField size="small" label={t.reason} value={line.reason} disabled={saving} onChange={event => edit(oi, li, 'reason', event.target.value)} /></TableCell>
          </TableRow>)}</TableBody></Table>
        <TextField fullWidth sx={{ mt: 1 }} label={t.orderReason} value={order.reason} disabled={saving} onChange={event => edit(oi, null, 'reason', event.target.value)} />
      </React.Fragment>)}
      <FormControlLabel control={<Checkbox checked={checked} disabled={saving || !valid} onChange={event => setChecked(event.target.checked)} />} label={t.reviewed} />
    </DialogContent><DialogActions><Button disabled={saving} onClick={onClose}>{t.close}</Button>
      <Button disabled={saving || !valid || !checked} onClick={save}>{t.save}</Button></DialogActions>
  </Dialog>;
}
