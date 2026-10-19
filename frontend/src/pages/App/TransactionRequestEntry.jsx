import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Add } from '@mui/icons-material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { getUiMessage } from '../../constants/uiMessages';
import ExpenseLookupField from '../../components/ExpenseLookupField';
import { EXPENSE_LOOKUP_TEXT } from '../../constants/expenseLookup';
import './expenseRequests.css';
import CustomDatePicker from '../../components/CustomDatePicker';
import ExpenseRequestLine from '../../components/ExpenseRequestLine';
import { useManagementPeriod } from '../../context/ManagementPeriodContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import { EXPENSE_REQUEST_TEXT } from '../../constants/expenseRequest';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currencyFormat';
import { expenseTotalsByCurrency, expenseLinePayload, newExpenseLine } from '../../utils/expenseRequest.mjs';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const ENTRY_TITLES = { ko: '비용 신청 등록', en: 'New Payment Request', vi: 'Tạo đề nghị thanh toán' };
const EDIT_TITLES = { ko: '비용 신청 수정', en: 'Edit Payment Request', vi: 'Sửa đề nghị thanh toán' };
const LOCKED_TEXT = { ko: '최종 마감된 주문의 비용 신청은 수정할 수 없습니다.', en: 'This request is read-only because its order is finally locked.', vi: 'Không thể sửa đề nghị vì đơn hàng đã khóa quyết toán.' };

export const REQUEST_FORM_TEXT = EXPENSE_REQUEST_TEXT;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const newDocument = () => { const date = today(); return { title: '', requestDate: date, partnerOrgId: '', clientKey: crypto.randomUUID(), items: [newExpenseLine()] }; };

