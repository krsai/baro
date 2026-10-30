import {ledgerEvidenceErrors} from '../../constants/ledgerEvidence';
import ExpenseApprovalActions from '../../components/ExpenseApprovalActions';
import { useRequestScopeContext } from '../../context/RequestScopeContext';
import ExpenseApprovalSettings from '../../components/ExpenseApprovalSettings';
import {approvalSettingsText} from '../../constants/approvalSettings';
import {documentNumberText,documentNumberError} from '../../constants/documentNumber';
import { ENTITY_TEXT } from '../../constants/entityProfile';
import PageContentStack from '../../components/PageContentStack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Add } from '@mui/icons-material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { getUiMessage } from '../../constants/uiMessages';
import ExpensePayeePicker from '../../components/ExpensePayeePicker';
import { EXPENSE_LOOKUP_TEXT } from '../../constants/expenseLookup';
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
import { expenseTotalsByCurrency, expenseLinePayload, newExpenseLine, expenseCodeForLine, inputMode } from '../../utils/expenseRequest.mjs';
import {TRANSACTION_TEXT} from '../../components/OutsourcingServiceDialog';
import { emitWorkspaceDataChanged, subscribeWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const ENTRY_TITLES = { ko: '비용 신청 등록', en: 'New Payment Request', vi: 'Tạo đề nghị thanh toán' };
const EDIT_TITLES = { ko: '비용 신청 수정', en: 'Edit Payment Request', vi: 'Sửa đề nghị thanh toán' };
const LOCKED_TEXT = { ko: '최종 마감된 주문의 비용 신청은 수정할 수 없습니다.', en: 'This request is read-only because its order is finally locked.', vi: 'Không thể sửa đề nghị vì đơn hàng đã khóa quyết toán.' };
const CHANGED_TEXT = { ko: '다른 사용자가 신청서를 수정했습니다. 화면을 다시 열어 최신 내용을 확인한 뒤 저장해 주세요.', en: 'This request was changed by another user. Reopen it to review the latest version before saving.', vi: 'Đề nghị đã được người khác sửa. Vui lòng mở lại để kiểm tra phiên bản mới nhất trước khi lưu.' };
const FORM_TEXT={ko:{auto:'등록 시 자동 부여',required:'필수 입력 항목을 확인해 주세요',number:'관리번호는 자동으로 부여됩니다.'},en:{auto:'Assigned automatically on registration',required:'Please complete the required fields',number:'Management numbers are assigned automatically.'},vi:{auto:'Tự động cấp khi đăng ký',required:'Vui lòng điền các trường bắt buộc',number:'Mã quản lý được cấp tự động.'}};

export const REQUEST_FORM_TEXT = EXPENSE_REQUEST_TEXT;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const newDocument = () => { const date = today(); return { managementNumber:'', remark: '', approverEmployeeIds: [], approvalSelection:null, requestDate: date, partnerOrgId: '', clientKey: crypto.randomUUID(), items: [newExpenseLine()] }; };
const documentSnapshot = form => JSON.stringify({managementNumber:form.managementNumber,remark:form.remark,approverEmployeeIds:form.approverEmployeeIds,approvalSelection:form.approvalSelection,requestDate:form.requestDate,partnerOrgId:form.partnerOrgId,items:form.items.map(expenseLinePayload)});

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
  const numbering=documentNumberText[languageCode]||documentNumberText.en;
  const formText=FORM_TEXT[languageCode]||FORM_TEXT.en;
  const bankText = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const approvalRef=useRef(null),saveLock=useRef(false);
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
  const [validationAttempt,setValidationAttempt]=useState(0),[validation,setValidation]=useState(''),[approvalStatus,setApprovalStatus]=useState(null);
  const [initialSnapshot,setInitialSnapshot] = useState(()=>documentSnapshot(newDocument()));
  const dirty = documentSnapshot(form) !== initialSnapshot;
  useUnsavedChanges(dirty);
  useEffect(() => { const draft=newDocument();setForm(draft);setInitialSnapshot(documentSnapshot(draft));setStatuses({}); setSubmission(null); setError(''); setSaving(false); }, [activeOrgId,sourceKind,sourceId]);
  useEffect(() => {
    let alive = true; setLoading(true); setLoadError(false);
    const query = buildQueryString({ orgId: activeOrgId });
    Promise.all([
      ...['business-partners','transaction-codes','app-settings','orders','expense-units'].map(path => requestJSON(`/${path}${path === 'transaction-codes' ? buildQueryString({orgId:activeOrgId,forExpenseRequest:'1'}) : query}`, { skipCache: true })),
      editing ? requestJSON(`${editorPath}${query}`,{skipCache:true}) : Promise.resolve(null),
    ])
      .then(([partners,codes,settings,orders,units,loaded]) => { if (alive) {
        if (loaded?.partner && !partners.some(row=>row.id===loaded.partner.id)) partners=[...partners,{...loaded.partner,isActive:false}];
        setData({ partners, codes, settings, units, orders: orders.filter(row => row.ownerOrgId === Number(activeOrgId)) });
        if (loaded) {const draft={...loaded,approvalSelection:loaded.approvalSelection||null,clientKey:crypto.randomUUID(),items:loaded.items.map(item=>({...newExpenseLine(),...item,key:crypto.randomUUID()}))};setForm(draft);setInitialSnapshot(documentSnapshot(draft));}
      } })
      .catch(() => { if (alive) setLoadError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrgId, reload,editing,editorPath]);
  const update = patch => {setValidation('');setForm(current => ({ ...current, ...patch }));};
  const changeLine = useCallback((key, patch) => {setValidation('');setForm(current => ({ ...current,
    items: current.items.map(line => line.key === key ? { ...line, ...patch } : line) }));}, []);
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
  useEffect(() => {
    let alive = true;
    setPayeeBanks({entityId:partner?.id,accounts:[],loaded:false});
    if (partner?.id) requestJSON(`/entities/${partner.id}/bank-accounts${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
      .then(result=>{if(alive)setPayeeBanks({entityId:partner.id,accounts:result.accounts,loaded:true});})
      .catch(()=>{if(alive)setPayeeBanks({entityId:partner.id,accounts:[],loaded:false,error:true});});
    return ()=>{alive=false;};
  },[partner?.id,activeOrgId,bankReload]);
  const bankAccounts = payeeBanks.entityId === partner?.id ? payeeBanks.accounts : [];
  const hasPayeeBank = bankAccounts.length>0;
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
    if (saveLock.current || disabled && !submission || saving || !submission && valid && editing && !dirty) return;
    if(!submission&&!valid){
      setValidationAttempt(value=>value+1);
      const missing=[];
      if(!form.requestDate||period.startDate&&form.requestDate<period.startDate)missing.push(labels.date);
      if(!partner?.isActive)missing.push(labels.payee);
      if(!hasPayeeBank)missing.push(bankText.required);
      const detailLabels=TRANSACTION_TEXT[languageCode]||TRANSACTION_TEXT.en;
      form.items.forEach((line,index)=>{
        if(statuses[line.key])return;
        const code=expenseCodeForLine(line,data.codes.find(code=>code.id===line.transactionCodeId)),fields=[];
        if(!code)fields.push(labels.code);
        if(!Number(line.quantity)||Number(line.quantity)<0)fields.push(labels.quantity);
        if(!Number(line.unitPrice)||Number(line.unitPrice)<0)fields.push(labels.price);
        for(const key of ['order','style','process'])if(inputMode(code,key)==='REQUIRED'&&!line[{order:'workOrderId',style:'styleId',process:'styleProcessId'}[key]]&&!(key==='process'&&line.styleProcessIds?.length))fields.push(labels[key]);
        for(const key of code?.base?.requiredFields||[])if(!line.details?.[key]?.trim())fields.push(detailLabels[key]||key);
        if(code?.base?.entryMode==='PROCESS'&&!line.assignmentPlanId)fields.push(labels.assignment);
        missing.push(`${labels.row} ${index+1}: ${fields.join(', ')||labels.invalid}`);
      });
      setValidation(`${formText.required}: ${missing.join(' / ')}`);
      setTimeout(()=>tableContainerRef.current?.querySelector('input[required]:invalid')?.focus(),0);
      return;
    }
    setValidation('');
    saveLock.current=true;
    try {
    const selection=submission?submission.approvalSelection:await approvalRef.current?.prepare();
    if(selection==null||organizationRef.current!==activeOrgId||!mountedRef.current)return;
    const body = submission || { remark: form.remark, approverEmployeeIds: form.approverEmployeeIds, approvalSelection:selection, requestDate: form.requestDate, partnerOrgId: form.partnerOrgId, clientKey: form.clientKey, ...(editing ? {revision:form.revision,version:form.version} : {}), items: form.items.map(expenseLinePayload) };
    setSubmission(body); setSaving(true); setError('');
    try {
      await requestJSON(`${editorPath}${buildQueryString({ orgId: activeOrgId })}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      emitWorkspaceDataChanged({ orgId: activeOrgId, topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD], source: 'transaction-request' });
      if (organizationRef.current !== activeOrgId || !mountedRef.current) return;
      setInitialSnapshot(documentSnapshot({...form,approvalSelection:selection})); showNotification(labels.saved, 'success');
      if (isTabActiveRef.current) navigateToPath('/outsourcing-record', {label:labels.document,closeTabId:formPath,skipUnsavedChangesCheck:true});
    } catch (failure) {
      if (organizationRef.current !== activeOrgId || !mountedRef.current) return;
      if ([400,403,404,409,422].includes(failure.status)) {
        setSubmission(null);
        const code=failure.details?.error || failure.message, line=String(code).match(/^EXPENSE_LINE:(\d+):(.+)$/);
        const field=line&&({REQUIRED_REQUEST_ORDER:'order',REQUIRED_REQUEST_STYLE:'style',REQUIRED_REQUEST_PROCESS:'process',SELECT_ASSIGNMENT_PLAN:'assignment',ELIGIBLE_ASSIGNMENT_REQUIRED:'assignment'})[line[2]];
        const requiredDetail=line?.[2]?.match(/^REQUIRED_TRANSACTION_FIELD:(.+)$/);
        if(field||requiredDetail){
          const detailLabels=TRANSACTION_TEXT[languageCode]||TRANSACTION_TEXT.en;
          setValidationAttempt(value=>value+1);setError('');
          setValidation(`${formText.required}: ${labels.row} ${line[1]} · ${field?labels[field]:detailLabels[requiredDetail[1]]||requiredDetail[1]}`);
          return;
        }
        const approvalText=approvalSettingsText[languageCode]||approvalSettingsText.en;
        setError((code==='DOCUMENT_NUMBER_AUTOMATIC'?formText.number:documentNumberError(code,languageCode)) || (code==='APPROVAL_CURRENCY_LIMIT_REQUIRED' ? approvalText.limitMissing : code==='EXPENSE_SELF_APPROVAL' ? approvalText.selfError : code==='EXPENSE_APPROVER_REQUIRED' ? approvalText.missing : code==='INVALID_EXPENSE_APPROVERS' ? approvalText.error : code==='PAYEE_BANK_ACCOUNT_REQUIRED' ? bankText.required : code==='EXPENSE_REQUEST_CHANGED' ? CHANGED_TEXT[languageCode] || CHANGED_TEXT.en : line ? `${labels.row} ${line[1]} · ${labels.invalid}${field?` (${labels[field]})`:''}` : labels.invalid));
      }
      else setError(labels.saveError);
    } finally { if (organizationRef.current === activeOrgId && mountedRef.current) setSaving(false); }
    } finally {saveLock.current=false;}
  };
  return <AppPageContainer
    title={(editing ? EDIT_TITLES : ENTRY_TITLES)[languageCode] || ENTRY_TITLES.en}
    titleActions={<Stack direction="row" spacing={1}>
      <Button disabled={saving} onClick={close}>{labels.cancel}</Button>
      <SaveButton loading={saving} disabled={loading || loadError || form.readOnly || !submission && valid && editing && !dirty} onClick={save}>
        {submission ? labels.retry : getUiMessage('common.save', 'Save', languageCode)}
      </SaveButton>
    </Stack>}
  >
    <PageContentStack>
      {loadError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {validation && <Alert severity="warning" data-testid="expense-validation">{validation}</Alert>}
      {period.error && <Alert severity="error">{labels.loadError}</Alert>}
      {form.readOnly && <Alert severity="info">{form.bankReconciled?(ledgerEvidenceErrors[languageCode]||ledgerEvidenceErrors.en).EXPENSE_ALREADY_RECONCILED:LOCKED_TEXT[languageCode] || LOCKED_TEXT.en}</Alert>}
      <ExpenseApprovalActions requestId={form.canonicalSource?.kind==='request'?form.canonicalSource.id:null} version={form.version} orgId={activeOrgId} languageCode={languageCode} drafter={form.createdByEmployee} onState={setApprovalStatus} disabled={loading||loadError||saving||Boolean(submission)||dirty} dirty={dirty} onRefresh={()=>setReload(value=>value+1)}/>
      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2.5 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{p:2}}>
          <Box data-testid="expense-header" sx={{display:'flex',flexWrap:'wrap',gap:1.5,alignItems:'flex-start','& > *':{width:{xs:'100%',sm:170},minWidth:0},'& > :nth-child(2)':{width:{xs:'100%',sm:220}},'& > :nth-child(4)':{width:{xs:'100%',sm:320}}}}>
            <CustomDatePicker label={labels.date} value={form.requestDate} minDate={period.startDate} adapterLocale={languageCode} disabled={disabled} onChange={(date, context) => { if (date?.isValid() && !context?.validationError) update({ requestDate: date.format('YYYY-MM-DD') }); }} />
            <TextField label={numbering.expense} value={form.managementNumber||''} placeholder={formText.auto} slotProps={{input:{readOnly:true},inputLabel:{shrink:true}}}/>
            <ExpensePayeePicker orgId={activeOrgId} languageCode={languageCode} options={data.partners} value={partner} disabled={disabled} lockSelection={form.items.some(line=>line.productionLocked)}
              onChange={(selected,accounts)=>{update({partnerOrgId:selected.id});setPayeeBanks({entityId:selected.id,accounts,loaded:true});}}
              onSaved={saved=>{if(organizationRef.current===activeOrgId && mountedRef.current)setData(current=>({...current,partners:current.partners.map(row=>row.id===saved.id?saved:row)}));}}/>
            <ExpenseApprovalSettings ref={approvalRef} orgId={activeOrgId} languageCode={languageCode} steps={form.approvalSteps} approvalStatus={approvalStatus} drafter={form.version?form.createdByEmployee:null} items={form.items.map(expenseLinePayload)} sourceKind={sourceKind} sourceId={sourceId} value={form.approvalSelection} onChange={approvalSelection=>update({approvalSelection})} disabled={loading||loadError||saving||Boolean(submission)}
              />
          </Box>
          </Box>
        </Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}><Typography variant="subtitle2">{lookup.details} · {form.items.length} {labels.count}</Typography>{loading && <CircularProgress size={20} />}</Stack>
        <DragDropContext onBeforeCapture={() => {
          dragColumnWidths.current = Array.from(tableContainerRef.current?.querySelector('[data-testid="expense-line"]')?.cells || []).map(cell => cell.getBoundingClientRect().width);
        }} onDragEnd={reorderLines}>
          <Droppable droppableId="expense-items" isDropDisabled={disabled}>{provided => (
            <TableContainer ref={tableContainerRef}><Table ref={provided.innerRef} {...provided.droppableProps} size="small" sx={{ minWidth: 1280, tableLayout: 'fixed' }}>
              <colgroup>{[64,128,null,88,96,100,112,96,112,112,128,88].map((width,index)=><col key={index} style={width ? {width} : undefined} />)}</colgroup>
              <TableHead><TableRow>{['#',labels.code,labels.description,labels.currency,labels.quantity,labels.unit,labels.price,labels.vat,labels.subtotal,labels.tax,labels.total,''].map((label,index) => <TableCell key={index} align={index >= 8 && index <= 10 ? 'right' : 'left'}>{label}</TableCell>)}</TableRow></TableHead>
              {form.items.map((line,index) => <Draggable key={line.key} draggableId={line.key} index={index} disableInteractiveElementBlocking isDragDisabled={disabled}>{(drag,state) => (
                <TableBody ref={drag.innerRef} {...drag.draggableProps} style={{...drag.draggableProps.style,...(state.isDragging ? {display:'table',tableLayout:'fixed'} : {})}} sx={{ bgcolor:'background.paper', boxShadow:state.isDragging ? 3 : 'none', ...(state.isDragging ? Object.fromEntries(dragColumnWidths.current.map((width,column)=>['& tr:first-of-type > td:nth-of-type('+(column+1)+')',{width}])) : {}) }}>
                  <ExpenseRequestLine line={line} index={index} {...data} validationAttempt={validationAttempt} dragHandleProps={drag.dragHandleProps} partner={partner} orgId={activeOrgId} labels={labels} languageCode={languageCode} disabled={disabled} onChange={changeLine} onRemove={removeLine} onStatus={lineStatus} onAddProcess={addProcess} canAddProcess={form.items.length<50} />
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
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'minmax(0,1fr) 360px'},gap:3,p:3,bgcolor:'grey.50'}} data-testid="expense-summary">
          <TextField fullWidth multiline minRows={4} label={header.remark} value={form.remark || ''} disabled={disabled} inputProps={{maxLength:500}} onChange={event=>update({remark:event.target.value})} sx={{height:'100%','& .MuiInputBase-root':{height:'100%',alignItems:'flex-start'},'& textarea':{height:'100% !important',overflow:'auto !important'}}}/>
        <Stack alignItems="flex-end" spacing={1} data-testid="expense-totals" sx={{minWidth:0}}>
          {totals.map(total => <Stack key={total.currency} spacing={1} sx={{ width: '100%' }}>
            <Typography variant="subtitle2">{total.currency}</Typography>
            <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{labels.subtotal}</Typography><Typography>{money(total.subtotal,total.currency)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{labels.tax}</Typography><Typography>{money(total.vatAmount,total.currency)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between" sx={{pt:1,borderTop:1,borderColor:'divider'}}><Typography fontWeight={700}>{labels.total}</Typography><Typography fontWeight={700} color="primary">{money(total.amount,total.currency)}</Typography></Stack>
          </Stack>)}

        </Stack>
        </Box>
      {form.items.some(line => data.codes.find(code => code.id === line.transactionCodeId)?.base?.entryMode === 'PROCESS') && <Alert severity="info">{labels.processInfo}</Alert>}
      </Paper>
    </PageContentStack>
  </AppPageContainer>;
}
