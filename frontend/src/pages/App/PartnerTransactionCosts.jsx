import {ACCOUNTING_CODE_TEXT} from '../../constants/accountingCode';
import {expenseDeletionText} from '../../constants/expenseDeletion';
import {ExpenseDeletionButton} from '../../components/ExpenseDeletion';
import ApprovalStatusLabel from '../../components/ApprovalStatusLabel';
import {approvalWorkflowText} from '../../constants/approvalWorkflow';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import { expenseLineDescription, expenseRequestSummary } from '../../utils/expenseCodePresentation.mjs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress,MenuItem,TextField } from '@mui/material';
import dayjs from 'dayjs';
import { expenseRequestNumber } from '../../components/ExpenseRequestView';
import AppPageContainer from '../../components/AppPageContainer';
import DateRangeSelector from '../../components/DateRangeSelector';
import { TRANSACTION_TEXT, OUTSOURCING_REQUEST_TEXT, serviceName } from '../../components/OutsourcingServiceDialog';
import { EXPENSE_REQUEST_TEXT } from '../../constants/expenseRequest';
import { EXPENSE_LIST_TEXT } from '../../constants/expenseList';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useManagementPeriod } from '../../context/ManagementPeriodContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currencyFormat';
import { expenseCurrencyTotals, expenseIndustryKey, groupExpenseRequests, groupExpenseRows, summarizeExpenseDimensions } from '../../utils/expenseList.mjs';
import { subscribeWorkspaceDataChanged } from '../../utils/workspaceDataEvents';
import './expenseRequests.css';

const currentMonthRange = managementStart => {
  const month = dayjs().startOf('month');
  const start = managementStart && dayjs(managementStart).isAfter(month, 'day') ? dayjs(managementStart).startOf('day') : month;
  return [start, start.endOf('month').startOf('day')];
};

