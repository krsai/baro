import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { INVOICE_BASES, calculateInvoiceDraft, buildInvoicePrintHtml, combineInvoiceSources, applyOrderBillingPercentages } from '../../../utils/invoiceDraft.mjs';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { invoiceDraftStorageMessages } from '../../../constants/invoiceDraftStorageMessages';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';
import { restoreInvoiceDraftLines } from '../../../utils/invoiceDraftRestore.mjs';

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

export default function InvoiceDraftDialog({ open, onClose, orderId, orderIds, orgId, buyerOrgId, draftId, languageCode = 'ko' }) {
  const t = messages[languageCode] || messages.en;
  const billingText = invoiceMessages[languageCode] || invoiceMessages.en;
  const storageText = invoiceDraftStorageMessages[languageCode] || invoiceDraftStorageMessages.en;
  const [savedDraft, setSavedDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const draftRef = useRef(null);
  const clientKey = useRef(globalThis.crypto.randomUUID());
  const [source, setSource] = useState(null);
  const [lines, setLines] = useState([]);
  const [basis, setBasis] = useState(INVOICE_BASES[0].value);
  const [currency, setCurrency] = useState('');
  const [fields, setFields] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [percentages, setPercentages] = useState({});
  const [allPercentage, setAllPercentage] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(open && (dirty || saving));

  useEffect(() => {
    if (!open) {
      draftRef.current = null; setSavedDraft(null); clientKey.current = globalThis.crypto.randomUUID();
      return;
    }
    let cancelled = false;
    setLoading(true); setSource(null); setFields(null); setError(''); setReviewed(false);
    setDirty(false);
    setPercentages({}); setAllPercentage(''); setSaveNotice('');
    const load = async () => {
      const resumeId = draftId || draftRef.current?.id;
      const stored = resumeId ? await requestJSON(`/invoices/drafts/${encodeURIComponent(resumeId)}${buildQueryString({ orgId })}`, { skipCache: true }) : null;
      if (cancelled) return;
      draftRef.current = stored; setSavedDraft(stored);
      if (stored) clientKey.current = stored.clientKey;
      const ids = stored ? stored.content.orders.map(row => row.orderId) : (orderIds || [orderId]);
      const buyer = stored?.buyerOrgId ?? buyerOrgId;
      const data = combineInvoiceSources(await Promise.all(ids.map(id => requestJSON(`/invoices/order-source/${encodeURIComponent(id)}${buildQueryString({ orgId, buyerOrgId: buyer })}`, { skipCache: true }))));
      const restoredLines = stored ? restoreInvoiceDraftLines(stored.content, data) : data.lines;
        if (cancelled) return;
        setSource(data); setLines(data.lines);
        if (stored) {
          setLines(restoredLines);
          setBasis(stored.content.basis); setCurrency(stored.content.currency);
          setFields(stored.content.fields); setPercentages(stored.content.percentages);
          return;
        }
        const prices = data.styles.flatMap((style) => style.prices);
        const first = prices.find((p) => p.pricingBasis === INVOICE_BASES[0].value && p.currencyCode === 'USD') || prices[0];
        setBasis(first?.pricingBasis || INVOICE_BASES[0].value); setCurrency(first?.currencyCode || data.currencies?.[0] || '');
        const date = new Date().toLocaleDateString('sv-SE');
        setFields({ number: `DRAFT-${data.orderNumber}`, date, seller: data.seller, buyer: data.buyer,
          shipTo: [data.buyer.name, data.buyer.address, data.buyer.country].filter(Boolean).join('\n'),
          shipmentDate: '', dueDate: '', incoterm: '', paymentTerms: '', bank: '', notes: '' });
    };
    load().catch((e) => { if (!cancelled) setError(String(e.message).includes('INVOICE_SOURCE_CHANGED') || /404|403/.test(String(e.status)) ? storageText.sourceChanged : t.load); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, orderIds, orgId, buyerOrgId, draftId, reload, t.load, storageText.sourceChanged]);
  const currencies = source?.currencies || [];
  const calculation = useMemo(() => !source ? null : applyOrderBillingPercentages(source,
    calculateInvoiceDraft(source, lines, basis, currency), percentages), [source, lines, basis, currency, percentages]);
  const changeBilling = (setter, value) => { if (saving) return; setter(value); setReviewed(false); setDirty(true); };
  const changeField = (key, value) => { if (saving) return; setFields((f) => ({ ...f, [key]: value })); setReviewed(false); setDirty(true); };
  const changeLine = (key, property, value) => {
    if (saving) return;
    setLines((rows) => rows.map((row) => row.key === key ? { ...row, [property]: value } : row)); setReviewed(false); setDirty(true);
  };
  const close = () => {
    if (saving) return;
    const message = languageCode === 'ko' ? '초안이 저장되지 않습니다. 입력 내용을 버리고 닫을까요?'
      : languageCode === 'vi' ? 'Bản nháp chưa được lưu. Bỏ thay đổi và đóng?' : 'This draft is not saved. Discard changes and close?';
    if (!dirty || window.confirm(message)) { setDirty(false); onClose(); }
  };
  const save = async () => {
    if (!source || saving) return;
    setSaving(true); setError(''); setSaveNotice('');
    const previous = draftRef.current;
    try {
      const stored = await requestJSON(`/invoices/drafts${previous ? `/${encodeURIComponent(previous.id)}` : ''}${buildQueryString({ orgId })}`, {
        method: previous ? 'PUT' : 'POST', body: JSON.stringify({ clientKey: clientKey.current, revision: previous?.revision,
          buyerOrgId: source.buyerOrgId, orders: source.orders, lines, basis, currency, fields, percentages }),
      });
      draftRef.current = stored; setSavedDraft(stored); setDirty(false); setSaveNotice(storageText.saved);
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS], orgId });
    } catch (e) {
      setError(String(e.message).includes('INVOICE_SOURCE_CHANGED') ? storageText.sourceChanged :
        String(e.message).includes('STALE_EDIT') || String(e.message).includes('NOT_FOUND') ? storageText.conflict : storageText.failed);
    } finally { setSaving(false); }
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
        <Alert severity="info">{storageText.notice}</Alert>
        {savedDraft && source && <Alert severity="info">{storageText.review}</Alert>}
        {saveNotice && <Alert severity="success">{saveNotice}</Alert>}
        {loading && <CircularProgress />}
        {error && <Alert severity="error" action={<Button disabled={saving} onClick={() => { if (!dirty || window.confirm(storageText.discard)) setReload((v) => v + 1); }}>{t.retry}</Button>}>{error}</Alert>}
        {!source && savedDraft && <Box><Typography>{storageText.stored}</Typography><Typography>{savedDraft.content.fields.number} · {savedDraft.content.fields.notes}</Typography>
          <Table size="small"><TableBody>{savedDraft.content.lines.map((row, index) => <TableRow key={row.key}><TableCell>{row.label || `#${index + 1}`}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{row.remark}</TableCell></TableRow>)}</TableBody></Table>
        </Box>}
        {source && fields && <Box component="fieldset" disabled={saving} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2">{billingText.multiOrderExplanation}</Typography>
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t.scope} value={basis} onChange={(e) => { changeBilling(setBasis, e.target.value); setCurrency(''); }} sx={{ minWidth: 140 }}>
              {INVOICE_BASES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t.currency} value={currency} onChange={(e) => { changeBilling(setCurrency, e.target.value); }} sx={{ minWidth: 140 }}>
              <MenuItem value="">—</MenuItem>{currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          <>
          <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow>
            <TableCell>{billingText.orderStyle}</TableCell>{[t.ordered, t.produced, t.invoice, t.price, t.amount].map((label) => <TableCell key={label} align="right">{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.styles.map((style) => <TableRow key={style.styleScopeKey ?? style.styleId ?? 'missing'}>
            <TableCell><Typography variant="subtitle2">{style.orderNumber}</Typography>{style.code} · {style.name}{!style.ready && ' ⚠'}</TableCell>
            <TableCell align="right">{style.orderedQuantity}</TableCell><TableCell align="right">{style.producedQuantity ?? '—'}</TableCell>
            <TableCell align="right">{style.invoiceQuantity}</TableCell><TableCell align="right">{style.unitPrice ?? '—'}</TableCell><TableCell align="right">{style.amount ?? '—'}</TableCell>
          </TableRow>)}</TableBody></Table></Box>
          <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 1100 }}><TableHead><TableRow>
            {[billingText.orderStyle, t.ordered, t.quantity, t.price, t.amount, 'Remark', t.reason, 'HS / Origin'].map((label) => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.lines.map((line) => <TableRow key={line.key}>
            <TableCell><Typography variant="subtitle2">{line.orderNumber}</Typography>{[line.styleCode, line.color, line.gender, line.size].filter(Boolean).join(' / ')}<Typography variant="caption" display="block">{line.description}</Typography></TableCell>
            <TableCell>{line.orderedQuantity}</TableCell>
            <TableCell><TextField size="small" value={lines.find((row) => row.key === line.key)?.quantity ?? ''} inputProps={{ inputMode: 'numeric', 'aria-label': `${t.quantity} ${line.key}` }} onChange={(e) => changeLine(line.key, 'quantity', e.target.value)} sx={{ width: 100 }} /></TableCell>
            <TableCell>{line.unitPrice ?? '—'}<Typography variant="caption" display="block">{line.bucketQuantity == null ? '' : `≥ ${line.bucketQuantity} PCS`}</Typography></TableCell>
            <TableCell>{line.amount ?? '—'}</TableCell>
            <TableCell><TextField size="small" multiline value={line.remark || ''} label="Remark" inputProps={{ maxLength: 1000, 'aria-label': `Remark ${line.key}` }} onChange={(e) => changeLine(line.key, 'remark', e.target.value)} /></TableCell>
            <TableCell><TextField size="small" value={line.adjustmentReason} placeholder={t.reason} inputProps={{ 'aria-label': `${t.reason} ${line.key}`, maxLength: 500 }} onChange={(e) => changeLine(line.key, 'adjustmentReason', e.target.value)} /></TableCell>
            <TableCell><Stack spacing={1}>{['hsCode', 'origin'].map((key) => <TextField key={key} size="small" label={key === 'hsCode' ? 'HS code' : 'Origin'} value={line[key]} onChange={(e) => changeLine(line.key, key, e.target.value)} />)}</Stack></TableCell>
          </TableRow>)}</TableBody></Table></Box>
          </>
          <Typography variant="h6">{billingText.settlement}</Typography>
          <Typography variant="body2">{billingText.percentHint}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" label={billingText.percentage} placeholder="100" value={allPercentage} inputProps={{ inputMode: 'decimal', maxLength: 6 }} onChange={e => setAllPercentage(e.target.value)} />
            <Button onClick={() => changeBilling(setPercentages, Object.fromEntries(source.orders.map(order => [order.orderId, allPercentage])))}>{billingText.applyAll}</Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 650 }}><TableHead><TableRow>
            {[billingText.orderStyle, billingText.subtotal, billingText.percentage, billingText.currentAmount, billingText.remainingPreview].map(label => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.orders.map(order => <TableRow key={order.orderId}>
            <TableCell>{order.orderNumber}</TableCell><TableCell>{order.subtotal ?? '—'}</TableCell>
            <TableCell><TextField size="small" placeholder="100" value={percentages[order.orderId] ?? ''} error={order.percentage == null}
              inputProps={{ inputMode: 'decimal', maxLength: 6, 'aria-label': `${billingText.percentage} ${order.orderNumber}` }} sx={{ width: 100 }}
              onChange={e => changeBilling(setPercentages, { ...percentages, [order.orderId]: e.target.value })} /></TableCell>
            <TableCell>{order.amount ?? '—'}</TableCell><TableCell>{order.difference ?? '—'}</TableCell>
          </TableRow>)}</TableBody></Table></Box>
          <Typography variant="caption" color="text.secondary">{billingText.previewHint}</Typography>
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
          {calculation.warnings.map((issue) => <Alert severity="warning" key={issue}>{t.issues[issue]}</Alert>)}
          <FormControlLabel control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} label={t.review} />
        </Box>}
      </Stack>
    </DialogContent>
    <DialogActions><Button disabled={saving} onClick={close}>{t.close}</Button>
      <Button onClick={save} disabled={loading || saving || !source || (!dirty && !!savedDraft)}>{saving ? <CircularProgress size={18} /> : storageText.save}</Button>
      <Button variant="contained" onClick={print} disabled={loading || saving || !!error || !source || !reviewed || !!calculation?.issues.length || !fields?.number.trim() || !fields?.date}>{t.print}</Button></DialogActions>
  </Dialog>;
}
