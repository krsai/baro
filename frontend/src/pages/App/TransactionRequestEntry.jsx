import {ledgerEvidenceErrors} from '../../constants/ledgerEvidence';
import ExpenseApprovalActions from '../../components/ExpenseApprovalActions';
import { useRequestScopeContext } from '../../context/RequestScopeContext';
import ExpenseApprovalSettings from '../../components/ExpenseApprovalSettings';
import {approvalSettingsText} from '../../constants/approvalSettings';
import { ENTITY_TEXT } from '../../constants/entityProfile';
import PageContentStack from '../../components/PageContentStack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Tooltip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Add } from '@mui/icons-material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { getUiMessage } from '../../constants/uiMessages';
import ExpenseLookupField from '../../components/ExpenseLookupField';
import { EXPENSE_LOOKUP_TEXT } from '../../constants/expenseLookup';
import { EXPENSE_TEXT } from '../../constants/expenseTypes';
import {serviceName} from '../../components/OutsourcingServiceDialog';
import BusinessPartnerDialog, {getBusinessPartnerTypeLabel} from '../../components/BusinessPartnerDialog';
import './expenseRequests.css';
import CustomDatePicker from '../../components/CustomDatePicker';
import ExpenseRequestLine from '../../components/ExpenseRequestLine';
import { useManagementPeriod } from '../../context/ManagementPeriodContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAppActions } from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import { EXPENSE_REQUEST_TEXT, EXPENSE_HEADER_TEXT } from '../../constants/expenseRequest';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currencyFormat';
import { expenseTotalsByCurrency, expenseLinePayload, newExpenseLine } from '../../utils/expenseRequest.mjs';
import { emitWorkspaceDataChanged, subscribeWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const ENTRY_TITLES = { ko: '비용 신청 등록', en: 'New Payment Request', vi: 'Tạo đề nghị thanh toán' };
const EDIT_TITLES = { ko: '비용 신청 수정', en: 'Edit Payment Request', vi: 'Sửa đề nghị thanh toán' };
const LOCKED_TEXT = { ko: '최종 마감된 주문의 비용 신청은 수정할 수 없습니다.', en: 'This request is read-only because its order is finally locked.', vi: 'Không thể sửa đề nghị vì đơn hàng đã khóa quyết toán.' };
const CHANGED_TEXT = { ko: '다른 사용자가 신청서를 수정했습니다. 화면을 다시 열어 최신 내용을 확인한 뒤 저장해 주세요.', en: 'This request was changed by another user. Reopen it to review the latest version before saving.', vi: 'Đề nghị đã được người khác sửa. Vui lòng mở lại để kiểm tra phiên bản mới nhất trước khi lưu.' };

export const REQUEST_FORM_TEXT = EXPENSE_REQUEST_TEXT;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const newDocument = () => { const date = today(); return { remark: '', approverEmployeeIds: [], requestDate: date, partnerOrgId: '', clientKey: crypto.randomUUID(), items: [newExpenseLine()] }; };
const documentSnapshot = form => JSON.stringify({remark:form.remark,approverEmployeeIds:form.approverEmployeeIds,requestDate:form.requestDate,partnerOrgId:form.partnerOrgId,items:form.items.map(expenseLinePayload)});

export default function TransactionRequestEntry() {
  const { sourceKind, sourceId } = useParams();
  const { active: isTabActive } = useRequestScopeContext();
  const isTabActiveRef = useRef(isTabActive), mountedRef = useRef(true);
  isTabActiveRef.current = isTabActive;
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);
  const editing = Boolean(sourceKind && sourceId);
  const formPath = editing ? `/outsourcing-record/edit/${encodeURIComponent(sourceKind)}/${encodeURIComponent(sourceId)}` : '/outsourcing-record/new';
  const editorPath = editing ? `/expense-request-editor/${encodeURIComponent(sourceKind)}/${encodeURIComponent(sourceId)}` : '/expense-requests';
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const period = useManagementPeriod(), { navigateToPath, showNotification } = useAppActions();
  const labels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const header = EXPENSE_HEADER_TEXT[languageCode] || EXPENSE_HEADER_TEXT.en;
  const bankText = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const [payeeDialog, setPayeeDialog] = useState(false);
  const [payeeBanks, setPayeeBanks] = useState({ entityId: null, accounts: [], loaded: false });
  const [bankReload,setBankReload] = useState(0);
  useEffect(()=>subscribeWorkspaceDataChanged(detail=>{
    if(Number(detail?.orgId)===Number(activeOrgId) && detail?.topics?.includes('business-partners'))setBankReload(value=>value+1);
  }),[activeOrgId]);
  const lookup = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const organizationRef = useRef(activeOrgId);
  const tableContainerRef = useRef(null), dragColumnWidths = useRef([]);
  organizationRef.current = activeOrgId;
  const [form, setForm] = useState(newDocument), [data, setData] = useState({ partners: [], codes: [], orders: [], settings: { defaultVatRate: '10' } });
  useEffect(()=>{
    let alive=true;
    const unsubscribe=subscribeWorkspaceDataChanged(detail=>{
      if(Number(detail?.orgId)!==Number(activeOrgId)||!detail?.topics?.includes('expense-settings'))return;
      requestJSON(`/transaction-codes${buildQueryString({orgId:activeOrgId,forExpenseRequest:'1'})}`,{skipCache:true})
        .then(codes=>{if(alive)setData(previous=>({...previous,codes}));}).catch(()=>{});
    });
    return()=>{alive=false;unsubscribe();};
  },[activeOrgId]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [submission, setSubmission] = useState(null), [statuses, setStatuses] = useState({});
  const [initialSnapshot,setInitialSnapshot] = useState(()=>documentSnapshot(newDocument()));
  const dirty = documentSnapshot(form) !== initialSnapshot;
  useUnsavedChanges(dirty);
  useEffect(() => { const draft=newDocument();setForm(draft);setInitialSnapshot(documentSnapshot(draft));setStatuses({}); setSubmission(null); setError(''); setSaving(false); }, [activeOrgId,sourceKind,sourceId]);
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
        if (loaded) {const draft={...loaded,clientKey:crypto.randomUUID(),items:loaded.items.map(item=>({...newExpenseLine(),...item,key:crypto.randomUUID()}))};setForm(draft);setInitialSnapshot(documentSnapshot(draft));}
      } })
      .catch(() => { if (alive) setLoadError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrgId, reload,editing,editorPath]);
  const update = patch => setForm(current => ({ ...current, ...patch }));
  const changeLine = useCallback((key, patch) => setForm(current => ({ ...current,
    items: current.items.map(line => line.key === key ? { ...line, ...patch } : line) })), []);
  const lineStatus = useCallback((key, valid) => setStatuses(current => current[key] === valid ? current : { ...current, [key]: valid }), []);
  const reorderLines = ({ source, destination }) => {
    if (disabled || !destination || source.index === destination.index) return;
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
    setForm(current => current.items[0]?.key === key ? current : { ...current, items: current.items.filter(line => line.key !== key) });
  };
  const totals = useMemo(() => expenseTotalsByCurrency(form.items), [form.items]);
  const partner = data.partners.find(row => row.id === form.partnerOrgId);
  useEffect(()=>setPayeeDialog(false),[activeOrgId,partner?.id]);
  useEffect(() => {
    let alive = true;
    setPayeeBanks({entityId:partner?.id,accounts:[],loaded:false});
    if (partner?.id) requestJSON(`/entities/${partner.id}/bank-accounts${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
      .then(result=>{if(alive)setPayeeBanks({entityId:partner.id,accounts:result.accounts,loaded:true});})
      .catch(()=>{if(alive)setPayeeBanks({entityId:partner.id,accounts:[],loaded:false,error:true});});
    return ()=>{alive=false;};
  },[partner?.id,activeOrgId,bankReload]);
  const bankAccounts = payeeBanks.entityId === partner?.id ? payeeBanks.accounts.filter(row=>row.isActive) : [];
  const hasPayeeBank = bankAccounts.some(row=>row.bankName?.trim() && row.accountNumber?.trim() && row.accountHolder?.trim() && row.currencyId);
  const payeeInfo = [partner?.businessNumber,partner?.contactName,partner?.contactPhone,partner?.email,partner?.address,
    ...bankAccounts.filter(row=>row.isDefault).map(row=>[row.currency?.code,row.bankName,row.accountNumber,row.accountHolder].filter(Boolean).join(' · '))].filter(Boolean).join(' / ');
  const disabled = loading || loadError || saving || Boolean(submission) || Boolean(form.readOnly);
  const valid = hasPayeeBank && !period.loading && !period.error && (form.remark || '').length <= 500 && partner?.isActive &&
    form.requestDate && (!period.startDate || form.requestDate >= period.startDate) && form.items.every(line => statuses[line.key]);
  const money = (value, currency) => formatCurrency(value, { currencyCode: currency, languageCode });
  const close = () => navigateToPath('/outsourcing-record', { label: labels.document, closeTabId: formPath });
  const addProcess = sourceKey => {
    if(disabled || form.items.length>=50)return;
    setForm(current=>{
      const index=current.items.findIndex(line=>line.key===sourceKey),source=current.items[index];
      if(!source || data.codes.find(code=>code.id===source.transactionCodeId)?.base?.entryMode!=='PROCESS')return current;
      const next={...newExpenseLine(),transactionCodeId:source.transactionCodeId,description:source.description,currency:source.currency,vatRate:source.vatRate,
        workOrderId:data.orders.some(order=>order.dbId===source.workOrderId)?source.workOrderId:'',expandLinks:true};
      return {...current,items:[...current.items.slice(0,index+1),next,...current.items.slice(index+1)]};
    });
  };
  const save = async () => {
    if (disabled && !submission || saving || !submission && (!valid || editing && !dirty)) return;
    const body = submission || { remark: form.remark, approverEmployeeIds: form.approverEmployeeIds, requestDate: form.requestDate, partnerOrgId: form.partnerOrgId, clientKey: form.clientKey, ...(editing ? {revision:form.revision,version:form.version} : {}), items: form.items.map(expenseLinePayload) };
    setSubmission(body); setSaving(true); setError('');
    try {
      await requestJSON(`${editorPath}${buildQueryString({ orgId: activeOrgId })}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      emitWorkspaceDataChanged({ orgId: activeOrgId, topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD], source: 'transaction-request' });
      if (organizationRef.current !== activeOrgId || !mountedRef.current) return;
      setInitialSnapshot(documentSnapshot(form)); showNotification(labels.saved, 'success');
      if (isTabActiveRef.current) navigateToPath('/outsourcing-record', {label:labels.document,closeTabId:formPath,skipUnsavedChangesCheck:true});
    } catch (failure) {
      if (organizationRef.current !== activeOrgId || !mountedRef.current) return;
      if ([400,403,404,409,422].includes(failure.status)) {
        setSubmission(null);
        const code=failure.details?.error || failure.message, line=String(code).match(/^EXPENSE_LINE:(\d+):(.+)$/);
        const field=line&&({REQUIRED_REQUEST_ORDER:'order',REQUIRED_REQUEST_STYLE:'style',REQUIRED_REQUEST_PROCESS:'process',SELECT_ASSIGNMENT_PLAN:'assignment',ELIGIBLE_ASSIGNMENT_REQUIRED:'assignment'})[line[2]];
        const approvalText=approvalSettingsText[languageCode]||approvalSettingsText.en;
        setError(code==='APPROVAL_CURRENCY_LIMIT_REQUIRED' ? approvalText.limitMissing : code==='EXPENSE_SELF_APPROVAL' ? approvalText.selfError : code==='EXPENSE_APPROVER_REQUIRED' ? approvalText.missing : code==='INVALID_EXPENSE_APPROVERS' ? approvalText.error : code==='PAYEE_BANK_ACCOUNT_REQUIRED' ? bankText.required : code==='EXPENSE_REQUEST_CHANGED' ? CHANGED_TEXT[languageCode] || CHANGED_TEXT.en : line ? `${labels.row} ${line[1]} · ${labels.invalid}${field?` (${labels[field]})`:''}` : labels.invalid);
      }
      else setError(labels.saveError);
    } finally { if (organizationRef.current === activeOrgId && mountedRef.current) setSaving(false); }
  };
  return <AppPageContainer
    title={(editing ? EDIT_TITLES : ENTRY_TITLES)[languageCode] || ENTRY_TITLES.en}
    titleActions={<Stack direction="row" spacing={1}>
      <Button disabled={saving} onClick={close}>{labels.cancel}</Button>
      <SaveButton loading={saving} disabled={loading || loadError || form.readOnly || !submission && (!valid || editing && !dirty)} onClick={save}>
        {submission ? labels.retry : getUiMessage('common.save', 'Save', languageCode)}
      </SaveButton>
    </Stack>}
  >
    <PageContentStack>
      {loadError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {period.error && <Alert severity="error">{labels.loadError}</Alert>}
      {form.readOnly && <Alert severity="info">{form.bankReconciled?(ledgerEvidenceErrors[languageCode]||ledgerEvidenceErrors.en).EXPENSE_ALREADY_RECONCILED:LOCKED_TEXT[languageCode] || LOCKED_TEXT.en}</Alert>}
      {partner && !loading && !form.readOnly && !hasPayeeBank && (payeeBanks.loaded || payeeBanks.error) && <Alert severity={payeeBanks.error?'error':'warning'} action={<Button disabled={disabled} onClick={()=>setPayeeDialog(true)}>{header.editPayee}</Button>}>{payeeBanks.error?bankText.error:bankText.required}</Alert>}
      {partner && <BusinessPartnerDialog key={`${activeOrgId}:${partner.id}`} open={payeeDialog} onClose={()=>setPayeeDialog(false)}
        partner={partner} activeOrgId={activeOrgId} languageCode={languageCode} lockType title={header.editPayee}
        onSaved={saved=>{if(organizationRef.current===activeOrgId && mountedRef.current)setData(current=>({...current,partners:current.partners.map(row=>row.id===saved.id?saved:row)}));}}
        onAccountsChange={accounts=>{if(organizationRef.current===activeOrgId && mountedRef.current)setPayeeBanks({entityId:partner.id,accounts,loaded:true});}} />}
      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2.5 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{p:2}}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
            <CustomDatePicker label={labels.date} value={form.requestDate} minDate={period.startDate} adapterLocale={languageCode} disabled={disabled} onChange={(date, context) => { if (date?.isValid() && !context?.validationError) update({ requestDate: date.format('YYYY-MM-DD') }); }} />
            <ExpenseLookupField key={activeOrgId} label={labels.payee} options={data.partners.filter(row => row.isActive)} value={partner || null} onChange={value => update({partnerOrgId:value?.id || ''})} columns={[{key:'role',label:(EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en).partnerType,value:row=>getBusinessPartnerTypeLabel(row.type,languageCode)},{key:'name',label:labels.payee,value:row=>row.name},{key:'industry',label:(EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en).industry,value:row=>(row.serviceTypes||[]).map(service=>serviceName(service,languageCode)).filter(Boolean).join(' / ')}]} languageCode={languageCode} disabled={disabled || form.items.some(line=>line.productionLocked)} required />
            <TextField label={header.payeeInfo} value={partner ? payeeInfo || header.noPayeeInfo : ''} placeholder={header.selectPayee} InputLabelProps={{shrink:true}}
              InputProps={{readOnly:true,endAdornment:<InputAdornment position="end"><Tooltip title={header.editPayee}><span><IconButton size="small" aria-label={header.editPayee} disabled={!partner || disabled} onClick={()=>setPayeeDialog(true)}><EditOutlined fontSize="small"/></IconButton></span></Tooltip></InputAdornment>}}
              inputProps={{title:payeeInfo}} sx={{'& .MuiInputBase-root':{bgcolor:'action.hover'},'& input':{textOverflow:'ellipsis'}}} />
          </Box>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(280px, .8fr) minmax(0, 1.6fr)'},gap:2,mt:2}}>
            <ExpenseApprovalActions requestId={form.canonicalSource?.kind==='request'?form.canonicalSource.id:null} version={form.version} orgId={activeOrgId} languageCode={languageCode} disabled={disabled||documentSnapshot(form)!==initialSnapshot}/>
            <ExpenseApprovalSettings orgId={activeOrgId} languageCode={languageCode} steps={form.approvalSteps} drafter={form.createdByEmployee} editing={editing} items={form.items.map(expenseLinePayload)} sourceKind={sourceKind} sourceId={sourceId} />
            <TextField label={header.remark} value={form.remark || ''} disabled={disabled} inputProps={{maxLength:500}} onChange={event=>update({remark:event.target.value})} />
          </Box>
          </Box>
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
                  <ExpenseRequestLine line={line} index={index} {...data} dragHandleProps={drag.dragHandleProps} partner={partner} orgId={activeOrgId} labels={labels} languageCode={languageCode} disabled={disabled} onChange={changeLine} onRemove={removeLine} onStatus={lineStatus} onAddProcess={addProcess} canAddProcess={form.items.length<50} />
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
    </PageContentStack>
  </AppPageContainer>;
}
