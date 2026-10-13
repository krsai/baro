import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';
import { TRANSACTION_TEXT, serviceName } from '../../components/OutsourcingServiceDialog';

export const REQUEST_FORM_TEXT = {
  ko: { title: '비용 신청', date: '신청일', code: '내역 코드', price: '단가', quantity: '수량', vat: 'VAT (%)', subtotal: '공급가액', tax: 'VAT 금액', total: '합계', options: '입력 옵션', order: '주문', style: '스타일', process: '공정', assignment: '생산 배정', submit: '신청 등록', cancel: '취소', saveError: '신청을 저장하지 못했습니다. 입력 항목과 연결 대상을 확인해 주세요.', noPlan: '선택한 공정을 기록할 수 있는 배정이 없습니다. 생산 배정과 공정 검토 상태를 확인해 주세요.', processInfo: '공정·수량을 연결해 저장하면 입력 수량이 즉시 생산 실적으로 반영됩니다. AT 학습 자료에는 포함되지 않습니다.', codeHint: 'TRKV처럼 코드를 입력하거나 내역을 선택하세요.', saved: '비용 신청을 등록했습니다.' },
  en: { title: 'Transaction cost request', date: 'Request date', code: 'Transaction code', price: 'Unit price', quantity: 'Quantity', vat: 'VAT (%)', subtotal: 'Subtotal', tax: 'VAT amount', total: 'Total', options: 'Input options', order: 'Order', style: 'Style', process: 'Process', assignment: 'Production assignment', submit: 'Register request', cancel: 'Cancel', saveError: 'Could not save the request. Check the inputs and linked records.', noPlan: 'No eligible assignment for this process. Check production assignments and process review.', processInfo: 'Saving a linked process and quantity immediately records production. It does not enter AT training.', codeHint: 'Enter a code such as TRKV or select a transaction.', saved: 'Transaction cost request registered.' },
  vi: { title: 'Đề nghị chi phí giao dịch', date: 'Ngày đề nghị', code: 'Mã nội dung', price: 'Đơn giá', quantity: 'Số lượng', vat: 'VAT (%)', subtotal: 'Tiền trước thuế', tax: 'Tiền VAT', total: 'Tổng cộng', options: 'Tùy chọn nhập', order: 'Đơn hàng', style: 'Mẫu', process: 'Công đoạn', assignment: 'Phân công sản xuất', submit: 'Ghi nhận đề nghị', cancel: 'Hủy', saveError: 'Không thể lưu đề nghị. Vui lòng kiểm tra dữ liệu và các liên kết.', noPlan: 'Không có phân công phù hợp. Vui lòng kiểm tra phân công và trạng thái duyệt công đoạn.', processInfo: 'Lưu công đoạn và số lượng sẽ ghi nhận sản lượng ngay. Dữ liệu này không dùng để huấn luyện AT.', codeHint: 'Nhập mã như TRKV hoặc chọn nội dung.', saved: 'Đã ghi nhận đề nghị chi phí giao dịch.' },
};
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const initialForm = () => ({ transactionDate: today(), partnerOrgId: '', transactionCodeId: '', description: '', unitPrice: '', quantity: '', currency: 'VND', vatRate: '0', workOrderId: '', styleId: '', styleProcessId: '', assignmentPlanId: '', details: {}, clientKey: crypto.randomUUID() });

