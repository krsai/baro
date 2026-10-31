import {documentNumberText,documentNumberError} from '../../../constants/documentNumber';
import { usePageDialogs } from '../../../components/PageDialogProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import InvoiceSheet from '../../../components/InvoiceSheet';
import DecimalAmountField from '../../../components/DecimalAmountField';
import {invoiceStyleRows,invoiceNumber,distributeInvoiceQuantity} from '../../../utils/invoiceStyleRows.mjs';
import {invoiceUi,invoiceSubmissionUi} from '../../../constants/invoiceUi';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { INVOICE_BASES, calculateInvoiceDraft, combineInvoiceSources, applyOrderBillingPercentages } from '../../../utils/invoiceDraft.mjs';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';
import { restoreInvoiceDraftLines } from '../../../utils/invoiceDraftRestore.mjs';
import { formatInvoiceMoney } from '../../../utils/invoiceItemGrid.mjs';
import { invoiceProductionReview } from '../../../utils/invoiceProductionReview.mjs';
import { invoiceProductionMessages } from '../../../constants/invoiceProductionMessages';
import { LABEL_PALETTE } from '../../../theme/labelPalette';
import QuantityReviewDrawer from '../../../components/QuantityReviewDrawer';

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
      "PRICE": "단가는 0보다 큰 숫자로 소수 넷째 자리까지 입력하세요.",
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
      "PRICE": "Enter a positive unit price with up to four decimal places.",
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
      "PRICE": "Nhập đơn giá lớn hơn 0, tối đa bốn chữ số thập phân.",
      "EMPTY": "Chưa có số lượng xuất hóa đơn.",
      "CURRENCY": "Chọn tiền tệ.",
      "DEDUCTION": "Khoản khấu trừ phải hợp lệ và không vượt quá số tiền hiện tại.",
      "DEDUCTION_REASON": "Cần lý do khi thay đổi khoản khấu trừ mặc định."
    }
  }
};

