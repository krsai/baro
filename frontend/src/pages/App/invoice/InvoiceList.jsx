import {invoiceEditText} from '../../../constants/invoiceEdit';
import {orderInvoiceNavigationText,getRowActionsLabel} from '../../../constants/rowActions';
import {invoiceBillToName,invoiceListDescription,compactInvoiceList,invoiceListPresentationText} from '../../../utils/invoiceListPresentation.mjs';
import {RecordInteractionScope, RecordRow, RecordOpenButton} from '../../../components/RecordInteraction';
import ListPagination from '../../../components/ListPagination';
import TableStatusRow from '../../../components/TableStatusRow';

import {accountingOpeningText} from '../../../constants/accountingOpening';
import ChangeApprovalDialog from '../../../components/ChangeApprovalDialog';
import DeleteActionButton from '../../../components/DeleteActionButton';
import {changeApprovalText} from '../../../constants/changeApprovals';
import dayjs from 'dayjs';
import DateRangeSelector from '../../../components/DateRangeSelector';
import {ledgerEntryText} from '../../../constants/ledgerEntry';
import {ledgerWorkspaceText} from '../../../constants/ledgerWorkspace';
import {bankLedgerMessages} from '../../../constants/bankLedgerMessages';
import {ACCOUNTING_CODE_TEXT} from '../../../constants/accountingCode';
import PageContentStack from '../../../components/PageContentStack';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchPanel from '../../../components/SearchPanel';
import React, { useEffect, useState, useRef } from 'react';
import {Button, Chip,CircularProgress, Box, Paper, MenuItem, TextField, Stack, Table, TableCell, TableHead, TableRow, Typography} from '@mui/material';
import Alert from "../../../components/AppNotice";
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
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';


import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

