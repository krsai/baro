import dayjs from 'dayjs';
import DateRangeSelector from '../../../components/DateRangeSelector';
import {ledgerFlowText} from '../../../constants/ledgerFlow';
import {ledgerEntryText} from '../../../constants/ledgerEntry';
import {ledgerWorkspaceText} from '../../../constants/ledgerWorkspace';
import {bankLedgerMessages} from '../../../constants/bankLedgerMessages';
import {ACCOUNTING_CODE_TEXT} from '../../../constants/accountingCode';
import PageContentStack from '../../../components/PageContentStack';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchPanel from '../../../components/SearchPanel';
import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Box, Paper, MenuItem, TextField, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import {buildIssuedInvoicePdfBlob,showInvoicePdf} from '../../../utils/issuedInvoicePdf';
import {invoiceDetailText} from '../../../constants/invoiceDetail';
import {useAppActions} from '../../../context/AppContext';
import {invoiceUi,invoiceListUi} from '../../../constants/invoiceUi';
import SearchInput from '../../../components/SearchInput';
import StatusLabel from '../../../components/StatusLabel';
import {formatCurrency} from '../../../utils/currencyFormat';
import InvoiceIssuedForm from './InvoiceIssuedForm';
import InvoiceEditor from './InvoiceEditor';
import GeneralInvoiceEditor from './GeneralInvoiceEditor';
import {generalInvoiceText} from '../../../constants/generalInvoice';
import InvoicePdfIcon from '../../../components/InvoicePdfIcon';


import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