export default function PartnerTransactionCosts({ onNewRequest, onOpenRequest }) {
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const period = useManagementPeriod();
  const labels = { ...(TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko), ...(OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko) };
  const docText = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const workflow=approvalWorkflowText[languageCode]||approvalWorkflowText.en;
  const text = EXPENSE_LIST_TEXT[languageCode] || EXPENSE_LIST_TEXT.ko;
  const [canDraft,setCanDraft]=useState(null);
  useEffect(()=>{let live=true;setCanDraft(null);requestJSON('/expense-approval-settings'+buildQueryString({orgId:activeOrgId}),{skipCache:true,skipGlobalLoading:true}).then(data=>{if(live)setCanDraft(data.canDraft!==false);}).catch(()=>{});return()=>{live=false;};},[activeOrgId]);
  const [rows,setRows] = useState([]), [documents,setDocuments] = useState([]), [view,setView] = useState('items');
  const [loading,setLoading] = useState(true), [errors,setErrors] = useState({ items:'',documents:'' });
  const [search,setSearch] = useState(''), [partner,setPartner] = useState(''), [industry,setIndustry] = useState(''), [currency,setCurrency] = useState('');
  const [checked,setChecked] = useState([]), [ascending,setAscending] = useState(false);
  const [dateFrom,setDateFrom] = useState(() => dayjs().startOf('month')), [dateTo,setDateTo] = useState(() => dayjs().endOf('month').startOf('day'));
  const loadSequence = useRef(0), rangeOrganization = useRef(null);
  const error = errors[view === 'documents' ? 'documents' : 'items'];
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setRows([]); setDocuments([]); setLoading(true); setErrors({items:'',documents:''});
    try {
      const query = buildQueryString({orgId:activeOrgId});
      const [items,requests] = await Promise.allSettled([
        requestJSON(`/outsourcing-requests${query}`,{skipGlobalLoading:true,skipCache:true}),
        requestJSON(`/expense-requests${query}`,{skipGlobalLoading:true,skipCache:true}),
      ]);
      if (sequence === loadSequence.current) {
        setRows(items.status === 'fulfilled' ? items.value : []); setDocuments(requests.status === 'fulfilled' ? requests.value : []);
        setErrors({items:items.status === 'rejected' ? labels.loadError : '',documents:requests.status === 'rejected' ? labels.loadError : ''});
      }
    } catch { if (sequence === loadSequence.current) setErrors({items:labels.loadError,documents:labels.loadError}); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  },[activeOrgId,labels.loadError]);
  useEffect(() => { load(); return () => {loadSequence.current++;}; },[load]);
  useEffect(() => subscribeWorkspaceDataChanged(detail => {
    if (Number(detail.orgId)===Number(activeOrgId)&&(['transaction-request','business-partner','expense-approval'].includes(detail?.source)||detail.topics?.some(topic=>['bank-ledger','ledger-entries','expense-approvals'].includes(topic)))) load();
  }),[activeOrgId,load]);
  useEffect(() => {setPartner('');setIndustry('');setCurrency('');setChecked([]);},[activeOrgId]);
  useEffect(() => {
    if (loading || period.loading || period.error || rangeOrganization.current === activeOrgId) return;
    const [start,end] = currentMonthRange(period.startDate);
    setDateFrom(start); setDateTo(end);
    rangeOrganization.current = activeOrgId;
  },[activeOrgId,loading,period.loading,period.error,period.startDate]);
  const documentsById = useMemo(()=>new Map(documents.map(row=>[row.id,row])),[documents]);
  const numberFor = row => {const document=documentsById.get(row.expenseRequestId)||row.expenseRequest;return document?expenseRequestNumber(document):'—';};
  const remarkFor = row => row.expenseRequest?.remark ?? documentsById.get(row.expenseRequestId)?.remark ?? '';
  const industryLabel = row => serviceName(row.serviceType?.systemDefault||row.serviceType,languageCode) || text.unclassified;
  const dimensionCell = (document,dimension) => {
    const summary = summarizeExpenseDimensions(document.items,industryLabel,languageCode);
    return <span title={summary.title}>{summary.text}</span>;
  };
  const searchValues = row => [numberFor(row),row.partner?.name,industryLabel(row),remarkFor(row),row.transactionCode?.code,expenseLineDescription(row,languageCode),row.workOrder?.orderNumber,row.style?.name,row.style?.code,row.styleProcess?.processName,row.styleProcess?.processCode,row.createdByEmployee?.name,serviceName(row.unit,languageCode),...(row.referenceLinks||[]).flatMap(link=>[link.workOrder?.orderNumber,link.style?.name,link.style?.code]),...Object.values(row.details||{})];
  const matches = values => values.filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const withinDates = date => date >= dateFrom.format('YYYY-MM-DD') && date <= dateTo.format('YYYY-MM-DD');
  const matchesPartner = row => !partner || String(row.partnerOrgId ?? row.partner?.id) === partner;
  const matchesIndustry = row => !industry || expenseIndustryKey(row) === industry;
  const matchesCurrency = row => !currency || row.currency === currency;
  const filtered = rows.filter(row => {
    const document = documentsById.get(row.expenseRequestId);
    return withinDates(row.transactionDate) && matchesPartner(row) && matchesIndustry(row) && matchesCurrency(row) &&
      matches([...searchValues(row),expenseRequestSummary(document,languageCode),document?.remark,document && expenseRequestNumber(document)]);
  }).sort((a,b)=>ascending ? a.transactionDate.localeCompare(b.transactionDate) : b.transactionDate.localeCompare(a.transactionDate));
  const filteredDocuments = documents.filter(row => withinDates(row.requestDate) && matchesPartner(row) && (!currency || (row.currencyTotals || row.items.map(item=>({...item,currency:item.currency || row.currency}))).some(matchesCurrency)) &&
    (!industry || row.items.some(matchesIndustry)) && matches([expenseRequestNumber(row),expenseRequestSummary(row,languageCode),row.remark,row.partner?.name,row.createdByEmployee?.name,...row.items.flatMap(searchValues)]))
    .sort((a,b)=>ascending ? a.requestDate.localeCompare(b.requestDate) : b.requestDate.localeCompare(a.requestDate));
  const partnerOptions = [...new Map([...rows,...documents].filter(row=>row.partnerOrgId != null || row.partner?.id != null).map(row=>[String(row.partnerOrgId ?? row.partner.id),row.partner?.name || '—'])).entries()];
  const industryOptions = [...new Map(rows.map(row=>[expenseIndustryKey(row),industryLabel(row)])).entries()];
  const currencies = [...new Set([...rows,...documents.flatMap(document=>document.currencyTotals || document.items.map(item=>({...item,currency:item.currency || document.currency})))].map(row=>row.currency).filter(Boolean))].sort();
  const matchedRows = new Set(filtered);
  const requests = groupExpenseRequests(rows).filter(group=>group.items.some(row=>matchedRows.has(row)))
    .sort((a,b)=>ascending ? a.row.transactionDate.localeCompare(b.row.transactionDate) : b.row.transactionDate.localeCompare(a.row.transactionDate));
  const totals = expenseCurrencyTotals(view === 'documents' ? filteredDocuments.flatMap(document=>document.currencyTotals || [document]).filter(matchesCurrency) : view === 'items' ? requests.flatMap(group=>group.items).filter(matchesCurrency) : filtered);
  const groups = groupExpenseRows(filtered,view, row=>view === 'partner' ? row.partner?.name || '—' : industryLabel(row));
  const visibleRows = view === 'documents' ? filteredDocuments : view === 'items' ? requests.map(group=>group.row) : filtered;
  const partnerCount = new Set(visibleRows.map(row=>row.partnerOrgId ?? row.partner?.id).filter(id=>id!=null)).size;
  const selectedCount = requests.filter(group=>checked.includes(group.key)).length;
  const allChecked = requests.length > 0 && selectedCount === requests.length;
  const money = (value,code) => formatCurrency(value,{currencyCode:code,languageCode});
  const toggle = id => setChecked(current=>current.includes(id) ? current.filter(key=>key!==id) : [...current,id]);
  const reset = () => {
    setSearch('');setPartner('');setIndustry('');setCurrency('');setChecked([]);setAscending(false);
    const [start,end] = currentMonthRange(period.startDate);
    setDateFrom(start);setDateTo(end);
  };
  const changeDate = setter => (value,context) => {
    if (!value?.isValid?.() || context?.validationError || setter === setDateFrom && value.isAfter(dateTo,'day') || setter === setDateTo && value.isBefore(dateFrom,'day')) return;
    setter(value.startOf('day'));
  };
  const shiftRange = (_amount,range) => {
    setDateFrom(range.startValue);
    setDateTo(range.endValue);
  };
  const editRow = row => {
    if (row.expenseRequestId) return onOpenRequest?.('request',String(row.expenseRequestId));
    if (row.sourceKind === 'HISTORICAL_WORK_RECORD') return onOpenRequest?.('legacy',String(row.outsourcedWorkRecordId));
    return onOpenRequest?.('cost',String(row.id));
  };
  const uniqueText=values=>[...new Set(values.filter(Boolean))].join(', ')||'\u2014';
  const codeSummary=items=>uniqueText(items.map(item=>item.transactionCode?.code));
  const descriptionSummary=items=>uniqueText(items.map(item=>expenseLineDescription(item,languageCode)));
  const openRowOnClick = (event,row) => {event.stopPropagation();editRow(row);};
  return <AppPageContainer title={labels.costs} titleActions={<div className="cc-actions">
      <Button variant="contained" disableElevation className="cc-primary" disabled={canDraft===false || loading || Boolean(errors.items) || !onNewRequest} onClick={onNewRequest}>{labels.addCost}</Button>
    </div>}><div className="compact-costs cc-live">
    {canDraft===false&&<Alert severity="info">{(expenseDeletionText[languageCode]||expenseDeletionText.en).notAllowed}</Alert>}
    <SearchPanel compact title={text.query} searchWidth={260} disabled={loading} onReset={reset}
      search={<SearchInput value={search} onChange={event=>setSearch(event.target.value)} placeholder={text.search} inputProps={{'aria-label':text.search}} />}
      controls={<DateRangeSelector disabled={loading} monthOnly={false} languageCode={languageCode} startValue={dateFrom} endValue={dateTo} onStartChange={changeDate(setDateFrom)} onEndChange={changeDate(setDateTo)} onShift={shiftRange} slotProps={{textField:{sx:{width:140,minWidth:140}}}} />}

    />
    <section className="cc-panel cc-results">
      <div className="cc-tabs" role="tablist">{[['items',text.detail],['partner',text.partnerSummary],['industry',text.industrySummary],['documents',text.documents]].map(([key,label])=><button key={key} role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{label}</button>)}<span>{text.basis}: {view==='documents' ? docText.date : labels.date}</span></div>
    <div className="cc-totals cc-results-summary"><span>{text.results} <b>{loading || error ? '—' : visibleRows.length}</b> {text.items}</span><i /><span>{text.partners} <b>{loading || error ? '—' : partnerCount}</b> {text.companies}</span>
      <div className="cc-total-amount"><span>{text.total}</span>{loading || error || !totals.length ? <strong>—</strong> : totals.map(total=><strong key={total.currency}>{money(total.amount,total.currency)}</strong>)}</div>
    </div>
      {loading ? <div className="cc-loading"><CircularProgress size={24} /></div> : error ? <Alert severity="error" action={<button className="cc-button" onClick={load}>{text.retry}</button>}>{error}</Alert> : <div className="cc-table-scroll is-dense">
        {['items','documents'].includes(view) ? <table key={view}><thead><tr>{[labels.date,docText.payee,(ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en).code,docText.description,labels.currency,docText.total,labels.creator,workflow.status,''].map((label,index)=><th key={index} className={index===5?'cc-number':undefined}>{label}</th>)}</tr></thead><tbody>
          {(view==='items'?requests.map(group=>({key:group.key,row:group.row,items:group.items,currencyTotals:group.currencyTotals,document:documentsById.get(group.row.expenseRequestId)})):filteredDocuments.map(document=>({key:document.id,row:{...document,transactionDate:document.requestDate,expenseRequestId:document.id},items:document.items,currencyTotals:document.currencyTotals||expenseCurrencyTotals(document.items),document}))).map(({key,row,items,currencyTotals,document},index)=><tr key={key} data-expense-row={row.id} data-expense-request={row.expenseRequestId} tabIndex={0} onDoubleClick={()=>editRow(row)} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==='Enter')editRow(row);}}>
            <td>{row.transactionDate}</td><td><button className="cc-cell-link" aria-label={text.details+' '+(index+1)} onClick={event=>openRowOnClick(event,row)}>{row.partner?.name||row.payeeEmployee?.name||'\u2014'}</button></td>
            <td><span className="cc-list-text" title={codeSummary(items)}>{codeSummary(items)}</span></td><td><span className="cc-list-text" title={descriptionSummary(items)}>{descriptionSummary(items)}</span></td><td>{currencyTotals.filter(matchesCurrency).map(total=><div key={total.currency}>{total.currency}</div>)}</td><td className="cc-number cc-amount">{currencyTotals.filter(matchesCurrency).map(total=><div key={total.currency}>{money(total.amount,total.currency)}</div>)}</td><td>{row.createdByEmployee?.name||document?.createdByEmployee?.name||'\u2014'}</td><td><ApprovalStatusLabel status={document?.approval?.status||(row.expenseRequestId?'UNKNOWN':'NOT_REQUESTED')} languageCode={languageCode}/></td><td data-table-actions><ExpenseDeletionButton document={document} orgId={activeOrgId} languageCode={languageCode}/></td>
          </tr>)}{!(view==='items'?requests:filteredDocuments).length&&<tr><td colSpan={9} className="cc-empty">{text.empty}</td></tr>}
        </tbody></table> : <table key={view} className="cc-summary"><thead><tr><th>{view==='partner'?labels.partner:labels.industry}</th><th>{labels.currency}</th><th className="cc-number">{text.count}</th><th className="cc-number">{labels.amount}</th><th>{text.share}</th></tr></thead><tbody>
          {groups.map(group=><tr key={group.key}><td>{group.name}</td><td>{group.currency}</td><td className="cc-number">{group.count}</td><td className="cc-number cc-amount">{money(group.amount,group.currency)}</td><td><div className="cc-share"><span><i style={{width:`${group.share}%`}} /></span>{group.share.toFixed(1)}%</div></td></tr>)}{!groups.length && <tr><td colSpan={5} className="cc-empty">{text.empty}</td></tr>}
        </tbody></table>}
      </div>}
      <div className="cc-footer"><span>{text.results}: {loading || error ? '—' : view==='items'?requests.length:view==='documents'?filteredDocuments.length:groups.length} · {text.fullRange}</span></div>
    </section>
  </div></AppPageContainer>;
}