export default function InvoiceList({ orgId, languageCode, invoiceId,sourceOrderId }) {
  const {navigateToPath,showNotification}=useAppActions();const approval=useRef(null),[requesting,setRequesting]=useState(false);const change=changeApprovalText[languageCode]||changeApprovalText.en;
  const deleteInvoice=async row=>{setRequesting(true);try{const result=await approval.current.prepare({menu:'INVOICE',operation:'DELETE',sourceKind:'invoice',sourceId:row.id});if(result){setReload(n=>n+1);showNotification(change.submitted);}}finally{setRequesting(false);}};
  const ui=invoiceUi[languageCode]||invoiceUi.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const [start,setStart]=useState(()=>sourceOrderId?null:dayjs().startOf('month')),[end,setEnd]=useState(()=>sourceOrderId?null:dayjs());
  const entry=ledgerEntryText[languageCode]||ledgerEntryText.en,bank=bankLedgerMessages[languageCode]||bankLedgerMessages.en,workspace=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en;
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[detail,setDetail]=useState(null),[pdfBusy,setPdfBusy]=useState(false);
  const labels=invoiceListUi[languageCode]||invoiceListUi.en;
  const presentation=invoiceListPresentationText[languageCode]||invoiceListPresentationText.en;
  const types=generalInvoiceText[languageCode]||generalInvoiceText.en;
  const common = invoiceMessages[languageCode] || invoiceMessages.en;
  const [issued, setIssued] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [excelBusy,setExcelBusy]=useState(false),excelRequest=useRef(0);
  useEffect(()=>()=>{excelRequest.current++;},[orgId,invoiceId]);
  const downloadExcel=async row=>{
    if(excelBusy)return;
    const request=++excelRequest.current;
    setExcelBusy(true);setError('');
    try{
      const invoice=await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({orgId})}`,{skipCache:true});
      const {buildIssuedInvoiceExcelBlob,downloadInvoiceExcel}=await import('../../../utils/issuedInvoiceExcel.mjs');
      const blob=await buildIssuedInvoiceExcelBlob(invoice);
      if(request===excelRequest.current)downloadInvoiceExcel(blob,invoice);
    }catch{if(request===excelRequest.current)setError(ui.failed);}
    finally{if(request===excelRequest.current)setExcelBusy(false);}
  };


  useWorkspaceRefreshOnEvent({ orgId, isBlocked:requesting||Boolean(invoiceId&&detail?.status==='ISSUED'), topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
     onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError(''); setIssued({rows:[],hasMore:false}); setDetail(null);
    const timer=setTimeout(()=>requestJSON(`/invoices/issued${invoiceId?'/'+encodeURIComponent(invoiceId):''}${buildQueryString({ orgId, ...(!invoiceId?{page, search, status,orderId:sourceOrderId||undefined,start:start?.format('YYYY-MM-DD'),end:end?.format('YYYY-MM-DD')}:{}) })}`, { skipCache:true })
      .then(invoices=>{if(!cancelled){if(invoiceId)setDetail({...invoices,isFinalLocked:invoices.orders?.some(order=>order.workOrder?.invoiceFinalLockedAt&&order.workOrder.invoiceFinalLockInvoiceId===invoices.id)});else setIssued(invoices);}})
      .catch(()=>{if(!cancelled)setError(ui.failed);})
      .finally(()=>{if(!cancelled)setLoading(false);}),200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, invoiceId,sourceOrderId, page, reload, search, status, start, end, ui.failed]);
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
    <SearchPanel search={<SearchInput value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder={ui.search}/>} controls={sourceOrderId?<Chip label={(orderInvoiceNavigationText[languageCode]||orderInvoiceNavigationText.en).order+(issued.orderScope?.orderNumber?': '+issued.orderScope.orderNumber:'')} onDelete={()=>navigateToPath('/invoices')}/>:undefined} dates={<DateRangeSelector independentDateBounds languageCode={languageCode} startValue={start} endValue={end} onStartChange={date=>{if(date?.isValid()){setStart(date);setPage(0);}}} onEndChange={date=>{if(date?.isValid()){setEnd(date);setPage(0);}}}/>} onReset={()=>{setSearch('');setStatus('');setStart(sourceOrderId?null:dayjs().startOf('month'));setEnd(sourceOrderId?null:dayjs());setPage(0);}} />
    <Paper data-search-results variant="outlined" sx={{borderRadius:2,overflow:'hidden'}}>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
    <Box sx={{overflowX:'auto'}}><Table data-table-layout="wide" size="small" sx={{minWidth:1340}}><TableHead><TableRow>
      {[common.issuedDate,presentation.billTo,entry.codeDescription,(ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en).code,workspace.currency,labels.statement,labels.received,labels.balance,bank.createdBy,common.invoiceStatus,getRowActionsLabel(languageCode)].map((label,index)=><TableCell key={index} data-table-actions={index===10?'':undefined} align={index>=5&&index<=7?'right':'left'} sx={{whiteSpace:'nowrap',...(index===0?{minWidth:110}:{})}}>{label}</TableCell>)}
    </TableRow></TableHead><RecordInteractionScope>
      {loading?<TableStatusRow colSpan={11} languageCode={languageCode} state="loading"/>:!issued.rows.length?<TableStatusRow colSpan={11} languageCode={languageCode} error={Boolean(error)} onRetry={()=>setReload(v=>v+1)}/>:issued.rows.map(row=><RecordRow key={row.id} data-cancelled={row.status==='CANCELLED'} hover  recordKey={row.id} onOpen={()=>navigateToPath('/invoices/'+encodeURIComponent(row.id))}  sx={{cursor:'pointer'}}>
        <TableCell sx={{whiteSpace:'nowrap'}}>{new Date(row.issuedAt).toLocaleDateString({ko:'ko-KR',vi:'vi-VN',en:'en-GB'}[languageCode]||'en-GB')}</TableCell>
        <TableCell>{invoiceBillToName(row,languageCode)}</TableCell><TableCell><RecordOpenButton onOpen={()=>navigateToPath('/invoices/'+encodeURIComponent(row.id))}><Typography sx={{minWidth:240,maxWidth:360,textAlign:'left',whiteSpace:'normal',overflowWrap:'anywhere'}} title={[row.invoiceNumber,...(row.descriptions||[]),...(row.orders||[]).map(order=>order.sourceOrderNumber)].filter(Boolean).join(' / ')}>{invoiceListDescription(row,languageCode)}</Typography></RecordOpenButton></TableCell><TableCell title={(row.accountingCodes||[]).join(', ')} sx={{whiteSpace:'nowrap'}}>{compactInvoiceList(row.accountingCodes,languageCode)}</TableCell><TableCell>{(row.currencyTotals||[{currencyCode:row.currencyCode}]).map(total=><div key={total.currencyCode}>{total.currencyCode}</div>)}</TableCell>
        <TableCell align="right"><Typography variant="subtitle2">{row.currencyTotals?row.currencyTotals.map(total=><div key={total.currencyCode}>{amount(total.total,total.currencyCode)}</div>):amount(row.total,row.currencyCode)}</Typography></TableCell>
        <TableCell align="right">{row.currencyBalances?row.currencyBalances.map(total=><div key={total.currencyCode}>{amount(total.receivedAmount,total.currencyCode)}</div>):amount(row.receivedAmount,row.currencyCode)}</TableCell>
        <TableCell align="right" title={row.openingSettlementKind?`${(accountingOpeningText[languageCode]||accountingOpeningText.en)[row.openingSettlementKind]}: ${amount(row.openingSettlementAmount,row.currencyCode)}`:''}>{row.currencyBalances?row.currencyBalances.map(total=><div key={total.currencyCode}>{amount(total.balanceAmount,total.currencyCode)}</div>):amount(row.familyBalanceAmount,row.currencyCode)}</TableCell>
        <TableCell>{row.issuedByName||'\u2014'}</TableCell><TableCell><StatusLabel tone={row.status==='ISSUED'?'blue':'gray'} label={{ISSUED:ui.issued,CANCELLED:ui.cancelled,SUPERSEDED:ui.superseded}[row.status]||row.status}/></TableCell>
        <TableCell data-table-actions sx={{whiteSpace:'nowrap'}}><DeleteActionButton aria-label={change.requestDelete} disabled={loading||requesting||!['ISSUED','CANCELLED'].includes(row.status)} onClick={event=>{event.stopPropagation();deleteInvoice(row);}}/><Button aria-label={d.pdf} disabled={pdfBusy} onDoubleClick={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();printIssued(row);}}><InvoicePdfIcon/></Button><Button aria-label={d.excel} title={d.excel} disabled={excelBusy||loading||requesting} onClick={()=>downloadExcel(row)}><FileDownloadOutlined sx={{color:'#217346',fontSize:24}}/></Button></TableCell>
      </RecordRow>)}
    </RecordInteractionScope></Table></Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">{ui.count}: {issued.rows.length}</Typography><ListPagination languageCode={languageCode} onPrevious={()=>setPage(v=>v-1)} onNext={()=>setPage(v=>v+1)} previousDisabled={!page||loading} nextDisabled={!issued.hasMore||loading} previousLabel={common.previous} nextLabel={common.next}><Typography variant="caption">{page+1}</Typography></ListPagination></Stack>
    </Paper>
    </>}
    {invoiceId&&<>
      {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
      {loading?<CircularProgress size={22}/>:detail&&<>
        {detail.status==='ISSUED'&&!detail.editLockedReason
          ? React.createElement(detail.documentKind==='GENERAL'?GeneralInvoiceEditor:InvoiceEditor,{key:detail.editRevision||detail.id,orgId,revisionInvoice:detail,editInvoice:true,languageCode,pageTitle:d.title,onIssued:()=>setReload(n=>n+1)})
          : <AppPageContainer title={d.title} titleActions={detail.editLockedReason?<Typography variant="body2" color="text.secondary">{(invoiceEditText[languageCode]||invoiceEditText.en).locked}</Typography>:undefined}><InvoiceIssuedForm invoice={detail} languageCode={languageCode}/></AppPageContainer>}
      </>}
    </>}
  <ChangeApprovalDialog ref={approval} orgId={orgId} languageCode={languageCode}/>
  </PageContentStack>;
}
