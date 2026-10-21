import { usePageDialogs } from '../../../components/PageDialogProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Accordion, AccordionSummary, AccordionDetails, Paper, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import ExpandMore from '@mui/icons-material/ExpandMore';
import {invoiceUi,invoiceSubmissionUi} from '../../../constants/invoiceUi';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { INVOICE_BASES, calculateInvoiceDraft, combineInvoiceSources, applyOrderBillingPercentages } from '../../../utils/invoiceDraft.mjs';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';
import { restoreInvoiceDraftLines } from '../../../utils/invoiceDraftRestore.mjs';

const messages = {
  "ko": {
    "load": "주문·생산 실적·단가표를 불러오지 못했습니다.",
    "review": "생산 수량과 청구 수량의 차이, 세부 수량 및 단가를 확인했습니다.",
    "ordered": "주문",
    "quantity": "청구 수량",
    "reason": "수량 변경 사유",
    "price": "단가",
    "amount": "금액",
    "scope": "단가 기준",
    "currency": "통화",
    "metadata": "문서 및 결제 정보",
    "seller": "판매자",
    "buyer": "구매자",
    "retry": "다시 조회",
    "issues": {
      "PRODUCTION": "완료되지 않았거나 생산 근거 확인이 필요한 스타일/배정이 있습니다.",
      "QUANTITY": "수량은 0 이상의 정수로 입력하세요.",
      "REASON": "주문 수량과 달라진 행에는 변경 사유가 필요합니다.",
      "PRICE": "해당 통화·CMT/FP·수량 구간의 활성 단가가 없습니다. 고객 단가표를 확인하세요.",
      "EMPTY": "청구 수량이 없습니다.",
      "CURRENCY": "통화를 선택하세요.",
      "DEDUCTION": "차감액은 이번 기준액 이하의 유효한 금액이어야 합니다.",
      "DEDUCTION_REASON": "기본 차감액을 변경하면 사유가 필요합니다."
    }
  },
  "en": {
    "load": "Unable to load order, production and prices.",
    "review": "I reviewed production differences, detailed quantities and prices.",
    "ordered": "Ordered",
    "quantity": "Invoice qty",
    "reason": "Adjustment reason",
    "price": "Unit price",
    "amount": "Amount",
    "scope": "Price basis",
    "currency": "Currency",
    "metadata": "Document and payment details",
    "seller": "Seller",
    "buyer": "Buyer",
    "retry": "Reload",
    "issues": {
      "PRODUCTION": "Some styles/assignments are incomplete or require production review.",
      "QUANTITY": "Enter a nonnegative integer quantity.",
      "REASON": "Explain each quantity adjustment.",
      "PRICE": "No active price for this currency, basis or quantity tier. Check customer prices.",
      "EMPTY": "No quantity to invoice.",
      "CURRENCY": "Select a currency.",
      "DEDUCTION": "Deduction must be valid and no greater than the current amount.",
      "DEDUCTION_REASON": "Explain changes from the default deduction."
    }
  },
  "vi": {
    "load": "Không thể tải đơn hàng, sản lượng và đơn giá.",
    "review": "Tôi đã kiểm tra chênh lệch sản lượng, số lượng chi tiết và đơn giá.",
    "ordered": "Đặt hàng",
    "quantity": "SL hóa đơn",
    "reason": "Lý do điều chỉnh",
    "price": "Đơn giá",
    "amount": "Thành tiền",
    "scope": "Cơ sở giá",
    "currency": "Tiền tệ",
    "metadata": "Thông tin hóa đơn và thanh toán",
    "seller": "Bên bán",
    "buyer": "Bên mua",
    "retry": "Tải lại",
    "issues": {
      "PRODUCTION": "Có mã hàng/phân công chưa hoàn thành hoặc cần kiểm tra.",
      "QUANTITY": "Nhập số nguyên không âm.",
      "REASON": "Cần lý do điều chỉnh số lượng.",
      "PRICE": "Không có đơn giá hiện hành phù hợp. Kiểm tra bảng giá khách hàng.",
      "EMPTY": "Chưa có số lượng xuất hóa đơn.",
      "CURRENCY": "Chọn tiền tệ.",
      "DEDUCTION": "Khoản khấu trừ phải hợp lệ và không vượt quá số tiền hiện tại.",
      "DEDUCTION_REASON": "Cần lý do khi thay đổi khoản khấu trừ mặc định."
    }
  }
};

