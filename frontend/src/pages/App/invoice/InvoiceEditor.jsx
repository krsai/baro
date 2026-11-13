import {managementTargetText} from '../../../constants/managementTargets';
import {cashScheduleText} from '../../../constants/cashSchedule';
import {useAppActions} from '../../../context/AppContext';
import InvoiceFormHeader from '../../../components/InvoiceFormHeader';
import InvoiceFormSummary from '../../../components/InvoiceFormSummary';
import {invoiceBankInfo} from '../../../utils/invoiceBankInfo.mjs';
import {invoiceDocumentText} from '../../../constants/invoiceDocument';
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

export default function InvoiceEditor({ open = true, onClose, onIssued, orderId, orderIds, orgId, buyerOrgId, draftId, revisionInvoice, renderSelection, languageCode = 'ko' }) {
  const pageDialogs = usePageDialogs();
  const {showNotification}=useAppActions();
  const productionText = invoiceProductionMessages[languageCode] || invoiceProductionMessages.en;
  const [reviewAssignment,setReviewAssignment] = useState(null);
  const ui = invoiceUi[languageCode] || invoiceUi.en;
  const sheetText=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const t = messages[languageCode] || messages.en;
  const billingText = invoiceMessages[languageCode] || invoiceMessages.en;
  const storageText = invoiceSubmissionUi[languageCode] || invoiceSubmissionUi.en;
  const adjustmentErrors = languageCode==='ko'?{ADJUSTMENT:'\uc870\uc815 \uae08\uc561\uc744 \ud655\uc778\ud558\uc138\uc694. \uccad\uad6c \uae08\uc561\uc740 0 \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.',ADJUSTMENT_REASON:'REMARK\uc5d0 \uae08\uc561 \uc870\uc815 \uc0ac\uc720\ub97c \uc785\ub825\ud558\uc138\uc694.'}:languageCode==='vi'?{ADJUSTMENT:'Ki\u1ec3m tra s\u1ed1 ti\u1ec1n \u0111i\u1ec1u ch\u1ec9nh. T\u1ed5ng ph\u1ea3i t\u1eeb 0 tr\u1edf l\u00ean.',ADJUSTMENT_REASON:'Nh\u1eadp l\u00fd do \u0111i\u1ec1u ch\u1ec9nh trong REMARK.'}:{ADJUSTMENT:'Check the adjustment amount. The total must be nonnegative.',ADJUSTMENT_REASON:'Enter the adjustment reason in REMARK.'};
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
    if (!revisionInvoice && !draftId && !orderId && !orderIds?.length) {
      setSource(null); setFields(null); setLines([]); setLoading(false); setError(''); setReviewed(false);
      setDirty(false); setSavedDraft(null); draftRef.current=null; clientKey.current=globalThis.crypto.randomUUID();
      return;
    }
    let cancelled = false;
    setLoading(true); setSource(null); setFields(null); setError(''); setReviewed(false);
    setDirty(false);
    setPercentages({}); setSettlements({}); setAllPercentage(''); setUncertain(false);
    const load = async () => {
      const resumeId = draftId || draftRef.current?.id;
      const stored = resumeId ? await requestJSON(`/invoices/drafts/${encodeURIComponent(resumeId)}${buildQueryString({ orgId })}`, { skipCache: true }) : null;
      const restored = stored || (revisionInvoice ? {buyerOrgId:revisionInvoice.buyerOrgId,revisionOfInvoiceId:revisionInvoice.id,content:{
        version:2,buyerOrgId:revisionInvoice.buyerOrgId,basis:revisionInvoice.pricingBasis,currency:revisionInvoice.currencyCode,
        fields:{...revisionInvoice.snapshot.fields,number:revisionInvoice.invoiceNumber+'-R'+(Number(revisionInvoice.revisionNumber||1)+1)},
        orders:revisionInvoice.orders.map(row=>({orderId:row.sourceOrderId,sourceUpdatedAt:row.sourceUpdatedAt})),
        percentages:Object.fromEntries(revisionInvoice.orders.map(row=>[row.sourceOrderId,String(row.billingPercentage)])),
        settlements:Object.fromEntries(revisionInvoice.orders.map(row=>[row.sourceOrderId,{deduction:String(row.appliedDeductionAmount),reason:revisionInvoice.snapshot.fields.notes||row.deductionReason||'',adjustment:String(revisionInvoice.snapshot.orders?.find(order=>order.sourceOrderId===row.sourceOrderId)?.adjustmentAmount||'')}])),
        lines:revisionInvoice.snapshot.lines.map(row=>({key:row.lineKey,quantity:String(row.quantity),unitPriceOverride:String(row.unitPrice),remark:row.remark||'',adjustmentReason:row.adjustmentReason||'',hsCode:row.hsCode||'',origin:row.origin||''})),
      }} : null);
      if (cancelled) return;
      draftRef.current = stored; setSavedDraft(stored);
      if (stored) clientKey.current = stored.clientKey;
      const ids = restored ? restored.content.orders.map(row => row.orderId) : (orderIds || [orderId]);
      const buyer = restored?.buyerOrgId ?? buyerOrgId;
      const data = combineInvoiceSources(await Promise.all(ids.map(id => requestJSON(`/invoices/order-source/${encodeURIComponent(id)}${buildQueryString({ orgId, buyerOrgId: buyer, revisionOfInvoiceId: restored?.revisionOfInvoiceId })}`, { skipCache: true }))));
      const restoredLines = restored ? restoreInvoiceDraftLines(restored.content, data) : data.lines;
        if (cancelled) return;
        setSource(data); setLines(data.lines);
        if (restored) {
          setLines(restoredLines);
          setBasis(restored.content.basis); setCurrency(restored.content.currency);
          setFields(restored.content.fields); setPercentages(restored.content.percentages); setSettlements(restored.content.settlements || {});
          return;
        }
        const prices = data.styles.flatMap((style) => style.prices);
        const first = prices.find((p) => p.pricingBasis === INVOICE_BASES[0].value && p.currencyCode === 'USD') || prices[0];
        setBasis(first?.pricingBasis || INVOICE_BASES[0].value); setCurrency(first?.currencyCode || data.currencies?.[0] || 'USD');
        const date = new Date().toLocaleDateString('sv-SE');
        setFields({ number: '', date, seller: data.seller, buyer: data.buyer,
          shipTo: '',
          shipmentDate: '', dueDate: '', expectedCollectionDate:'', incoterm: '', paymentTerms: '', bank: invoiceBankInfo(data.sellerBankAccounts,first?.currencyCode||data.currencies?.[0]||'USD'), notes: '' });
        setSettlements(Object.fromEntries(data.orders.map(order => [order.orderId, { deduction: order.settlementsByCurrency?.[first?.currencyCode]?.defaultDeductionAmount || '', reason: '' }])));
    };
    load().catch((e) => { if (!cancelled) setError(String(e.message).includes('INVOICE_SOURCE_CHANGED') || /404|403/.test(String(e.status)) ? ui.sourceChanged : t.load); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, orderIds, orgId, buyerOrgId, draftId, revisionInvoice, reload, t.load, storageText.sourceChanged]);
  const calculation = useMemo(() => !source ? null : applyOrderBillingPercentages(source,
    calculateInvoiceDraft(source, lines, basis, currency), percentages, settlements, currency), [source, lines, basis, currency, percentages, settlements]);
  const styleRows = useMemo(() => invoiceStyleRows(calculation?.lines || []), [calculation]);
  const draftLinesByKey = useMemo(() => new Map(lines.map(line => [line.key, line])), [lines]);
  const changeBilling = (setter, value) => { if (saving) return; setter(value); setReviewed(false); setDirty(true); };
  const changeField = (key, value) => { if (saving) return; setFields((f) => ({ ...f, [key]: value })); setReviewed(false); setDirty(true); };
  const changeRemark = value => {
    if(saving||uncertain)return;
    changeField('notes',value);
    setSettlements(rows=>Object.fromEntries(Object.entries(rows).map(([key,row])=>[key,{...row,reason:value}])));
    setLines(rows=>rows.map(row=>Number(row.quantity)!==row.orderedQuantity?{...row,adjustmentReason:value}:row));
  };
  const requestSelectionChange = async change => {
    if (saving || uncertain) return;
    if ((dirty || savedDraft) && !await pageDialogs.confirm(ui.discard)) return;
    draftRef.current = null; setSavedDraft(null); clientKey.current = globalThis.crypto.randomUUID();
    setDirty(false); setReviewed(false); setSource(null); setFields(null); setError('');
    change();
  };
  const revisionRequest = useRef(null);
  const revisionNeedsSave = useRef(false);

    const issue = async (options={}) => {
    if (!source || saving || !reviewed || calculation?.issues.length || !fields?.date) return;
    const issueFields={...fields,bank:invoiceBankInfo(source?.sellerBankAccounts||[])};
    if (!uncertain && !await pageDialogs.confirm(storageText.confirmIssue)) return;
    if (revisionInvoice && !draftRef.current && !revisionRequest.current) {
      const reason = await pageDialogs.prompt(languageCode==='ko'?'개정 사유를 입력하세요.':languageCode==='vi'?'Nhập lý do sửa đổi.':'Enter a revision reason.');
      if (!reason?.trim()) return;
      revisionRequest.current={clientKey:clientKey.current,reason:reason.trim()};
    }
    setSaving(true); setError('');
    try {
      let current = draftRef.current;
      if (revisionInvoice && !current) {
        current = await requestJSON('/invoices/issued/'+encodeURIComponent(revisionInvoice.id)+'/revision-draft'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(revisionRequest.current)});
        clientKey.current=current.clientKey;
        draftRef.current=current; setSavedDraft(current); revisionNeedsSave.current=true;
      }
      if (!current || revisionNeedsSave.current || (!uncertain && (dirty||issueFields.bank!==fields.bank))) {
        current = await requestJSON(`/invoices/drafts${current ? `/${encodeURIComponent(current.id)}` : ''}${buildQueryString({ orgId })}`, {
          method: current ? 'PUT' : 'POST', body: JSON.stringify({ clientKey: clientKey.current, revision: current?.revision,
            buyerOrgId: source.buyerOrgId, orders: source.orders, lines, basis, currency, fields:issueFields, percentages, settlements }),
        });
        draftRef.current = current; setSavedDraft(current); revisionNeedsSave.current=false; setDirty(false);
      }
      await requestJSON(`/invoices/drafts/${encodeURIComponent(current.id)}/issue${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ revision: current.revision }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId });
      setDirty(false); setUncertain(false); setSavedDraft(null);
      showNotification(storageText.issued,'success'); (onIssued || onClose)();
    } catch (e) {
      const unknown = !e.status || e.status >= 500;
      setUncertain(unknown);
      setError((managementTargetText[languageCode]||managementTargetText.en)[e.message] || (e.message==='INVALID_CASH_SCHEDULE_DATE'?(cashScheduleText[languageCode]||cashScheduleText.en).invalid:'') || documentNumberError(e.details?.error||e.message,languageCode) || (String(e.message).includes('INVOICE_ORDER_FULLY_BILLED') ? (languageCode==='ko'?'이미 100% 이상 청구된 주문이 있습니다. 청구 대상을 다시 선택하세요.':languageCode==='vi'?'Có đơn hàng đã được lập hóa đơn đủ 100%. Vui lòng chọn lại đơn hàng.':'An order is already fully billed. Please select the orders again.') : unknown ? ui.uncertain : String(e.message).includes('INVOICE_CREDIT_') ? ui.credit : String(e.message).includes('SOURCE_CHANGED') ? ui.sourceChanged : ui.failed));
    } finally { setSaving(false); }
  };
  return <AppPageContainer keyboardEntry title={revisionInvoice ? (languageCode==='ko'?'청구서 상세':languageCode==='vi'?'Chi tiết hóa đơn':'Invoice detail') : draftId ? ui.edit : ui.create} titleActions={<Stack direction="row" spacing={1}>
    <Button variant="contained" onClick={issue} disabled={loading || saving || !source || !reviewed || !!calculation?.issues.length || !fields?.date}>{saving ? <CircularProgress size={18}/> : ui.issue}</Button>
  </Stack>}>
    <InvoiceSheet>
      <Stack spacing={0} sx={{minWidth:0}}>
        {renderSelection&&<Box sx={{p:2,borderBottom:1,borderColor:'divider'}}>{renderSelection({requestChange:requestSelectionChange,disabled:saving||uncertain})}</Box>}
        {loading && <CircularProgress />}
        {error && <Alert severity="error" action={<Button disabled={saving || uncertain} onClick={async () => { if (!dirty || await pageDialogs.confirm(storageText.discard)) setReload((v) => v + 1); }}>{t.retry}</Button>}>{error}</Alert>}
        {source && fields && <Box component="fieldset" disabled={saving || uncertain} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <InvoiceFormHeader fields={fields} languageCode={languageCode} onChange={changeField}/>
          <Typography className="invoice-section-title">{ui.details} · {invoiceNumber(styleRows.length)}</Typography>
          <Box sx={{overflowX:'auto'}}><Table data-table-layout="document" className="invoice-lines" size="small" sx={{minWidth:820,'& td':{verticalAlign:'middle'},'& th':{whiteSpace:'nowrap'}}}><colgroup>{[40,110,null,100,130,120,150].map((width,index)=><col key={index} style={width?{width}:undefined}/>)}</colgroup><TableHead><TableRow>
            {[sheetText.row,sheetText.orderNumber,sheetText.style,sheetText.orderedQuantity,t.price,t.quantity,t.amount].map((label,index)=><TableCell key={label} align={index===0||index>=3?'right':'left'}>{label}</TableCell>)}
          </TableRow></TableHead><TableBody>{styleRows.map((group,index)=>{const first=group.lines[0],production=invoiceProductionReview(source,first);return <React.Fragment key={first.key}>{(index===0||styleRows[index-1].lines[0].orderId!==first.orderId)&&<TableRow data-invoice-order-controls={first.orderId}><TableCell colSpan={7}><Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center"><Typography fontWeight={700}>{first.orderNumber}</Typography><TextField size="small" label={billingText.percentage} inputProps={{inputMode:'decimal',maxLength:6,'aria-label':billingText.percentage+' '+first.orderNumber}} placeholder="100" value={percentages[first.orderId]??''} sx={{width:110}} onChange={e=>changeBilling(setPercentages,{...percentages,[first.orderId]:e.target.value})}/><Typography sx={{ml:'auto'}}>{ui.summary}: {formatInvoiceMoney(calculation.orders.find(o=>o.orderId===first.orderId)?.netAmount,currency)}</Typography></Stack></TableCell></TableRow>}<TableRow key={first.key} data-invoice-line="true" data-production-review={production?'true':undefined} sx={production?{bgcolor:LABEL_PALETTE.yellow.background}:undefined}>
            <TableCell align="right">{invoiceNumber(index+1)}</TableCell>
            <TableCell>{first.orderNumber}</TableCell><TableCell>{first.description||first.styleName}
              {production&&<Typography variant="caption" display="block" color="warning.main">{productionText.scope}: {invoiceNumber(production.style.producedQuantity)} / {invoiceNumber(production.style.orderedQuantity)}</Typography>}
              {production?.problems.map(assignment=><Box key={assignment.externalId||assignment.id}><Typography variant="caption">{assignment.factoryName} {invoiceNumber(assignment.producedQuantity)} / {invoiceNumber(assignment.plannedQuantity)}</Typography>{assignment.externalId&&<Button size="small" onClick={()=>setReviewAssignment({externalId:assignment.externalId,orderNumber:first.orderNumber,styleLabel:first.description||first.styleName||'—',quantity:assignment.plannedQuantity})}>{productionText.open}</Button>}</Box>)}
            </TableCell>
            <TableCell align="right">{invoiceNumber(group.orderedQuantity)}</TableCell><TableCell align="right"><DecimalAmountField currencyCode={currency} size="small" value={draftLinesByKey.get(first.key)?.unitPriceOverride??first.unitPrice??''} onValueChange={value=>{if(saving||uncertain)return;const keys=new Set(group.lines.map(line=>line.key));setLines(previous=>previous.map(line=>keys.has(line.key)?{...line,unitPriceOverride:value}:line));setReviewed(false);setDirty(true);}} inputProps={{'aria-label':t.price+' '+first.key,style:{textAlign:'right'}}} sx={{width:120}}/></TableCell>
            <TableCell align="right"><DecimalAmountField size="small" value={String(group.quantity??'')} onValueChange={value=>{const distributed=distributeInvoiceQuantity(group,value);if(!distributed||saving||uncertain)return;const values=new Map(distributed.map(row=>[row.key,row.quantity]));setLines(previous=>previous.map(row=>values.has(row.key)?{...row,quantity:values.get(row.key),adjustmentReason:fields.notes||row.adjustmentReason||row.remark||''}:row));setReviewed(false);setDirty(true);}} inputProps={{'aria-label':t.quantity+' '+first.key,style:{textAlign:'right'}}} sx={{width:110}}/></TableCell>
            <TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatInvoiceMoney(group.amount,currency)}</TableCell>

          </TableRow></React.Fragment>;})}</TableBody></Table></Box>
          <Stack spacing={1.5} sx={{p:2}}>{source.orders.map(order=><Stack key={order.orderId} direction="row" spacing={1.5} alignItems="center"><Typography>{order.orderNumber}</Typography><DecimalAmountField size="small" currencyCode={currency} allowNegative allowPositiveSign label={languageCode==='ko'?'금액 조정 (+/-)':languageCode==='vi'?'Điều chỉnh (+/-)':'Amount adjustment (+/-)'} value={settlements[order.orderId]?.adjustment??''} onValueChange={value=>changeBilling(setSettlements,{...settlements,[order.orderId]:{...settlements[order.orderId],adjustment:value,reason:fields.notes||''}})} sx={{width:200}}/></Stack>)}</Stack>
          <InvoiceFormSummary fields={{...fields,bank:invoiceBankInfo(source?.sellerBankAccounts||[])}} total={calculation.total} orders={calculation.orders} currencyCode={currency} languageCode={languageCode} onRemark={changeRemark}/>
          {calculation.issues.map((issue) => <Alert severity="warning" key={issue}>{billingText.errors[issue] || t.issues[issue] || adjustmentErrors[issue]}</Alert>)}
          {calculation.warnings.map((issue) => <Alert severity="warning" key={issue}>{t.issues[issue]}</Alert>)}
          <FormControlLabel control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} label={t.review} />
        </Box>}
      </Stack>
    </InvoiceSheet>
    <QuantityReviewDrawer externalId={reviewAssignment?.externalId} orgId={orgId} languageCode={languageCode} headerOrderNo={reviewAssignment?.orderNumber} headerStyleLabel={reviewAssignment?.styleLabel} headerQuantity={reviewAssignment?.quantity} onClose={()=>setReviewAssignment(null)}/>
  </AppPageContainer>;
}
