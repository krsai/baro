import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { INVOICE_BASES, calculateInvoiceDraft, buildInvoicePrintHtml } from '../../../utils/invoiceDraft.mjs';
import { INVOICE_BILLING_MODES, calculateMonetaryInstallment } from '../../../utils/invoiceBilling.mjs';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

const messages = {
  ko: { title: '청구서 초안', notice: '1단계: 검토용 초안입니다. 정식 발행·보관·완전 잠금은 아직 적용되지 않습니다. 입력한 내용은 창을 닫으면 사라집니다.',
    load: '주문·생산 실적·단가표를 불러오지 못했습니다.', close: '닫기', print: 'PDF 초안 출력',
    review: '생산 수량과 청구 수량의 차이, 세부 수량 및 단가를 확인했습니다.',
    explanation: '수량 변경은 청구서에만 반영됩니다. 단가는 스타일별 청구 수량 합계에 해당하는 현재 활성 단가표 구간을 사용합니다. 생산 실적은 스타일 단위이며 색상·사이즈별 실적을 뜻하지 않습니다.',
    ordered: '주문', produced: '생산 실적', invoice: '청구', difference: '차이', quantity: '청구 수량', reason: '수량 변경 사유',
    price: '단가', amount: '금액', scope: '단가 기준', currency: '통화', metadata: '문서 및 결제 정보',
    seller: '판매자', buyer: '구매자', retry: '다시 조회', popup: '팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.',
    issues: { PRODUCTION: '완료되지 않았거나 생산 근거 확인이 필요한 스타일/배정이 있습니다.', QUANTITY: '수량은 0 이상의 정수로 입력하세요.', REASON: '주문 수량과 달라진 행에는 변경 사유가 필요합니다.', PRICE: '해당 통화·CMT/FP·수량 구간의 활성 단가가 없습니다. 고객 단가표를 확인하세요.', EMPTY: '청구 수량이 없습니다.', CURRENCY: '통화를 선택하세요.' } },
  en: { title: 'Invoice draft', notice: 'Phase 1: review draft only. Issuing, archiving and final locking are not yet available. Changes are discarded when this dialog closes.',
    load: 'Unable to load order, production and prices.', close: 'Close', print: 'Print PDF draft',
    review: 'I reviewed production differences, detailed quantities and prices.', explanation: 'Changes affect this draft only. Active price tiers use total invoice quantity per style. Production totals are per style, not per color or size.',
    ordered: 'Ordered', produced: 'Produced', invoice: 'Invoiced', difference: 'Difference', quantity: 'Invoice qty', reason: 'Adjustment reason', price: 'Unit price', amount: 'Amount', scope: 'Price basis', currency: 'Currency', metadata: 'Document and payment details', seller: 'Seller', buyer: 'Buyer', retry: 'Reload', popup: 'Allow pop-ups for this site to print.',
    issues: { PRODUCTION: 'Some styles/assignments are incomplete or require production review.', QUANTITY: 'Enter a nonnegative integer quantity.', REASON: 'Explain each quantity adjustment.', PRICE: 'No active price for this currency, basis or quantity tier. Check customer prices.', EMPTY: 'No quantity to invoice.', CURRENCY: 'Select a currency.' } },
  vi: { title: 'Bản nháp hóa đơn', notice: 'Giai đoạn 1: chỉ để kiểm tra. Chưa phát hành, lưu trữ hoặc khóa hoàn toàn. Dữ liệu nhập sẽ mất khi đóng cửa sổ.', load: 'Không thể tải đơn hàng, sản lượng và đơn giá.', close: 'Đóng', print: 'In PDF bản nháp', review: 'Tôi đã kiểm tra chênh lệch sản lượng, số lượng chi tiết và đơn giá.', explanation: 'Thay đổi chỉ áp dụng cho bản nháp. Bậc giá hiện hành dựa trên tổng số lượng hóa đơn theo mã hàng. Sản lượng không được phân bổ theo màu hoặc cỡ.', ordered: 'Đặt hàng', produced: 'Sản xuất', invoice: 'Hóa đơn', difference: 'Chênh lệch', quantity: 'SL hóa đơn', reason: 'Lý do điều chỉnh', price: 'Đơn giá', amount: 'Thành tiền', scope: 'Cơ sở giá', currency: 'Tiền tệ', metadata: 'Thông tin hóa đơn và thanh toán', seller: 'Bên bán', buyer: 'Bên mua', retry: 'Tải lại', popup: 'Cho phép cửa sổ bật lên để in.', issues: { PRODUCTION: 'Có mã hàng/phân công chưa hoàn thành hoặc cần kiểm tra.', QUANTITY: 'Nhập số nguyên không âm.', REASON: 'Cần lý do điều chỉnh số lượng.', PRICE: 'Không có đơn giá hiện hành phù hợp. Kiểm tra bảng giá khách hàng.', EMPTY: 'Chưa có số lượng xuất hóa đơn.', CURRENCY: 'Chọn tiền tệ.' } },
};

