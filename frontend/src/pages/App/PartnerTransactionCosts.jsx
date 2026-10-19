import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import dayjs from 'dayjs';
import ExpenseRequestView, { expenseRequestNumber } from '../../components/ExpenseRequestView';
import StatusLabel from '../../components/StatusLabel';
import MonthRangeSelector from '../../components/MonthRangeSelector';
import { TRANSACTION_TEXT, OUTSOURCING_REQUEST_TEXT, serviceName } from '../../components/OutsourcingServiceDialog';
import { EXPENSE_REQUEST_TEXT } from '../../constants/expenseRequest';
import { EXPENSE_LIST_TEXT } from '../../constants/expenseList';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useManagementPeriod } from '../../context/ManagementPeriodContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currencyFormat';
import { expenseCurrencyTotals, expenseIndustryKey, groupExpenseRows } from '../../utils/expenseList.mjs';
import { subscribeWorkspaceDataChanged } from '../../utils/workspaceDataEvents';
import './expenseRequests.css';

const currentMonthRange = managementStart => {
  const month = dayjs().startOf('month');
  const start = managementStart && dayjs(managementStart).isAfter(month, 'day') ? dayjs(managementStart).startOf('day') : month;
  return [start, start.endOf('month').startOf('day')];
};

export default function PartnerTransactionCosts({ onNewRequest, onOpenHistorical }) {
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const period = useManagementPeriod();
  const labels = { ...(TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko), ...(OUTSOURCING_REQUEST_TEXT[languageCode] || OUTSOURCING_REQUEST_TEXT.ko) };
  const docText = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const text = EXPENSE_LIST_TEXT[languageCode] || EXPENSE_LIST_TEXT.ko;
  const [rows,setRows] = useState([]), [documents,setDocuments] = useState([]), [view,setView] = useState('items');
  const [loading,setLoading] = useState(true), [errors,setErrors] = useState({ items:'',documents:'' });
  const [search,setSearch] = useState(''), [partner,setPartner] = useState(''), [industry,setIndustry] = useState(''), [currency,setCurrency] = useState(''), [kind,setKind] = useState('');
  const [expanded,setExpanded] = useState(true), [dense,setDense] = useState(true), [checked,setChecked] = useState([]), [ascending,setAscending] = useState(false);
  const [selected,setSelected] = useState(null), [selectedItem,setSelectedItem] = useState(null);
  const [dateFrom,setDateFrom] = useState(() => dayjs().startOf('month')), [dateTo,setDateTo] = useState(() => dayjs().endOf('month').startOf('day'));
  const loadSequence = useRef(0), rangeOrganization = useRef(null);
  const rowClickTimer = useRef(null);
  useEffect(() => () => clearTimeout(rowClickTimer.current), []);
  const error = errors[view === 'documents' ? 'documents' : 'items'];
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setRows([]); setDocuments([]); setSelected(null); setSelectedItem(null); setLoading(true); setErrors({items:'',documents:''});
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
    if (['transaction-request','business-partner'].includes(detail?.source) && Number(detail.orgId) === Number(activeOrgId)) load();
  }),[activeOrgId,load]);
  useEffect(() => {setPartner('');setIndustry('');setCurrency('');setKind('');setChecked([]);},[activeOrgId]);
  useEffect(() => {
    if (loading || period.loading || period.error || rangeOrganization.current === activeOrgId) return;
    const [start,end] = currentMonthRange(period.startDate);
    setDateFrom(start); setDateTo(end);
    rangeOrganization.current = activeOrgId;
  },[activeOrgId,loading,period.loading,period.error,period.startDate]);
  const documentsById = useMemo(()=>new Map(documents.map(row=>[row.id,row])),[documents]);
  const industryLabel = row => serviceName(row.serviceType,languageCode) || (row.sourceKind === 'HISTORICAL_WORK_RECORD' ? labels.process : text.unclassified);
  const searchValues = row => [row.partner?.name,industryLabel(row),row.transactionCode?.code,row.description,row.workOrder?.orderNumber,row.style?.name,row.style?.code,row.styleProcess?.processName,row.styleProcess?.processCode,row.createdByEmployee?.name,...Object.values(row.details||{})];
  const matches = values => values.filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const withinDates = date => date >= dateFrom.format('YYYY-MM-DD') && date <= dateTo.format('YYYY-MM-DD');
  const matchesPartner = row => !partner || String(row.partnerOrgId ?? row.partner?.id) === partner;
  const matchesIndustry = row => !industry || expenseIndustryKey(row) === industry;
  const matchesCurrency = row => !currency || row.currency === currency;
  const matchesKind = row => !kind || (row.sourceKind === 'HISTORICAL_WORK_RECORD' ? 'historical' : 'recorded') === kind;
  const filtered = rows.filter(row => {
    const document = documentsById.get(row.expenseRequestId);
    return withinDates(row.transactionDate) && matchesPartner(row) && matchesIndustry(row) && matchesCurrency(row) && matchesKind(row) &&
      matches([...searchValues(row),document?.title,document && expenseRequestNumber(document.id)]);
  }).sort((a,b)=>ascending ? a.transactionDate.localeCompare(b.transactionDate) : b.transactionDate.localeCompare(a.transactionDate));
  const filteredDocuments = documents.filter(row => withinDates(row.requestDate) && matchesPartner(row) && (!currency || (row.currencyTotals || row.items.map(item=>({...item,currency:item.currency || row.currency}))).some(matchesCurrency)) && kind !== 'historical' &&
    (!industry || row.items.some(matchesIndustry)) && matches([expenseRequestNumber(row.id),row.title,row.partner?.name,row.createdByEmployee?.name,...row.items.flatMap(searchValues)]))
    .sort((a,b)=>ascending ? a.requestDate.localeCompare(b.requestDate) : b.requestDate.localeCompare(a.requestDate));
  const partnerOptions = [...new Map([...rows,...documents].filter(row=>row.partnerOrgId != null || row.partner?.id != null).map(row=>[String(row.partnerOrgId ?? row.partner.id),row.partner?.name || '—'])).entries()];
  const industryOptions = [...new Map(rows.map(row=>[expenseIndustryKey(row),industryLabel(row)])).entries()];
  const currencies = [...new Set([...rows,...documents.flatMap(document=>document.currencyTotals || document.items.map(item=>({...item,currency:item.currency || document.currency})))].map(row=>row.currency).filter(Boolean))].sort();
  const totals = expenseCurrencyTotals(view === 'documents' ? filteredDocuments.flatMap(document=>document.currencyTotals || [document]).filter(matchesCurrency) : filtered);
  const groups = groupExpenseRows(filtered,view, row=>view === 'partner' ? row.partner?.name || '—' : industryLabel(row));
  const visibleRows = view === 'documents' ? filteredDocuments : filtered;
  const partnerCount = new Set(visibleRows.map(row=>row.partnerOrgId ?? row.partner?.id).filter(id=>id!=null)).size;
  const selectedCount = filtered.filter(row=>checked.includes(row.id)).length;
  const allChecked = filtered.length > 0 && selectedCount === filtered.length;
  const money = (value,code) => formatCurrency(value,{currencyCode:code,languageCode});
  const number = value => value == null ? '—' : Number(value).toLocaleString(languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US',{maximumFractionDigits:4});
  const toggle = id => setChecked(current=>current.includes(id) ? current.filter(key=>key!==id) : [...current,id]);
  const reset = () => {
    setSearch('');setPartner('');setIndustry('');setCurrency('');setKind('');setChecked([]);setAscending(false);
    const [start,end] = currentMonthRange(period.startDate);
    setDateFrom(start);setDateTo(end);
  };
  const changeDate = setter => (value,context) => {
    if (!value?.isValid?.() || context?.validationError || setter === setDateFrom && value.isAfter(dateTo,'day') || setter === setDateTo && value.isBefore(dateFrom,'day')) return;
    setter(value.startOf('day'));
  };
  const shiftRange = amount => {
    const month = (amount > 0 ? dateTo : dateFrom).add(amount,'month');
    const start = month.startOf('month');
    setDateFrom(period.startDate && start.isBefore(dayjs(period.startDate),'day') ? dayjs(period.startDate) : start);
    setDateTo(month.endOf('month').startOf('day'));
  };
  const openRow = row => {const document=documentsById.get(row.expenseRequestId);if(document)setSelected(document);else setSelectedItem(row);};
  const editRow = row => {
    clearTimeout(rowClickTimer.current);
    const id = row.workLogId || row.outsourcedWorkRecord?.workLogId;
    setSelected(null); setSelectedItem(null);
    if (id && onOpenHistorical) onOpenHistorical(id);
    else openRow(row);
  };
  const openRowOnClick = (event, row) => {
    event.stopPropagation();
    clearTimeout(rowClickTimer.current);
    if (event.detail < 2) rowClickTimer.current = setTimeout(() => openRow(row), 250);
  };
  const workLogId = selectedItem?.workLogId || selectedItem?.outsourcedWorkRecord?.workLogId;
  const recordKind = row => row.sourceKind === 'HISTORICAL_WORK_RECORD' ? text.historical : text.recorded;
  return <main className="compact-costs cc-live">
    <div className="cc-heading"><div><span className="cc-kicker">BARO GARMENT / COST REQUESTS</span><h1>{labels.costs}</h1></div><div className="cc-actions">
      <button className="cc-button cc-primary" disabled={loading || Boolean(errors.items) || !onNewRequest} onClick={onNewRequest}>{labels.addCost}</button>
    </div></div>
    <section className="cc-panel" aria-label={text.query}>
      <div className="cc-section-bar"><span><b>SEARCH</b><span className="cc-bar-divider">/</span>{text.query}</span><button aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded ? text.collapse : text.expand}</button></div>
      <div className="cc-search-line"><div className="cc-search"><span aria-hidden="true">⌕</span><input aria-label={text.search} placeholder={text.search} value={search} onChange={event=>setSearch(event.target.value)} /></div>
        <div className="cc-dates"><MonthRangeSelector disabled={loading} monthOnly={false} languageCode={languageCode} startValue={dateFrom} endValue={dateTo} onStartChange={changeDate(setDateFrom)} onEndChange={changeDate(setDateTo)} onShift={shiftRange} slotProps={{textField:{sx:{width:140,minWidth:140}}}} /></div>
        <button className="cc-button" disabled={loading} onClick={reset}>↺ {text.reset}</button>
      </div>
      {expanded && <div className="cc-filter-grid">
        <label><span>{labels.industry}</span><select value={industry} onChange={event=>setIndustry(event.target.value)}><option value="">{text.allIndustries}</option>{industryOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label><span>{labels.partner}</span><select value={partner} onChange={event=>setPartner(event.target.value)}><option value="">{text.allPartners}</option>{partnerOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label><span>{text.kind}</span><select value={kind} onChange={event=>setKind(event.target.value)}><option value="">{text.allKinds}</option><option value="recorded">{text.recorded}</option><option value="historical">{text.historical}</option></select></label>
        <label><span>{labels.currency}</span><select value={currency} onChange={event=>setCurrency(event.target.value)}><option value="">{text.allCurrencies}</option>{currencies.map(code=><option key={code}>{code}</option>)}</select></label>
      </div>}
    </section>
    <div className="cc-totals"><span>{text.results} <b>{loading || error ? '—' : visibleRows.length}</b> {text.items}</span><i /><span>{text.partners} <b>{loading || error ? '—' : partnerCount}</b> {text.companies}</span>
      <div className="cc-total-amount"><span>{text.total}</span>{loading || error || !totals.length ? <strong>—</strong> : totals.map(total=><strong key={total.currency}>{money(total.amount,total.currency)}</strong>)}</div>
    </div>
    <section className="cc-panel cc-results">
      <div className="cc-tabs" role="tablist">{[['items',text.detail],['partner',text.partnerSummary],['industry',text.industrySummary],['documents',text.documents]].map(([key,label])=><button key={key} role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{label}</button>)}<span>{text.basis}: {view==='documents' ? docText.date : labels.date}</span></div>
      <div className="cc-grid-tools"><span>{view==='items' ? `${text.selected} ${selectedCount} ${text.items}` : text.summaryHint}<span className="cc-muted"> · {view==='items' ? text.openHint : text.fullRange}</span></span><label><input type="checkbox" checked={dense} onChange={event=>setDense(event.target.checked)} />{text.dense}</label></div>
      {loading ? <div className="cc-loading"><CircularProgress size={24} /></div> : error ? <Alert severity="error" action={<button className="cc-button" onClick={load}>{text.retry}</button>}>{error}</Alert> : <div className={`cc-table-scroll ${dense?'is-dense':''}`}>
        {view==='items' ? <table><thead><tr><th className="cc-check"><input type="checkbox" aria-label={text.selectAll} checked={allChecked} onChange={()=>setChecked(current=>allChecked ? current.filter(id=>!filtered.some(row=>row.id===id)) : [...new Set([...current,...filtered.map(row=>row.id)])])} /></th><th>No.</th><th><button className="cc-sort" onClick={()=>setAscending(value=>!value)}>{labels.date} {ascending?'↑':'↓'}</button></th>{[labels.industry,labels.partner,labels.code,text.order,labels.description,text.quantity,text.unitPrice,labels.amount,labels.creator,text.state].map((label,index)=><th key={index} className={index>=5&&index<=7?'cc-number':''}>{label}</th>)}</tr></thead><tbody>
          {filtered.map((row,index)=><tr key={row.id} onDoubleClick={()=>editRow(row)} className={checked.includes(row.id)?'is-selected':''}>
            <td className="cc-check" onDoubleClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`${text.selectRow} ${index+1}`} checked={checked.includes(row.id)} onChange={()=>toggle(row.id)} /></td><td className="cc-row-no">{index+1}</td><td>{row.transactionDate}</td>
            <td>{industryLabel(row)}</td><td><button className="cc-cell-link" onClick={event=>openRowOnClick(event,row)}>{row.partner?.name || '—'}</button></td><td><span className="cc-code">{row.transactionCode?.code || '—'}</span></td><td>{row.workOrder?.orderNumber || '—'}</td>
            <td><button className="cc-cell-link" onClick={event=>openRowOnClick(event,row)}>{row.description}</button>{documentsById.has(row.expenseRequestId) && <button className="cc-document-link" onClick={event=>{event.stopPropagation();setSelected(documentsById.get(row.expenseRequestId));}} onDoubleClick={event=>event.stopPropagation()}>{expenseRequestNumber(row.expenseRequestId)}</button>}</td>
            <td className="cc-number">{number(row.quantity)}</td><td className="cc-number">{number(row.unitPrice)}</td><td className="cc-number cc-amount">{money(row.amount,row.currency)}</td><td>{row.createdByEmployee?.name || '—'}</td><td><StatusLabel label={recordKind(row)} tone={row.sourceKind==='HISTORICAL_WORK_RECORD'?'gray':'blue'} /></td>
          </tr>)}{!filtered.length && <tr><td colSpan={13} className="cc-empty">{text.empty}</td></tr>}
        </tbody></table> : view==='documents' ? <table><thead><tr>{[docText.numbering,docText.title,docText.payee,docText.date,docText.applicant,docText.items,docText.total].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredDocuments.map(document=><tr key={document.id} onClick={()=>setSelected(document)}><td><button className="cc-cell-link" onClick={()=>setSelected(document)}>{expenseRequestNumber(document.id)}</button></td><td><button className="cc-cell-link" onClick={()=>setSelected(document)}>{document.title}</button></td><td>{document.partner?.name}</td><td>{document.requestDate}</td><td>{document.createdByEmployee?.name}</td><td className="cc-number">{document.items.length}</td><td className="cc-number cc-amount">{(document.currencyTotals || [document]).filter(matchesCurrency).map(total=><div key={total.currency}>{money(total.amount,total.currency)}</div>)}</td></tr>)}
          {!filteredDocuments.length && <tr><td colSpan={7} className="cc-empty">{text.empty}</td></tr>}
        </tbody></table> : <table className="cc-summary"><thead><tr><th>{view==='partner'?labels.partner:labels.industry}</th><th>{labels.currency}</th><th className="cc-number">{text.count}</th><th className="cc-number">{labels.amount}</th><th>{text.share}</th></tr></thead><tbody>
          {groups.map(group=><tr key={group.key}><td>{group.name}</td><td>{group.currency}</td><td className="cc-number">{group.count}</td><td className="cc-number cc-amount">{money(group.amount,group.currency)}</td><td><div className="cc-share"><span><i style={{width:`${group.share}%`}} /></span>{group.share.toFixed(1)}%</div></td></tr>)}{!groups.length && <tr><td colSpan={5} className="cc-empty">{text.empty}</td></tr>}
        </tbody></table>}
      </div>}
      <div className="cc-footer"><span>{text.results}: {loading || error ? '—' : view==='items'?filtered.length:view==='documents'?filteredDocuments.length:groups.length} · {text.fullRange}</span><span>BARO GARMENT</span></div>
    </section>
    <ExpenseRequestView document={selected} languageCode={languageCode} onClose={()=>setSelected(null)} />
    <Dialog open={Boolean(selectedItem)} onClose={()=>setSelectedItem(null)} fullWidth maxWidth="sm"><DialogTitle>{text.details}</DialogTitle><DialogContent>{selectedItem && <dl className="cc-detail">{[
      [labels.date,selectedItem.transactionDate],[labels.partner,selectedItem.partner?.name],[labels.industry,industryLabel(selectedItem)],[labels.code,selectedItem.transactionCode?.code],[labels.description,selectedItem.description],
      [text.order,selectedItem.workOrder?.orderNumber],[text.style,[selectedItem.style?.name,selectedItem.style?.code].filter(Boolean).join(' · ')],[docText.process,selectedItem.styleProcess?.processName],
      [text.quantity,number(selectedItem.quantity)],[text.unitPrice,number(selectedItem.unitPrice)],[labels.amount,money(selectedItem.amount,selectedItem.currency)],[labels.creator,selectedItem.createdByEmployee?.name],
      ...(selectedItem.subtotal == null ? [] : [[docText.subtotal,money(selectedItem.subtotal,selectedItem.currency)]]),
      ...(selectedItem.vatRate == null ? [] : [[docText.vat,String(selectedItem.vatRate)]]),
      ...(selectedItem.vatAmount == null ? [] : [[docText.tax,money(selectedItem.vatAmount,selectedItem.currency)]]),
      ...Object.entries(selectedItem.details||{}).filter(([,value])=>value).map(([key,value])=>[labels[key]||key,value]),
    ].map(([label,value],index)=><div key={index}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>}</DialogContent><DialogActions>{workLogId && onOpenHistorical && <button className="cc-button" onClick={()=>{onOpenHistorical(workLogId);setSelectedItem(null);}}>{text.historical}</button>}<button className="cc-button" onClick={()=>setSelectedItem(null)}>{docText.close}</button></DialogActions></Dialog>
  </main>;
}