export default function InvoiceEditor({ open = true, onClose, onIssued, orderId, orderIds, orgId, buyerOrgId, draftId, languageCode = 'ko' }) {
  const pageDialogs = usePageDialogs();
  const ui = invoiceUi[languageCode] || invoiceUi.en;
  const t = messages[languageCode] || messages.en;
  const billingText = invoiceMessages[languageCode] || invoiceMessages.en;
  const storageText = invoiceSubmissionUi[languageCode] || invoiceSubmissionUi.en;
  const settlementLabels = languageCode === 'ko' ? {
    prior: '이전 청구 / 입금', deduction: '이번 차감', outstanding: '기존 미수', statement: '안내금액 / 신규채권', reason: '차감 변경 사유', unallocated: '다중 주문 입금 미배분', newReceivable: '신규 채권',
  } : languageCode === 'vi' ? {
    prior: 'Đã lập / đã thu', deduction: 'Khấu trừ', outstanding: 'Nợ cũ', statement: 'Thông báo / khoản phải thu mới', reason: 'Lý do đổi khấu trừ', unallocated: 'Khoản thu nhiều đơn chưa phân bổ', newReceivable: 'Khoản phải thu mới',
  } : {
    prior: 'Prior billed / received', deduction: 'Deduction', outstanding: 'Prior outstanding', statement: 'Statement / new receivable', reason: 'Reason for changing deduction', unallocated: 'Multi-order payment is unallocated', newReceivable: 'New receivable',
  };
  const [savedDraft, setSavedDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
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
  const [settlements, setSettlements] = useState({});
  const [allPercentage, setAllPercentage] = useState('');
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(open && (dirty || saving || uncertain || Boolean(savedDraft)));

  useEffect(() => {
    if (!open) {
      draftRef.current = null; setSavedDraft(null); clientKey.current = globalThis.crypto.randomUUID();
      return;
    }
    let cancelled = false;
    setLoading(true); setSource(null); setFields(null); setError(''); setReviewed(false);
    setDirty(false);
    setPercentages({}); setSettlements({}); setAllPercentage(''); setUncertain(false);
    const load = async () => {
      const resumeId = draftId || draftRef.current?.id;
      const stored = resumeId ? await requestJSON(`/invoices/drafts/${encodeURIComponent(resumeId)}${buildQueryString({ orgId })}`, { skipCache: true }) : null;
      if (cancelled) return;
      draftRef.current = stored; setSavedDraft(stored);
      if (stored) clientKey.current = stored.clientKey;
      const ids = stored ? stored.content.orders.map(row => row.orderId) : (orderIds || [orderId]);
      const buyer = stored?.buyerOrgId ?? buyerOrgId;
      const data = combineInvoiceSources(await Promise.all(ids.map(id => requestJSON(`/invoices/order-source/${encodeURIComponent(id)}${buildQueryString({ orgId, buyerOrgId: buyer, revisionOfInvoiceId: stored?.revisionOfInvoiceId })}`, { skipCache: true }))));
      const restoredLines = stored ? restoreInvoiceDraftLines(stored.content, data) : data.lines;
        if (cancelled) return;
        setSource(data); setLines(data.lines);
        if (stored) {
          setLines(restoredLines);
          setBasis(stored.content.basis); setCurrency(stored.content.currency);
          setFields(stored.content.fields); setPercentages(stored.content.percentages); setSettlements(stored.content.settlements || {});
          return;
        }
        const prices = data.styles.flatMap((style) => style.prices);
        const first = prices.find((p) => p.pricingBasis === INVOICE_BASES[0].value && p.currencyCode === 'USD') || prices[0];
        setBasis(first?.pricingBasis || INVOICE_BASES[0].value); setCurrency(first?.currencyCode || data.currencies?.[0] || '');
        const date = new Date().toLocaleDateString('sv-SE');
        setFields({ number: data.orderNumber, date, seller: data.seller, buyer: data.buyer,
          shipTo: [data.buyer.name, data.buyer.address, data.buyer.country].filter(Boolean).join('\n'),
          shipmentDate: '', dueDate: '', incoterm: '', paymentTerms: '', bank: '', notes: '' });
        setSettlements(Object.fromEntries(data.orders.map(order => [order.orderId, { deduction: order.settlementsByCurrency?.[first?.currencyCode]?.defaultDeductionAmount || '', reason: '' }])));
    };
    load().catch((e) => { if (!cancelled) setError(String(e.message).includes('INVOICE_SOURCE_CHANGED') || /404|403/.test(String(e.status)) ? ui.sourceChanged : t.load); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, orderIds, orgId, buyerOrgId, draftId, reload, t.load, storageText.sourceChanged]);
  const currencies = source?.currencies || [];
  const calculation = useMemo(() => !source ? null : applyOrderBillingPercentages(source,
    calculateInvoiceDraft(source, lines, basis, currency), percentages, settlements, currency), [source, lines, basis, currency, percentages, settlements]);
  const changeBilling = (setter, value) => { if (saving) return; setter(value); setReviewed(false); setDirty(true); };
  const changeField = (key, value) => { if (saving) return; setFields((f) => ({ ...f, [key]: value })); setReviewed(false); setDirty(true); };
  const changeLine = (key, property, value) => {
    if (saving) return;
    setLines((rows) => rows.map((row) => row.key === key ? { ...row, [property]: value } : row)); setReviewed(false); setDirty(true);
  };
  const close = async () => {
    if (saving) return;
    if ((!dirty && !uncertain) || await pageDialogs.confirm(ui.discard)) { setDirty(false); onClose(); }
  };
  const issue = async () => {
    if (!source || saving || !reviewed || calculation?.issues.length || !fields?.number.trim() || !fields?.date) return;
    if (!uncertain && !await pageDialogs.confirm(storageText.confirmIssue)) return;
    setSaving(true); setError('');
    try {
      let current = draftRef.current;
      if (!current || (!uncertain && dirty)) {
        current = await requestJSON(`/invoices/drafts${current ? `/${encodeURIComponent(current.id)}` : ''}${buildQueryString({ orgId })}`, {
          method: current ? 'PUT' : 'POST', body: JSON.stringify({ clientKey: clientKey.current, revision: current?.revision,
            buyerOrgId: source.buyerOrgId, orders: source.orders, lines, basis, currency, fields, percentages, settlements }),
        });
        draftRef.current = current; setSavedDraft(current); setDirty(false);
      }
      await requestJSON(`/invoices/drafts/${encodeURIComponent(current.id)}/issue${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ revision: current.revision }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId });
      setDirty(false); setUncertain(false); setSavedDraft(null);
      await pageDialogs.alert(storageText.issued); (onIssued || onClose)();
    } catch (e) {
      const unknown = !e.status || e.status >= 500;
      setUncertain(unknown);
      setError(unknown ? ui.uncertain : String(e.message).includes('INVOICE_CREDIT_') ? ui.credit : String(e.message).includes('SOURCE_CHANGED') ? ui.sourceChanged : ui.failed);
    } finally { setSaving(false); }
  };
  return <AppPageContainer title={draftId ? ui.edit : ui.create} titleActions={<Stack direction="row" spacing={1}>
    <Button disabled={saving} onClick={close}>{ui.cancel}</Button>
    <Button variant="contained" onClick={issue} disabled={loading || saving || !source || !reviewed || !!calculation?.issues.length || !fields?.number.trim() || !fields?.date}>{saving ? <CircularProgress size={18}/> : ui.issue}</Button>
  </Stack>}>
    <Paper variant="outlined" sx={{overflow:'hidden',borderRadius:2}}>
      <Stack spacing={2} sx={{p:2,minWidth:0}}>
        {loading && <CircularProgress />}
        {error && <Alert severity="error" action={<Button disabled={saving || uncertain} onClick={async () => { if (!dirty || await pageDialogs.confirm(storageText.discard)) setReload((v) => v + 1); }}>{t.retry}</Button>}>{error}</Alert>}
        {source && fields && <Box component="fieldset" disabled={saving || uncertain} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'180px minmax(0,1fr) minmax(0,1fr)'},gap:2}}>
            <TextField size="small" label={ui.date} type="date" value={fields.date} onChange={e=>changeField('date',e.target.value)} InputLabelProps={{shrink:true}}/>
            <TextField size="small" label={billingText.customer} value={fields.buyer.name} slotProps={{input:{readOnly:true}}}/>
            <TextField size="small" label={ui.number} value={fields.number} onChange={e=>changeField('number',e.target.value)} inputProps={{maxLength:200}}/>
          </Box>
          <TextField size="small" label={ui.notes} value={fields.notes} onChange={e=>changeField('notes',e.target.value)} inputProps={{maxLength:2000}}/>
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t.scope} value={basis} onChange={(e) => { changeBilling(setBasis, e.target.value); setCurrency(''); }} sx={{ minWidth: 140 }}>
              {INVOICE_BASES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t.currency} value={currency} onChange={(e) => { const next = e.target.value; changeBilling(setCurrency, next); setSettlements(Object.fromEntries(source.orders.map(order => [order.orderId, { deduction: order.settlementsByCurrency?.[next]?.defaultDeductionAmount || '', reason: '' }]))); }} sx={{ minWidth: 140 }}>
              <MenuItem value="">—</MenuItem>{currencies.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          <Typography component="h2" variant="subtitle2">{ui.details} · {calculation.lines.length}</Typography>
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
          <Accordion disableGutters elevation={0} sx={{border: "1px solid",borderColor:"divider",borderRadius:1,"&::before":{display:"none"}}}><AccordionSummary expandIcon={<ExpandMore/>}><Typography variant="subtitle2">{ui.options}</Typography></AccordionSummary><AccordionDetails>
          <Typography variant="h6">{billingText.settlement}</Typography>
          <Typography variant="body2">{billingText.percentHint}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" label={billingText.percentage} placeholder="100" value={allPercentage} inputProps={{ inputMode: 'decimal', maxLength: 6 }} onChange={e => setAllPercentage(e.target.value)} />
            <Button onClick={() => changeBilling(setPercentages, Object.fromEntries(source.orders.map(order => [order.orderId, allPercentage])))}>{billingText.applyAll}</Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 650 }}><TableHead><TableRow>
            {[billingText.orderStyle, billingText.subtotal, billingText.percentage, billingText.currentAmount, settlementLabels.prior, settlementLabels.deduction, settlementLabels.outstanding, settlementLabels.statement].map(label => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.orders.map(order => <TableRow key={order.orderId}>
            <TableCell>{order.orderNumber}</TableCell><TableCell>{order.subtotal ?? '—'}</TableCell>
            <TableCell><TextField size="small" placeholder="100" value={percentages[order.orderId] ?? ''} error={order.percentage == null}
              inputProps={{ inputMode: 'decimal', maxLength: 6, 'aria-label': `${billingText.percentage} ${order.orderNumber}` }} sx={{ width: 100 }}
              onChange={e => changeBilling(setPercentages, { ...percentages, [order.orderId]: e.target.value })} /></TableCell>
            <TableCell>{order.amount ?? '—'}</TableCell><TableCell>{order.priorBilledAmount} / {order.priorReceivedAmount}{order.hasUnallocatedPayments && <Typography color="warning.main" variant="caption" display="block">{settlementLabels.unallocated}</Typography>}</TableCell>
            <TableCell><Stack spacing={1}><TextField size="small" value={settlements[order.orderId]?.deduction ?? ''} inputProps={{ inputMode: 'decimal' }} onChange={e => changeBilling(setSettlements, { ...settlements, [order.orderId]: { ...settlements[order.orderId], deduction: e.target.value } })} /><TextField size="small" placeholder={settlementLabels.reason} value={settlements[order.orderId]?.reason ?? ''} onChange={e => changeBilling(setSettlements, { ...settlements, [order.orderId]: { ...settlements[order.orderId], reason: e.target.value } })} /></Stack></TableCell>
            <TableCell>{order.priorOutstandingAmount}</TableCell><TableCell>{order.netAmount ?? '—'} / {order.receivableAdded ?? '—'}</TableCell>
          </TableRow>)}</TableBody></Table></Box>
          <Typography variant="subtitle1">{t.metadata}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {[['shipmentDate', ui.shipmentDate, 'date'], ['dueDate', ui.dueDate, 'date'], ['incoterm', ui.incoterm], ['paymentTerms', ui.paymentTerms], ['shipTo', ui.shipTo], ['bank', ui.bank]].map(([key, label, type]) =>
              <TextField key={key} size="small" label={label} type={type || 'text'} multiline={!type} minRows={!type ? 2 : undefined} value={fields[key]} onChange={(e) => changeField(key, e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ maxLength: 2000 }} />)}
            {['seller', 'buyer'].map((party) => <Box key={party}><Typography>{t[party]}</Typography><Stack spacing={1}>
              {['name', 'address', 'country', 'taxId', 'email', 'phone'].map((key) => <TextField key={key} size="small" label={ui[key]} value={fields[party][key]} inputProps={{ maxLength: 1000 }} onChange={(e) => changeField(party, { ...fields[party], [key]: e.target.value })} />)}
            </Stack></Box>)}
          </Box>
          </AccordionDetails></Accordion>
          <Box sx={{bgcolor:'grey.50',p:2,borderRadius:1}}>          <Typography align="right" variant="h6">TOTAL {currency} {calculation.total ?? '—'}</Typography>
          <Typography align="right" variant="subtitle1">{settlementLabels.newReceivable} {currency} {calculation.receivableAdded ?? '—'}</Typography>
</Box>
          {calculation.issues.map((issue) => <Alert severity="warning" key={issue}>{billingText.errors[issue] || t.issues[issue]}</Alert>)}
          {calculation.warnings.map((issue) => <Alert severity="warning" key={issue}>{t.issues[issue]}</Alert>)}
          <FormControlLabel control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} label={t.review} />
        </Box>}
      </Stack>
    </Paper>
  </AppPageContainer>;
}