export default function TransactionRequestEntry() {
  const { sourceKind, sourceId } = useParams();
  const { pathname } = useLocation();
  const editing = Boolean(sourceKind && sourceId);
  const editorPath = editing ? `/expense-request-editor/${encodeURIComponent(sourceKind)}/${encodeURIComponent(sourceId)}` : '/expense-requests';
  const { activeOrgId, user, accessProfile } = useAuth(), { languageCode } = useLanguage();
  const period = useManagementPeriod(), { navigateToPath, showNotification } = useAppActions();
  const labels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const lookup = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const organizationRef = useRef(activeOrgId);
  const tableContainerRef = useRef(null), dragColumnWidths = useRef([]);
  organizationRef.current = activeOrgId;
  const [form, setForm] = useState(newDocument), [data, setData] = useState({ partners: [], codes: [], orders: [], settings: { defaultVatRate: '10' } });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [submission, setSubmission] = useState(null), [dirty, setDirty] = useState(false), [statuses, setStatuses] = useState({});
  const [saved,setSaved] = useState(false);
  useUnsavedChanges(dirty);
  useEffect(() => { if (saved) navigateToPath('/outsourcing-record', { label: labels.document, closeTabId: pathname }); }, [saved,navigateToPath,labels.document,pathname]);
  useEffect(() => { setForm(newDocument()); setDirty(false); setStatuses({}); setSubmission(null); setError(''); setSaving(false); setSaved(false); }, [activeOrgId,sourceKind,sourceId]);
  useEffect(() => {
    let alive = true; setLoading(true); setLoadError(false);
    const query = buildQueryString({ orgId: activeOrgId });
    Promise.all([
      ...['business-partners','transaction-codes','app-settings','orders'].map(path => requestJSON(`/${path}${path === 'transaction-codes' ? buildQueryString({orgId:activeOrgId,forExpenseRequest:'1'}) : query}`, { skipCache: true })),
      editing ? requestJSON(`${editorPath}${query}`,{skipCache:true}) : Promise.resolve(null),
    ])
      .then(([partners,codes,settings,orders,loaded]) => { if (alive) {
        if (loaded?.partner && !partners.some(row=>row.id===loaded.partner.id)) partners=[...partners,{...loaded.partner,isActive:false}];
        setData({ partners, codes, settings, orders: orders.filter(row => row.ownerOrgId === Number(activeOrgId)) });
        if (loaded) setForm({...loaded,clientKey:crypto.randomUUID(),items:loaded.items.map(item=>({...newExpenseLine(),...item,key:crypto.randomUUID()}))});
      } })
      .catch(() => { if (alive) setLoadError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrgId, reload,editing,editorPath]);
  const update = patch => { setDirty(true); setForm(current => ({ ...current, ...patch })); };
  const changeLine = useCallback((key, patch) => { setDirty(true); setForm(current => ({ ...current, items: current.items.map(line => line.key === key ? { ...line, ...patch } : line) })); }, []);
  const lineStatus = useCallback((key, valid) => setStatuses(current => current[key] === valid ? current : { ...current, [key]: valid }), []);
  const reorderLines = ({ source, destination }) => {
    if (disabled || !destination || source.index === destination.index) return;
    setDirty(true);
    setForm(current => {
      const items = [...current.items];
      const [moved] = items.splice(source.index, 1);
      items.splice(destination.index, 0, moved);
      return { ...current, items };
    });
  };
  const removeLine = key => {
    const target = form.items.find(line=>line.key===key);
    if (disabled || form.items[0]?.key === key || target?.sourceRecordId && !target.itemId) return;
    setDirty(true);
    setForm(current => current.items[0]?.key === key ? current : { ...current, items: current.items.filter(line => line.key !== key) });
  };
  const totals = useMemo(() => expenseTotalsByCurrency(form.items), [form.items]);
  const partner = data.partners.find(row => row.id === form.partnerOrgId);
  const disabled = loading || loadError || saving || Boolean(submission) || Boolean(form.readOnly);
  const valid = !period.loading && !period.error && form.title.trim() && form.title.trim().length <= 200 && partner?.isActive &&
    form.requestDate && (!period.startDate || form.requestDate >= period.startDate) && form.items.every(line => statuses[line.key]);
  const money = (value, currency) => formatCurrency(value, { currencyCode: currency, languageCode });
  const close = () => navigateToPath('/outsourcing-record', { label: labels.document, closeTabId: pathname });
  const save = async () => {
    if (saving || !submission && !valid) return;
    const body = submission || { title: form.title, requestDate: form.requestDate, partnerOrgId: form.partnerOrgId, clientKey: form.clientKey, ...(editing ? {revision:form.revision} : {}), items: form.items.map(expenseLinePayload) };
    setSubmission(body); setSaving(true); setError('');
    try {
      await requestJSON(`${editorPath}${buildQueryString({ orgId: activeOrgId })}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      emitWorkspaceDataChanged({ orgId: activeOrgId, topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD], source: 'transaction-request' });
      if (organizationRef.current !== activeOrgId) return;
      setDirty(false); setSaved(true); showNotification(labels.saved, 'success');
    } catch (failure) {
      if (organizationRef.current !== activeOrgId) return;
      if ([400,403,404,409,422].includes(failure.status)) { setSubmission(null); setError(labels.invalid); }
      else setError(labels.saveError);
    } finally { if (organizationRef.current === activeOrgId) setSaving(false); }
  };
  return <AppPageContainer
    title={(editing ? EDIT_TITLES : ENTRY_TITLES)[languageCode] || ENTRY_TITLES.en}
    titleActions={<Stack direction="row" spacing={1}>
      <Button disabled={saving} onClick={close}>{labels.cancel}</Button>
      <SaveButton loading={saving} disabled={loading || loadError || form.readOnly || !submission && !valid} onClick={save}>
        {submission ? labels.retry : getUiMessage('common.save', 'Save', languageCode)}
      </SaveButton>
    </Stack>}
  >
    <Stack spacing={2}>
      {loadError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {period.error && <Alert severity="error">{labels.loadError}</Alert>}
      {form.readOnly && <Alert severity="info">{LOCKED_TEXT[languageCode] || LOCKED_TEXT.en}</Alert>}
      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2.5 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{p:2}}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 180px' }, gap: 2 }}>
            <TextField size="small" required label={labels.title} disabled={disabled} value={form.title} sx={{gridColumn:'1 / -1'}} inputProps={{ maxLength: 200 }} onChange={event => update({ title: event.target.value })} />
            <ExpenseLookupField key={activeOrgId} label={labels.payee} options={data.partners.filter(row => row.isActive)} value={partner || null} onChange={value => update({partnerOrgId:value?.id || ''})} columns={[{key:'name',label:labels.payee,value:row=>row.name}]} languageCode={languageCode} disabled={disabled || form.items.some(line=>line.productionLocked)} required />
            <CustomDatePicker label={labels.date} value={form.requestDate} minDate={period.startDate} adapterLocale={languageCode} disabled={disabled} onChange={(date, context) => { if (date?.isValid() && !context?.validationError) update({ requestDate: date.format('YYYY-MM-DD') }); }} />
          </Box>
          <Stack data-testid="expense-author-context" direction="row" useFlexGap flexWrap="wrap" spacing={3} sx={{mt:2,pt:2,borderTop:1,borderColor:'divider'}}>
            <Typography variant="caption" color="text.secondary">{lookup.issuer}: {accessProfile?.orgName || '—'}</Typography>
            <Typography variant="caption" color="text.secondary">{lookup.author}: {form.createdByEmployee?.name || accessProfile?.employeeName || user?.user_metadata?.full_name || user?.email || '—'}</Typography>
            <Typography variant="caption" color="text.secondary">{labels.vatDefault}: {data.settings.defaultVatRate}%</Typography>
          </Stack></Box>
        </Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle2">{lookup.details} · {form.items.length} {labels.count}</Typography>{loading && <CircularProgress size={20} />}</Stack>
        <DragDropContext onBeforeCapture={() => {
          dragColumnWidths.current = Array.from(tableContainerRef.current?.querySelector('[data-testid="expense-line"]')?.cells || []).map(cell => cell.getBoundingClientRect().width);
        }} onDragEnd={reorderLines}>
          <Droppable droppableId="expense-items" isDropDisabled={disabled}>{provided => (
            <TableContainer ref={tableContainerRef}><Table ref={provided.innerRef} {...provided.droppableProps} size="small" sx={{ minWidth: 1280, tableLayout: 'fixed' }}>
              <colgroup>{[64,128,null,88,96,112,96,112,112,128,88].map((width,index)=><col key={index} style={width ? {width} : undefined} />)}</colgroup>
              <TableHead><TableRow>{['#',labels.code,labels.description,labels.currency,labels.quantity,labels.price,labels.vat,labels.subtotal,labels.tax,labels.total,''].map((label,index) => <TableCell key={index} align={index >= 7 && index <= 9 ? 'right' : 'left'}>{label}</TableCell>)}</TableRow></TableHead>
              {form.items.map((line,index) => <Draggable key={line.key} draggableId={line.key} index={index} disableInteractiveElementBlocking isDragDisabled={disabled}>{(drag,state) => (
                <TableBody ref={drag.innerRef} {...drag.draggableProps} style={{...drag.draggableProps.style,...(state.isDragging ? {display:'table',tableLayout:'fixed'} : {})}} sx={{ bgcolor:'background.paper', boxShadow:state.isDragging ? 3 : 'none', ...(state.isDragging ? Object.fromEntries(dragColumnWidths.current.map((width,column)=>['& tr:first-of-type > td:nth-of-type('+(column+1)+')',{width}])) : {}) }}>
                  <ExpenseRequestLine line={line} index={index} {...data} dragHandleProps={drag.dragHandleProps} partner={partner} orgId={activeOrgId} labels={labels} languageCode={languageCode} disabled={disabled} onChange={changeLine} onRemove={removeLine} onStatus={lineStatus} />
                </TableBody>
              )}</Draggable>)}
              {provided.placeholder}
            </Table></TableContainer>
          )}</Droppable>
        </DragDropContext>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">{labels.limit}</Typography>
          <Button startIcon={<Add />} sx={{ flexShrink:0 }} disabled={disabled || form.items.length >= 50} onClick={() => update({ items: [...form.items, newExpenseLine()] })}>{labels.add}</Button>
        </Stack>
        <Stack alignItems="flex-end" spacing={1} sx={{ p: 3, bgcolor: 'grey.50' }} data-testid="expense-totals">
          {totals.map(total => <Stack key={total.currency} spacing={1} sx={{ width: { xs: '100%', sm: 360 } }}>
            <Typography variant="subtitle2">{total.currency}</Typography>
            <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{labels.subtotal}</Typography><Typography>{money(total.subtotal,total.currency)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{labels.tax}</Typography><Typography>{money(total.vatAmount,total.currency)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between" sx={{pt:1,borderTop:1,borderColor:'divider'}}><Typography fontWeight={700}>{labels.total}</Typography><Typography fontWeight={700} color="primary">{money(total.amount,total.currency)}</Typography></Stack>
          </Stack>)}

        </Stack>
      {form.items.some(line => data.codes.find(code => code.id === line.transactionCodeId)?.base?.entryMode === 'PROCESS') && <Alert severity="info">{labels.processInfo}</Alert>}
      </Paper>
    </Stack>
  </AppPageContainer>;
}