export default function InvoiceEditor({ open = true, onClose, onIssued, orderId, orderIds, orgId, buyerOrgId, draftId, renderSelection, languageCode = 'ko' }) {
  const pageDialogs = usePageDialogs();
  const productionText = invoiceProductionMessages[languageCode] || invoiceProductionMessages.en;
  const [reviewAssignment,setReviewAssignment] = useState(null);
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
    setReviewAssignment(null);
    if (!open) {
      draftRef.current = null; setSavedDraft(null); clientKey.current = globalThis.crypto.randomUUID();
      return;
    }
    if (!draftId && !orderId && !orderIds?.length) {
      setSource(null); setFields(null); setLines([]); setLoading(false); setError(''); setReviewed(false);
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
        setBasis(first?.pricingBasis || INVOICE_BASES[0].value); setCurrency(first?.currencyCode || data.currencies?.[0] || 'USD');
        const date = new Date().toLocaleDateString('sv-SE');
        setFields({ number: '', date, seller: data.seller, buyer: data.buyer,
          shipTo: [data.buyer.name, data.buyer.address, data.buyer.country].filter(Boolean).join('\n'),
          shipmentDate: '', dueDate: '', incoterm: '', paymentTerms: '', bank: '', notes: '' });
        setSettlements(Object.fromEntries(data.orders.map(order => [order.orderId, { deduction: order.settlementsByCurrency?.[first?.currencyCode]?.defaultDeductionAmount || '', reason: '' }])));
    };
    load().catch((e) => { if (!cancelled) setError(String(e.message).includes('INVOICE_SOURCE_CHANGED') || /404|403/.test(String(e.status)) ? ui.sourceChanged : t.load); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, orderIds, orgId, buyerOrgId, draftId, reload, t.load, storageText.sourceChanged]);
  const calculation = useMemo(() => !source ? null : applyOrderBillingPercentages(source,
    calculateInvoiceDraft(source, lines, basis, currency), percentages, settlements, currency), [source, lines, basis, currency, percentages, settlements]);
  const styleRows = useMemo(() => invoiceStyleRows(calculation?.lines || []), [calculation]);
  const draftLinesByKey = useMemo(() => new Map(lines.map(line => [line.key, line])), [lines]);
  const itemText = languageCode === 'ko' ? { order: '주문', style: '스타일명', color: '색상', gender: '성별', note: 'Remark', hint: '수량 변경 사유를 함께 적어 주세요.' }
    : languageCode === 'vi' ? { order: 'Đơn hàng', style: 'Tên mẫu', color: 'Màu sắc', gender: 'Giới tính', note: 'Remark', hint: 'Ghi rõ lý do thay đổi số lượng.' }
    : { order: 'Order', style: 'Style name', color: 'Color', gender: 'Gender', note: 'Remark', hint: 'Include the reason for quantity changes.' };
  const changeBilling = (setter, value) => { if (saving) return; setter(value); setReviewed(false); setDirty(true); };
  const changeField = (key, value) => { if (saving) return; setFields((f) => ({ ...f, [key]: value })); setReviewed(false); setDirty(true); };
  const changeItemNote = (group, value) => {
    if (saving || uncertain) return;
    const keys = new Set(group.lines.map(line => line.key));
    setLines(rows => rows.map(row => keys.has(row.key) ? { ...row, remark: value, adjustmentReason: value } : row));
    setReviewed(false); setDirty(true);
  };
  const close = async () => {
    if (saving) return;
    if ((!dirty && !uncertain) || await pageDialogs.confirm(ui.discard)) { setDirty(false); onClose(); }
  };
  const requestSelectionChange = async change => {
    if (saving || uncertain) return;
    if ((dirty || savedDraft) && !await pageDialogs.confirm(ui.discard)) return;
    draftRef.current = null; setSavedDraft(null); clientKey.current = globalThis.crypto.randomUUID();
    setDirty(false); setReviewed(false); setSource(null); setFields(null); setError('');
    change();
  };
  const issue = async () => {
    if (!source || saving || !reviewed || calculation?.issues.length || !fields?.date) return;
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
      setError(documentNumberError(e.details?.error||e.message,languageCode) || (String(e.message).includes('INVOICE_ORDER_FULLY_BILLED') ? (languageCode==='ko'?'이미 100% 이상 청구된 주문이 있습니다. 청구 대상을 다시 선택하세요.':languageCode==='vi'?'Có đơn hàng đã được lập hóa đơn đủ 100%. Vui lòng chọn lại đơn hàng.':'An order is already fully billed. Please select the orders again.') : unknown ? ui.uncertain : String(e.message).includes('INVOICE_CREDIT_') ? ui.credit : String(e.message).includes('SOURCE_CHANGED') ? ui.sourceChanged : ui.failed));
    } finally { setSaving(false); }
  };
  return <AppPageContainer title={draftId ? ui.edit : ui.create} titleActions={<Stack direction="row" spacing={1}>
    <Button disabled={saving} onClick={close}>{ui.cancel}</Button>
    <Button variant="contained" onClick={issue} disabled={loading || saving || !source || !reviewed || !!calculation?.issues.length || !fields?.date}>{saving ? <CircularProgress size={18}/> : ui.issue}</Button>
  </Stack>}>
    <InvoiceSheet>
      <Stack spacing={3} sx={{minWidth:0}}>
        <Typography component="div" className="invoice-heading">INVOICE</Typography>
        {renderSelection?.({requestChange:requestSelectionChange,disabled:saving||uncertain})}
        {loading && <CircularProgress />}
        {error && <Alert severity="error" action={<Button disabled={saving || uncertain} onClick={async () => { if (!dirty || await pageDialogs.confirm(storageText.discard)) setReload((v) => v + 1); }}>{t.retry}</Button>}>{error}</Alert>}
        {source && fields && <Box component="fieldset" disabled={saving || uncertain} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box className="invoice-parties">{['seller', 'buyer'].map((party) => <Box key={party}><Typography variant="overline">{t[party]}</Typography><Box sx={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1}}>
              {['name', 'address', 'country', 'taxId', 'email', 'phone'].map((key) => <TextField key={key} size="small" label={ui[key]} value={fields[party][key]||''} sx={key==='name'||key==='address'?{gridColumn:'1 / -1'}:undefined} inputProps={{ maxLength: 1000 }} onChange={(e) => changeField(party, { ...fields[party], [key]: e.target.value })} />)}
            </Box></Box>)}</Box>
          <Box className="invoice-metadata">
            <TextField size="small" label={ui.date} type="date" value={fields.date} onChange={e=>changeField('date',e.target.value)} InputLabelProps={{shrink:true}}/>
            <TextField size="small" label={(documentNumberText[languageCode]||documentNumberText.en).invoice} placeholder="INV-YYYY-000001" helperText={(documentNumberText[languageCode]||documentNumberText.en).auto} value={fields.number} onChange={e=>changeField('number',e.target.value)} inputProps={{maxLength:200}}/>
          </Box>


          <Typography variant="subtitle1">{t.metadata}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {[['shipmentDate', ui.shipmentDate, 'date'], ['dueDate', ui.dueDate, 'date'], ['incoterm', ui.incoterm], ['paymentTerms', ui.paymentTerms], ['shipTo', ui.shipTo], ['bank', ui.bank]].map(([key, label, type]) =>
              <TextField key={key} size="small" label={label} type={type || 'text'} multiline={!type} minRows={!type ? 2 : undefined} value={fields[key]} onChange={(e) => changeField(key, e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ maxLength: 2000 }} />)}

          </Box>
          <Box sx={{overflowX:'auto',border:'1px solid',borderColor:'divider'}}><Table size="small" sx={{minWidth:720,'& td':{verticalAlign:'top'},'& th':{whiteSpace:'nowrap'}}}><TableHead><TableRow>
            {[itemText.order,itemText.style,t.quantity,t.price,t.amount,itemText.note].map((label,index)=><TableCell key={label} align={index>=2&&index<=4?'right':'left'}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{styleRows.map(group=>{const first=group.lines[0],changed=group.lines.some(line=>line.quantity!==line.orderedQuantity),production=invoiceProductionReview(source,first);return <TableRow key={first.key} data-production-review={production?'true':undefined} sx={production?{bgcolor:LABEL_PALETTE.yellow.background}:undefined}>
            <TableCell sx={{whiteSpace:'nowrap'}}>{first.orderNumber}</TableCell>
            <TableCell><Typography variant="body2" fontWeight={600}>{first.styleCode}</Typography>{first.description||first.styleName}
              {production&&<Typography variant="caption" display="block" color="warning.main">{productionText.scope}: {invoiceNumber(production.style.producedQuantity)} / {invoiceNumber(production.style.orderedQuantity)}</Typography>}
              {production?.problems.map(assignment=><Box key={assignment.externalId||assignment.id}><Typography variant="caption">{assignment.factoryName} {invoiceNumber(assignment.producedQuantity)} / {invoiceNumber(assignment.plannedQuantity)}</Typography>{assignment.externalId&&<Button size="small" onClick={()=>setReviewAssignment({externalId:assignment.externalId,orderNumber:first.orderNumber,styleLabel:first.description||first.styleCode,quantity:assignment.plannedQuantity})}>{productionText.open}</Button>}</Box>)}
            </TableCell>
            <TableCell align="right"><DecimalAmountField size="small" value={String(group.quantity??'')} onValueChange={value=>{const distributed=distributeInvoiceQuantity(group,value);if(!distributed||saving||uncertain)return;const values=new Map(distributed.map(row=>[row.key,row.quantity]));setLines(previous=>previous.map(row=>values.has(row.key)?{...row,quantity:values.get(row.key),adjustmentReason:row.adjustmentReason||row.remark||''}:row));setReviewed(false);setDirty(true);}} inputProps={{'aria-label':t.quantity+' '+first.key,style:{textAlign:'right'}}} sx={{width:110}}/><Typography variant="caption" display="block">{t.ordered} {invoiceNumber(group.orderedQuantity)}</Typography></TableCell>
            <TableCell align="right"><DecimalAmountField size="small" value={draftLinesByKey.get(first.key)?.unitPriceOverride??first.unitPrice??''} onValueChange={value=>{if(saving||uncertain)return;const keys=new Set(group.lines.map(line=>line.key));setLines(previous=>previous.map(line=>keys.has(line.key)?{...line,unitPriceOverride:value}:line));setReviewed(false);setDirty(true);}} inputProps={{'aria-label':t.price+' '+first.key,style:{textAlign:'right'}}} sx={{width:120}}/><Typography variant="caption">{currency}</Typography></TableCell>
            <TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatInvoiceMoney(group.amount,currency)}</TableCell>
            <TableCell><TextField size="small" multiline value={group.note} label={itemText.note} required={changed} inputProps={{maxLength:1000,'aria-label':'Remark '+first.key}} onChange={e=>changeItemNote(group,e.target.value)}/></TableCell>
          </TableRow>;})}</TableBody></Table></Box>
          <Stack spacing={2}>
          <Typography variant="h6">{billingText.settlement}</Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" label={billingText.percentage} placeholder="100" value={allPercentage} inputProps={{ inputMode: 'decimal', maxLength: 6 }} onChange={e => setAllPercentage(e.target.value)} />
            <Button onClick={() => changeBilling(setPercentages, Object.fromEntries(source.orders.map(order => [order.orderId, allPercentage])))}>{billingText.applyAll}</Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 650 }}><TableHead><TableRow>
            {[billingText.orderStyle, billingText.subtotal, billingText.percentage, billingText.currentAmount, settlementLabels.deduction, ui.summary].map((label,index) => <TableCell key={label} align={index ? 'right' : 'left'}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{calculation.orders.map(order => <TableRow key={order.orderId}>
            <TableCell>{order.orderNumber}</TableCell><TableCell align="right">{formatInvoiceMoney(order.subtotal,currency)}</TableCell>
            <TableCell align="right"><TextField size="small" placeholder="100" value={percentages[order.orderId] ?? ''} error={order.percentage == null}
              inputProps={{ inputMode: 'decimal', maxLength: 6, 'aria-label': `${billingText.percentage} ${order.orderNumber}` }} sx={{ width: 100 }}
              onChange={e => changeBilling(setPercentages, { ...percentages, [order.orderId]: e.target.value })} /></TableCell>
            <TableCell align="right">{formatInvoiceMoney(order.amount,currency)}</TableCell>
            <TableCell align="right"><Stack spacing={1}><DecimalAmountField size="small" value={settlements[order.orderId]?.deduction ?? ''} inputProps={{style:{textAlign:'right'}}} onValueChange={value => changeBilling(setSettlements, { ...settlements, [order.orderId]: { ...settlements[order.orderId], deduction: value } })} /><TextField size="small" placeholder={settlementLabels.reason} value={settlements[order.orderId]?.reason ?? ''} onChange={e => changeBilling(setSettlements, { ...settlements, [order.orderId]: { ...settlements[order.orderId], reason: e.target.value } })} /></Stack></TableCell>
            <TableCell align="right">{formatInvoiceMoney(order.netAmount,currency)}{order.hasUnallocatedPayments && <Typography color="warning.main" variant="caption" display="block">{settlementLabels.unallocated}</Typography>}</TableCell>
          </TableRow>)}</TableBody></Table></Box>
          </Stack>
          <TextField size="small" label={ui.notes} value={fields.notes} onChange={e=>changeField('notes',e.target.value)} inputProps={{maxLength:2000}}/>
          <Box sx={{bgcolor:'grey.50',p:2,borderRadius:1}}>          <Typography align="right" variant="h6">TOTAL {formatInvoiceMoney(calculation.total,currency)}</Typography>
          <Typography align="right" variant="subtitle1">{settlementLabels.newReceivable} {formatInvoiceMoney(calculation.receivableAdded,currency)}</Typography>
</Box>
          {calculation.issues.map((issue) => <Alert severity="warning" key={issue}>{billingText.errors[issue] || t.issues[issue]}</Alert>)}
          {calculation.warnings.map((issue) => <Alert severity="warning" key={issue}>{t.issues[issue]}</Alert>)}
          <FormControlLabel control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} label={t.review} />
        </Box>}
      </Stack>
    </InvoiceSheet>
    <QuantityReviewDrawer externalId={reviewAssignment?.externalId} orgId={orgId} languageCode={languageCode} headerOrderNo={reviewAssignment?.orderNumber} headerStyleLabel={reviewAssignment?.styleLabel} headerQuantity={reviewAssignment?.quantity} onClose={()=>setReviewAssignment(null)}/>
  </AppPageContainer>;
}