export default function InvoiceDraftDialog({ open, onClose, orderId, orgId, buyerOrgId, languageCode = 'ko' }) {
  const t = messages[languageCode] || messages.en;
  const billingText = invoiceMessages[languageCode] || invoiceMessages.en;
  const [source, setSource] = useState(null);
  const [lines, setLines] = useState([]);
  const [basis, setBasis] = useState(INVOICE_BASES[0].value);
  const [currency, setCurrency] = useState('');
  const [fields, setFields] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState('QUANTITY');
  const [contractAmount, setContractAmount] = useState('');
  const [percentage, setPercentage] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [agreementNote, setAgreementNote] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(open && dirty);
  const monetary = mode !== 'QUANTITY';
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setSource(null); setFields(null); setError(''); setReviewed(false);
    setDirty(false);
    setMode('QUANTITY'); setContractAmount(''); setPercentage(''); setFixedAmount(''); setAgreementNote('');
    requestJSON(`/invoices/order-source/${encodeURIComponent(orderId)}${buildQueryString({ orgId, buyerOrgId })}`, { skipCache: true })
      .then((data) => {
        if (cancelled) return;
        setSource(data); setLines(data.lines);
        const prices = data.styles.flatMap((style) => style.prices);
        const first = prices.find((p) => p.pricingBasis === INVOICE_BASES[0].value && p.currencyCode === 'USD') || prices[0];
        setBasis(first?.pricingBasis || INVOICE_BASES[0].value); setCurrency(first?.currencyCode || data.currencies?.[0] || '');
        const date = new Date().toLocaleDateString('sv-SE');
        setFields({ number: `DRAFT-${data.orderNumber}`, date, seller: data.seller, buyer: data.buyer,
          shipTo: [data.buyer.name, data.buyer.address, data.buyer.country].filter(Boolean).join('\n'),
          shipmentDate: '', dueDate: '', incoterm: '', paymentTerms: '', bank: '', notes: '' });
      }).catch(() => { if (!cancelled) setError(t.load); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, orgId, buyerOrgId, reload, t.load]);
  const currencies = source?.currencies || [];
  const reference = useMemo(() => source ? calculateInvoiceDraft(source, source.lines, basis, currency) : null, [source, basis, currency]);
  const hasReference = reference && !reference.issues.some((issue) => issue !== 'PRODUCTION');
  const calculation = useMemo(() => !source ? null : monetary
    ? calculateMonetaryInstallment({ mode, currency, contractAmount, percentage, fixedAmount, agreementNote })
    : calculateInvoiceDraft(source, lines, basis, currency), [source, lines, basis, currency, monetary, mode, contractAmount, percentage, fixedAmount, agreementNote]);
  const changeBilling = (setter, value) => { setter(value); setReviewed(false); setDirty(true); };
  const changeField = (key, value) => { setFields((f) => ({ ...f, [key]: value })); setReviewed(false); setDirty(true); };
  const changeLine = (key, property, value) => {
    setLines((rows) => rows.map((row) => row.key === key ? { ...row, [property]: value } : row)); setReviewed(false); setDirty(true);
  };
  const close = () => {
    const message = languageCode === 'ko' ? '초안이 저장되지 않습니다. 입력 내용을 버리고 닫을까요?'
      : languageCode === 'vi' ? 'Bản nháp chưa được lưu. Bỏ thay đổi và đóng?' : 'This draft is not saved. Discard changes and close?';
    if (!dirty || window.confirm(message)) { setDirty(false); onClose(); }
  };
  const print = () => {
    if (!reviewed || calculation?.issues.length || !fields.number.trim() || !fields.date) return;
    const popup = window.open('', '_blank');
    if (!popup) { setError(t.popup); return; }
    popup.opener = null;
    popup.document.open();
    popup.document.write(buildInvoicePrintHtml({ source, calculation, fields, pricingBasis: basis, currencyCode: currency }));
    popup.document.close();
    popup.focus();
  };
  return <Dialog open={open} onClose={close} fullWidth maxWidth="xl">
    <DialogTitle>{t.title}{source ? ` · ${source.orderNumber}` : ''}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Alert severity="info">{billingText.notice}</Alert>
        {loading && <CircularProgress />}
        {error && <Alert severity="error" action={<Button onClick={() => setReload((v) => v + 1)}>{t.retry}</Button>}>{error}</Alert>}
        {source && fields && <>
          <TextField select size="small" label={billingText.mode} value={mode} onChange={(e) => changeBilling(setMode, e.target.value)}>
            {INVOICE_BILLING_MODES.map((value) => <MenuItem key={value} value={value}>{billingText.modes[value]}</MenuItem>)}
          </TextField>
          <Typography variant="body2">{monetary ? billingText.moneyHint : t.explanation}</Typography>
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t.scope} value={basis} onChange={(e) => { changeBilling(setBasis, e.target.value); setCurrency(''); }} sx={{ minWidth: 140 }}>
              {INVOICE_BASES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t.currency} value={currency} onChange={(e) => { changeBilling(setCurrency, e.target.value); setContractAmount(''); setFixedAmount(''); }} sx={{ minWidth: 140 }}>
              <MenuItem value="">—</MenuItem>{currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          {monetary && <Stack spacing={2}>
            <Alert severity="info">{billingText.draftHint}</Alert>
            {mode === 'PERCENTAGE' && <>
              <Typography variant="body2">{billingText.reference}: {hasReference ? `${currency} ${reference.total}` : '—'}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField fullWidth size="small" label={billingText.contract} value={contractAmount} onChange={(e) => changeBilling(setContractAmount, e.target.value)} inputProps={{ inputMode: 'decimal', maxLength: 20 }} />
                <Button disabled={!hasReference} onClick={() => changeBilling(setContractAmount, reference.total)}>{billingText.useReference}</Button>
              </Stack>
              <TextField size="small" label={billingText.percentage} value={percentage} onChange={(e) => changeBilling(setPercentage, e.target.value)} inputProps={{ inputMode: 'decimal', maxLength: 6 }} />
            </>}
            {mode === 'FIXED_AMOUNT' && <TextField size="small" label={billingText.fixed} value={fixedAmount} onChange={(e) => changeBilling(setFixedAmount, e.target.value)} inputProps={{ inputMode: 'decimal', maxLength: 20 }} />}
            <TextField size="small" multiline label={billingText.agreement} value={agreementNote} onChange={(e) => changeBilling(setAgreementNote, e.target.value)} inputProps={{ maxLength: 2000 }} />
          </Stack>}
          {!monetary && <>
          <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>
            <TableCell>Style</TableCell>{[t.ordered, t.produced, t.invoice, t.difference].map((label) => <TableCell key={label} align="right">{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.styles.map((style) => <TableRow key={style.styleId ?? 'missing'}>
            <TableCell>{style.code} · {style.name}{!style.ready && ' ⚠'}</TableCell>
            <TableCell align="right">{style.orderedQuantity}</TableCell><TableCell align="right">{style.producedQuantity ?? '—'}</TableCell>
            <TableCell align="right">{style.invoiceQuantity}</TableCell><TableCell align="right" sx={{ color: style.invoiceQuantity !== style.producedQuantity ? 'warning.main' : undefined }}>{style.producedQuantity == null ? '—' : style.invoiceQuantity - style.producedQuantity}</TableCell>
          </TableRow>)}</TableBody></Table></Box>
          <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 1100 }}><TableHead><TableRow>
            {['Style / Color / Gender / Size', t.ordered, t.quantity, t.price, t.amount, t.reason, 'HS / Origin'].map((label) => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.lines.map((line) => <TableRow key={line.key}>
            <TableCell>{[line.styleCode, line.color, line.gender, line.size].filter(Boolean).join(' / ')}<Typography variant="caption" display="block">{line.description}</Typography></TableCell>
            <TableCell>{line.orderedQuantity}</TableCell>
            <TableCell><TextField size="small" value={lines.find((row) => row.key === line.key)?.quantity ?? ''} inputProps={{ inputMode: 'numeric', 'aria-label': `${t.quantity} ${line.key}` }} onChange={(e) => changeLine(line.key, 'quantity', e.target.value)} sx={{ width: 100 }} /></TableCell>
            <TableCell>{line.unitPrice ?? '—'}<Typography variant="caption" display="block">{line.bucketQuantity == null ? '' : `≥ ${line.bucketQuantity} PCS`}</Typography></TableCell>
            <TableCell>{line.amount ?? '—'}</TableCell>
            <TableCell><TextField size="small" value={line.adjustmentReason} placeholder={t.reason} inputProps={{ 'aria-label': `${t.reason} ${line.key}`, maxLength: 500 }} onChange={(e) => changeLine(line.key, 'adjustmentReason', e.target.value)} /></TableCell>
            <TableCell><Stack spacing={1}>{['hsCode', 'origin'].map((key) => <TextField key={key} size="small" label={key === 'hsCode' ? 'HS code' : 'Origin'} value={line[key]} onChange={(e) => changeLine(line.key, key, e.target.value)} />)}</Stack></TableCell>
          </TableRow>)}</TableBody></Table></Box>
          </>}
          <Typography align="right" variant="h6">TOTAL {currency} {calculation.total ?? '—'}</Typography>
          <Typography variant="subtitle1">{t.metadata}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {[['number', 'Invoice reference'], ['date', 'Invoice date', 'date'], ['shipmentDate', 'Shipment date', 'date'], ['dueDate', 'Payment due date', 'date'], ['incoterm', 'Incoterm / Named place'], ['paymentTerms', 'Payment terms'], ['shipTo', 'Ship to / Consignee'], ['bank', 'Bank / Payment instructions'], ['notes', 'Remarks']].map(([key, label, type]) =>
              <TextField key={key} size="small" label={label} type={type || 'text'} multiline={!type} minRows={!type ? 2 : undefined} value={fields[key]} onChange={(e) => changeField(key, e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ maxLength: 2000 }} />)}
            {['seller', 'buyer'].map((party) => <Box key={party}><Typography>{t[party]}</Typography><Stack spacing={1}>
              {['name', 'address', 'country', 'taxId', 'email', 'phone'].map((key) => <TextField key={key} size="small" label={key} value={fields[party][key]} inputProps={{ maxLength: 1000 }} onChange={(e) => changeField(party, { ...fields[party], [key]: e.target.value })} />)}
            </Stack></Box>)}
          </Box>
          {calculation.issues.map((issue) => <Alert severity="warning" key={issue}>{billingText.errors[issue] || t.issues[issue]}</Alert>)}
          <FormControlLabel control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} label={t.review} />
        </>}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={close}>{t.close}</Button><Button variant="contained" onClick={print} disabled={loading || !source || !reviewed || !!calculation?.issues.length || !fields?.number.trim() || !fields?.date}>{t.print}</Button></DialogActions>
  </Dialog>;
}