export default function InvoiceList({ orgId, languageCode, invoiceId }) {
  const {navigateToPath}=useAppActions();
  const ui=invoiceUi[languageCode]||invoiceUi.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const [start,setStart]=useState(()=>dayjs().startOf('month')),[end,setEnd]=useState(()=>dayjs());
  const flow=ledgerFlowText[languageCode]||ledgerFlowText.en,entry=ledgerEntryText[languageCode]||ledgerEntryText.en,bank=bankLedgerMessages[languageCode]||bankLedgerMessages.en,workspace=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en;
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[detail,setDetail]=useState(null),[pdfBusy,setPdfBusy]=useState(false);
  const labels=invoiceListUi[languageCode]||invoiceListUi.en;
  const types=generalInvoiceText[languageCode]||generalInvoiceText.en;
  const common = invoiceMessages[languageCode] || invoiceMessages.en;
  const [issued, setIssued] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revising,setRevising]=useState(false);
  useWorkspaceRefreshOnEvent({ orgId, isBlocked:revising, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
     onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError(''); setIssued({rows:[],hasMore:false}); setDetail(null); setRevising(false);
    const timer=setTimeout(()=>requestJSON(`/invoices/issued${invoiceId?'/'+encodeURIComponent(invoiceId):''}${buildQueryString({ orgId, ...(!invoiceId?{page, search, status,start:start.format('YYYY-MM-DD'),end:end.format('YYYY-MM-DD')}:{}) })}`, { skipCache:true })
      .then(invoices=>{if(!cancelled){if(invoiceId)setDetail({...invoices,isFinalLocked:invoices.orders?.some(order=>order.workOrder?.invoiceFinalLockedAt&&order.workOrder.invoiceFinalLockInvoiceId===invoices.id)});else setIssued(invoices);}})
      .catch(()=>{if(!cancelled)setError(ui.failed);})
      .finally(()=>{if(!cancelled)setLoading(false);}),200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, invoiceId, page, reload, search, status, start, end, ui.failed]);
  const printIssued = async row => {
    // Open synchronously from the click so browsers do not block the print tab.
    const popup = window.open('', '_blank');
    if (!popup) { setError(ui.failed); return; }
    popup.opener = null;
    popup.document.title = 'PDF';
    popup.document.body.textContent = languageCode==='ko'?'PDF를 준비하고 있습니다…':languageCode==='vi'?'Đang tạo PDF…':'Preparing PDF…';
    setPdfBusy(true);
    let timer;
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const blob=await Promise.race([buildIssuedInvoicePdfBlob(invoice,languageCode),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF_TIMEOUT')),45000);})]);showInvoicePdf(popup,blob);
    } catch { if(!popup.closed)popup.document.body.textContent=ui.failed; setError(ui.failed); }finally{clearTimeout(timer);setPdfBusy(false);}
  };
  const amount=(value,currencyCode)=>formatCurrency(value,{currencyCode,languageCode});
  return <PageContentStack>
    {!invoiceId&&<>
    <SearchPanel compact search={<SearchInput value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder={ui.search}/>} controls={<DateRangeSelector independentDateBounds languageCode={languageCode} startValue={start} endValue={end} onStartChange={date=>{if(date?.isValid()){setStart(date);setPage(0);}}} onEndChange={date=>{if(date?.isValid()){setEnd(date);setPage(0);}}}/>} onReset={()=>{setSearch('');setStatus('');setStart(dayjs().startOf('month'));setEnd(dayjs());setPage(0);}} />
    <Paper data-search-results variant="outlined" sx={{borderRadius:2,overflow:'hidden'}}>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
    <Box sx={{overflowX:'auto'}}><Table size="small" sx={{minWidth:1100}}><TableHead><TableRow>
      {[common.issuedDate,flow.from,flow.to,(ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en).code,entry.codeDescription,workspace.currency,labels.statement,labels.received,labels.balance,bank.createdBy,common.invoiceStatus,'PDF'].map((label,index)=><TableCell key={index} align={index>=6&&index<=8?'right':'left'}>{label}</TableCell>)}
    </TableRow></TableHead><TableBody>
      {loading?<TableRow><TableCell colSpan={12} align="center"><CircularProgress size={22}/></TableCell></TableRow>:!issued.rows.length?<TableRow><TableCell colSpan={12} align="center" sx={{py:5}}>{ui.empty}</TableCell></TableRow>:issued.rows.map(row=><TableRow key={row.id} hover tabIndex={0} onDoubleClick={event=>{if(!event.target.closest('button,a,input,select'))navigateToPath('/invoices/'+encodeURIComponent(row.id));}} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==='Enter'){event.preventDefault();navigateToPath('/invoices/'+encodeURIComponent(row.id));}}} sx={{cursor:'pointer'}}>
        <TableCell sx={{whiteSpace:'nowrap'}}>{new Date(row.issuedAt).toLocaleDateString({ko:'ko-KR',vi:'vi-VN',en:'en-GB'}[languageCode]||'en-GB')}</TableCell>
        <TableCell>{row.sellerName||'\u2014'}</TableCell><TableCell>{row.buyerName}</TableCell><TableCell>{(row.accountingCodes||[]).join(', ')||'\u2014'}</TableCell><TableCell><Typography noWrap sx={{maxWidth:240}} title={[row.invoiceNumber,...(row.descriptions||[]),...(row.orders||[]).map(order=>order.sourceOrderNumber)].filter(Boolean).join(' / ')}>{[row.invoiceNumber,...(row.descriptions||[])].filter(Boolean).join(' / ')}</Typography></TableCell><TableCell>{row.currencyCode}</TableCell>
        <TableCell align="right"><Typography variant="subtitle2">{amount(row.total,row.currencyCode)}</Typography></TableCell>
        <TableCell align="right">{amount(row.receivedAmount,row.currencyCode)}</TableCell>
        <TableCell align="right">{amount(row.familyBalanceAmount,row.currencyCode)}</TableCell>
        <TableCell>{row.issuedByName||'\u2014'}</TableCell><TableCell><StatusLabel tone={row.status==='ISSUED'?'blue':'gray'} label={{ISSUED:ui.issued,CANCELLED:ui.cancelled,SUPERSEDED:ui.superseded}[row.status]||row.status}/></TableCell>
        <TableCell><Button aria-label={d.pdf} disabled={pdfBusy} onDoubleClick={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();printIssued(row);}}><InvoicePdfIcon/></Button></TableCell>
      </TableRow>)}
    </TableBody></Table></Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">{ui.count}: {issued.rows.length}</Typography><Stack direction="row" alignItems="center" spacing={1}><Button disabled={!page||loading} onClick={()=>setPage(v=>v-1)}>{common.previous}</Button><Typography variant="caption">{page+1}</Typography><Button disabled={!issued.hasMore||loading} onClick={()=>setPage(v=>v+1)}>{common.next}</Button></Stack></Stack>
    </Paper>
    </>}
    {invoiceId&&<>
      {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
      {loading?<CircularProgress size={22}/>:detail&&<>
        {detail.status==='ISSUED'&&revising
          ? React.createElement(detail.documentKind==='GENERAL'?GeneralInvoiceEditor:InvoiceEditor,{orgId,revisionInvoice:detail,languageCode,onClose:()=>setRevising(false),onIssued:()=>navigateToPath('/invoices')})
          : <AppPageContainer title={d.title} titleActions={detail.status==='ISSUED'?<Button variant="outlined" onClick={()=>setRevising(true)}>{labels.revise}</Button>:undefined}><InvoiceIssuedForm invoice={detail} languageCode={languageCode}/></AppPageContainer>}
      </>}
    </>}
  </PageContentStack>;
}