export default function TransactionRequestEntry() {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const { navigateToPath, showNotification } = useAppActions();
  const labels = REQUEST_FORM_TEXT[languageCode] || REQUEST_FORM_TEXT.ko;
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const [form, setForm] = useState(initialForm), [partners, setPartners] = useState([]), [codes, setCodes] = useState([]), [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ defaultVatRate: '10' }), [options, setOptions] = useState({ styles: [], plans: [] });
  const [loading, setLoading] = useState(true), [optionsLoading, setOptionsLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [enabled, setEnabled] = useState({ order: false, style: false, process: false });
  useEffect(() => {
    let alive = true; setLoading(true); setError(''); setForm(initialForm());
    const query = buildQueryString({ orgId: activeOrgId });
    Promise.all([requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId, type: 'PROCESS_OUTSOURCING' })}`, { skipCache: true }), requestJSON(`/transaction-codes${query}`, { skipCache: true }), requestJSON(`/app-settings${query}`, { skipCache: true }), requestJSON(`/orders${query}`, { skipCache: true })])
      .then(([vendors, descriptions, defaults, orderRows]) => { if (alive) { setPartners(vendors); setCodes(descriptions); setSettings(defaults); setOrders(orderRows.filter(order => order.ownerOrgId === Number(activeOrgId))); } })
      .catch(() => alive && setError(common.loadError)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [activeOrgId, common.loadError]);
  const partner = partners.find(row => row.id === form.partnerOrgId);
  const codeOptions = codes.filter(row => partner?.serviceTypes?.some(service => service.id === row.serviceTypeId));
  const code = codeOptions.find(row => row.id === form.transactionCodeId) || null;
  const service = code?.serviceType, isProcess = service?.entryMode === 'PROCESS';
  const mode = key => isProcess ? 'REQUIRED' : service?.[`${key}Input`] || (key === 'order' ? 'OPTIONAL' : 'HIDDEN');
  const visible = key => mode(key) === 'REQUIRED' || mode(key) === 'OPTIONAL' && enabled[key];
  const selectedStyle = options.styles.find(row => row.id === form.styleId);
  const plans = useMemo(() => options.plans.filter(plan => plan.styleId === form.styleId && plan.processIds?.includes(form.styleProcessId)), [options.plans, form.styleId, form.styleProcessId]);
  useEffect(() => {
    let alive = true; setOptions({ styles: [], plans: [] });
    if (!form.workOrderId) { setOptionsLoading(false); return () => { alive = false; }; }
    setOptionsLoading(true);
    requestJSON(`/transaction-request-options${buildQueryString({ orgId: activeOrgId, workOrderId: form.workOrderId })}`, { skipCache: true })
      .then(data => alive && setOptions(data)).catch(() => alive && setError(common.loadError)).finally(() => alive && setOptionsLoading(false));
    return () => { alive = false; };
  }, [form.workOrderId, activeOrgId, common.loadError]);
  useEffect(() => { setForm(current => ({ ...current, assignmentPlanId: plans.length === 1 ? plans[0].id : plans.some(plan => plan.id === current.assignmentPlanId) ? current.assignmentPlanId : '' })); }, [plans]);
  const chooseCode = selected => {
    setForm(current => ({ ...current, transactionCodeId: selected?.id || '', description: serviceName(selected, languageCode), vatRate: selected?.vatEnabled ? String(settings.defaultVatRate) : '0', currency: selected?.serviceType?.entryMode === 'PROCESS' ? 'VND' : current.currency, workOrderId: '', styleId: '', styleProcessId: '', assignmentPlanId: '', details: {} }));
    setEnabled({ order: false, style: false, process: false });
  };
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const requiredFields = service?.requiredFields || [];
  const valid = code && form.transactionDate && form.description.trim() && [form.unitPrice,form.quantity].every(value => /^\d{1,12}(\.\d{1,4})?$/.test(value) && Number(value) > 0) && /^\d{1,3}(\.\d{1,2})?$/.test(form.vatRate) && Number(form.vatRate) <= 100 && (!isProcess || Number.isInteger(Number(form.quantity)) && form.assignmentPlanId) && ['order','style','process'].every(key => mode(key) !== 'REQUIRED' || form[{ order: 'workOrderId', style: 'styleId', process: 'styleProcessId' }[key]]) && requiredFields.every(key => form.details[key]?.trim());
  const factor = form.currency === 'USD' ? 100 : 1;
  const subtotal = Math.round(Number(form.unitPrice || 0) * Number(form.quantity || 0) * factor) / factor;
  const tax = Math.round(subtotal * Number(form.vatRate || 0) / 100 * factor) / factor;
  const format = value => new Intl.NumberFormat(languageCode === 'vi' ? 'vi-VN' : languageCode === 'en' ? 'en-US' : 'ko-KR', { style: 'currency', currency: form.currency }).format(value);
  const close = () => navigateToPath('/outsourcing-record', { label: labels.title, closeTabId: '/outsourcing-record/new' });
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setError('');
    try {
      await requestJSON(`/outsourcing-requests${buildQueryString({ orgId: activeOrgId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, workOrderId: form.workOrderId || null, styleId: form.styleId || null, styleProcessId: form.styleProcessId || null, assignmentPlanId: isProcess ? form.assignmentPlanId : null }) });
      emitWorkspaceDataChanged({ orgId: activeOrgId, topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD], source: 'transaction-request' });
      showNotification(labels.saved, 'success'); close();
    } catch { setError(labels.saveError); } finally { setSaving(false); }
  };
  return <AppPageContainer title={labels.title}><Paper variant="outlined" sx={{ p: 3, maxWidth: 960 }}><Stack spacing={2} component="fieldset" disabled={loading || saving} sx={{ border: 0, p: 0, m: 0 }}>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField required type="date" label={labels.date} value={form.transactionDate} onChange={update('transactionDate')} slotProps={{ inputLabel: { shrink: true } }} />
    <TextField select required label={common.partner} value={form.partnerOrgId} onChange={event => { setForm({ ...initialForm(), transactionDate: form.transactionDate, partnerOrgId: event.target.value }); setEnabled({ order: false, style: false, process: false }); }}>{partners.filter(row => row.isActive).map(row => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</TextField>
    <Autocomplete options={codeOptions} value={code} disabled={!partner || saving} autoHighlight autoSelect getOptionLabel={row => `${row.code} · ${serviceName(row, languageCode)}${row.taxTreatment ? ` · ${serviceName(row.taxTreatment, languageCode)}` : ""}`} isOptionEqualToValue={(a,b) => a.id === b.id} filterOptions={(rows, state) => rows.filter(row => `${row.code} ${serviceName(row, languageCode)}`.toLocaleLowerCase().includes(state.inputValue.toLocaleLowerCase()))} onChange={(_, row) => chooseCode(row)} onInputChange={(_, text, reason) => { if (reason === 'input') { const match = codeOptions.find(row => row.code.toUpperCase() === text.trim().toUpperCase()); if (match && match.id !== code?.id) chooseCode(match); } }} renderInput={params => <TextField {...params} required label={labels.code} helperText={labels.codeHint} />} />
    <TextField label={common.description} required value={form.description} onChange={update('description')} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField required label={labels.price} value={form.unitPrice} onChange={update('unitPrice')} inputProps={{ inputMode: 'decimal' }} /><TextField required label={labels.quantity} value={form.quantity} onChange={update('quantity')} inputProps={{ inputMode: 'decimal' }} /><TextField select disabled={isProcess} label={common.currency} value={form.currency} onChange={update('currency')}>{['VND','USD','KRW'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField label={labels.vat} disabled={!code?.vatEnabled} value={form.vatRate} onChange={update('vatRate')} inputProps={{ inputMode: 'decimal' }} /></Stack>
    {code && <><Typography fontWeight={700}>{labels.options}</Typography><Stack direction="row">{['order','style','process'].filter(key => mode(key) === 'OPTIONAL').map(key => <FormControlLabel key={key} label={labels[key]} control={<Checkbox checked={enabled[key]} disabled={key === 'style' && !visible('order') || key === 'process' && !visible('style')} onChange={event => { const checked = event.target.checked; setEnabled(current => ({ ...current, [key]: checked, ...(key === 'order' && !checked ? { style: false, process: false } : key === 'style' && !checked ? { process: false } : {}) })); setForm(current => ({ ...current, ...(key === 'order' ? { workOrderId: '', styleId: '', styleProcessId: '', assignmentPlanId: '' } : key === 'style' ? { styleId: '', styleProcessId: '', assignmentPlanId: '' } : { styleProcessId: '', assignmentPlanId: '' }) })); }} />} />)}</Stack></>}
    {visible('order') && <TextField required={mode('order') === 'REQUIRED'} select label={labels.order} value={form.workOrderId} onChange={event => setForm({ ...form, workOrderId: event.target.value, styleId: '', styleProcessId: '', assignmentPlanId: '' })}><MenuItem value="">{common.none}</MenuItem>{orders.map(row => <MenuItem key={row.dbId} value={row.dbId}>{row.orderNumber}</MenuItem>)}</TextField>}
    {visible('style') && <TextField select required={mode('style') === 'REQUIRED'} disabled={!form.workOrderId || optionsLoading} label={labels.style} value={form.styleId} onChange={event => setForm({ ...form, styleId: event.target.value, styleProcessId: '', assignmentPlanId: '' })}><MenuItem value="">{common.none}</MenuItem>{options.styles.map(row => <MenuItem key={row.id} value={row.id}>{row.name} ({row.code})</MenuItem>)}</TextField>}
    {visible('process') && <TextField select required={mode('process') === 'REQUIRED'} disabled={!selectedStyle || optionsLoading} label={labels.process} value={form.styleProcessId} onChange={event => setForm({ ...form, styleProcessId: event.target.value, assignmentPlanId: '' })}><MenuItem value="">{common.none}</MenuItem>{(selectedStyle?.styleProcesses || []).map(row => <MenuItem key={row.id} value={row.id}>{row.processName} ({row.processCode})</MenuItem>)}</TextField>}
    {isProcess && <Alert severity="info">{labels.processInfo}</Alert>}
    {isProcess && form.styleProcessId && !optionsLoading && !plans.length && <Alert severity="warning">{labels.noPlan}</Alert>}
    {isProcess && plans.length > 1 && <TextField required select label={labels.assignment} value={form.assignmentPlanId} onChange={update('assignmentPlanId')}>{plans.map(row => <MenuItem key={row.id} value={row.id}>{row.factoryName} · #{row.id}</MenuItem>)}</TextField>}
    {requiredFields.map(key => <TextField key={key} required type={key === 'transportDate' ? 'date' : 'text'} label={common[key]} value={form.details[key] || ''} slotProps={key === 'transportDate' ? { inputLabel: { shrink: true } } : {}} onChange={event => setForm({ ...form, details: { ...form.details, [key]: event.target.value } })} />)}
    <Box><Typography>{labels.subtotal}: {format(subtotal)}</Typography><Typography>{labels.tax}: {format(tax)}</Typography><Typography fontWeight={700}>{labels.total}: {format(subtotal + tax)}</Typography></Box>
    <Stack direction="row" spacing={2}><Button onClick={close} disabled={saving}>{labels.cancel}</Button><Button variant="contained" disabled={!valid || saving || loading || optionsLoading} onClick={save}>{labels.submit}</Button></Stack>
  </Stack></Paper></AppPageContainer>;
}
