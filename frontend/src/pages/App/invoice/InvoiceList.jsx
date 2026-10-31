import PageContentStack from '../../../components/PageContentStack';
import SearchPanel from '../../../components/SearchPanel';
import { usePageDialogs } from '../../../components/PageDialogProvider';
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
import InvoiceSheet from '../../../components/InvoiceSheet';
import InvoicePdfIcon from '../../../components/InvoicePdfIcon';
import {buildIssuedInvoicePrintHtml} from '../../../utils/issuedInvoicePrint.mjs';

import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

export default function InvoiceList({ orgId, languageCode, invoiceId }) {
  const pageDialogs = usePageDialogs();
  const {navigateToPath}=useAppActions();
  const ui=invoiceUi[languageCode]||invoiceUi.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[detail,setDetail]=useState(null),[pdfBusy,setPdfBusy]=useState(false);
  const labels=invoiceListUi[languageCode]||invoiceListUi.en;
  const common = invoiceMessages[languageCode] || invoiceMessages.en;
  const [issued, setIssued] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  useWorkspaceRefreshOnEvent({ orgId, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
     onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError(''); setIssued({rows:[],hasMore:false}); setDetail(null);
    const timer=setTimeout(()=>requestJSON(`/invoices/issued${invoiceId?'/'+encodeURIComponent(invoiceId):''}${buildQueryString({ orgId, ...(!invoiceId?{page, search, status}:{}) })}`, { skipCache:true })
      .then(invoices=>{if(!cancelled){if(invoiceId)setDetail({...invoices,isFinalLocked:invoices.orders?.some(order=>order.workOrder?.invoiceFinalLockedAt&&order.workOrder.invoiceFinalLockInvoiceId===invoices.id)});else setIssued(invoices);}})
      .catch(()=>{if(!cancelled)setError(ui.failed);})
      .finally(()=>{if(!cancelled)setLoading(false);}),200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, invoiceId, page, reload, search, status, ui.failed]);
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
      const blob=await Promise.race([buildIssuedInvoicePdfBlob(invoice),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PDF_TIMEOUT')),45000);})]);showInvoicePdf(popup,blob);
    } catch { if(!popup.closed)popup.document.body.textContent=ui.failed; setError(ui.failed); }finally{clearTimeout(timer);setPdfBusy(false);}
  };
  const reviseIssued = async row => {
    const reason = await pageDialogs.prompt(languageCode === 'ko' ? '개정 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do sửa đổi.' : 'Enter a revision reason.');
    if (!reason?.trim()) return;
    try {
      const draft = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/revision-draft${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason.trim() }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS], orgId }); navigateToPath('/invoices/new?revision='+encodeURIComponent(draft.id));
    } catch (e) { setError(String(e.message).includes('INVOICE_REVISION_SOURCE_REMOVED')
      ? (languageCode === 'ko' ? '원본 주문 또는 품목이 삭제되어 개정할 수 없습니다.' : 'The source order or item was removed, so this invoice cannot be revised.') : ui.failed); }
  };
  const amount=(value,currencyCode)=>formatCurrency(value,{currencyCode,languageCode});
  return <PageContentStack>
    {!invoiceId&&<>
    <SearchPanel search={<SearchInput value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder={ui.search}/>} filters={<TextField select size="small" label={common.invoiceStatus} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}} sx={{minWidth:180}}><MenuItem value="">{ui.all}</MenuItem>{['ISSUED','CANCELLED','SUPERSEDED'].map((value,index)=><MenuItem key={value} value={value}>{[ui.issued,ui.cancelled,ui.superseded][index]}</MenuItem>)}</TextField>} onReset={()=>{setSearch('');setStatus('');setPage(0);}} />
    <Paper data-search-results variant="outlined" sx={{borderRadius:2,overflow:'hidden'}}>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
    <Box sx={{overflowX:'auto'}}><Table size="small" sx={{minWidth:1100}}><TableHead><TableRow>
      {[common.issuedDate,common.invoiceStatus,common.invoiceNumber,common.customerName,labels.orders,labels.statement,labels.received,labels.balance,'PDF'].map((label,index)=><TableCell key={label} align={index>=5&&index<=7?'right':'left'}>{label}</TableCell>)}
    </TableRow></TableHead><TableBody>
      {loading?<TableRow><TableCell colSpan={9} align="center"><CircularProgress size={22}/></TableCell></TableRow>:!issued.rows.length?<TableRow><TableCell colSpan={9} align="center" sx={{py:5}}>{ui.empty}</TableCell></TableRow>:issued.rows.map(row=><TableRow key={row.id} hover tabIndex={0} onDoubleClick={event=>{if(!event.target.closest('button,a,input,select'))navigateToPath('/invoices/'+encodeURIComponent(row.id));}} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==='Enter'){event.preventDefault();navigateToPath('/invoices/'+encodeURIComponent(row.id));}}} sx={{cursor:'pointer'}}>
        <TableCell sx={{whiteSpace:'nowrap'}}>{new Date(row.issuedAt).toLocaleDateString({ko:'ko-KR',vi:'vi-VN',en:'en-GB'}[languageCode]||'en-GB')}</TableCell>
        <TableCell><StatusLabel tone={row.status==='ISSUED'?'blue':'gray'} label={{ISSUED:ui.issued,CANCELLED:ui.cancelled,SUPERSEDED:ui.superseded}[row.status]||row.status}/>{row.isFinalLocked&&<Typography variant="caption" color="success.main" display="block">{labels.locked}</Typography>}</TableCell>
        <TableCell><Typography variant="subtitle2">{row.invoiceNumber}</Typography></TableCell>
        <TableCell>{row.buyerName}</TableCell><TableCell>{row.orders.map(order=>order.sourceOrderNumber).join(', ')}<Typography variant="caption" color="text.secondary">r{row.revisionNumber||1}</Typography></TableCell>
        <TableCell align="right"><Typography variant="subtitle2">{amount(row.total,row.currencyCode)}</Typography><Typography variant="caption" color="text.secondary">{labels.debt}: {amount(row.receivableAdded,row.currencyCode)}</Typography></TableCell>
        <TableCell align="right">{amount(row.receivedAmount,row.currencyCode)}</TableCell>
        <TableCell align="right">{amount(row.familyBalanceAmount,row.currencyCode)}<Typography variant="caption" display="block" color={row.familyBalanceKind==='CREDIT'?'warning.main':'text.secondary'}>{!row.isCurrentRevision?labels.historical:row.familyBalanceKind==='CREDIT'?labels.credit:row.familyBalanceKind==='SETTLED'?labels.settled:labels.due}</Typography></TableCell>
        <TableCell><Button aria-label={d.pdf} disabled={pdfBusy} onDoubleClick={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();printIssued(row);}}><InvoicePdfIcon/></Button></TableCell>
      </TableRow>)}
    </TableBody></Table></Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">{ui.count}: {issued.rows.length}</Typography><Stack direction="row" alignItems="center" spacing={1}><Button disabled={!page||loading} onClick={()=>setPage(v=>v-1)}>{common.previous}</Button><Typography variant="caption">{page+1}</Typography><Button disabled={!issued.hasMore||loading} onClick={()=>setPage(v=>v+1)}>{common.next}</Button></Stack></Stack>
    </Paper>
    </>}
    {invoiceId&&<>
      {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
      {loading?<CircularProgress size={22}/>:detail&&<>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Button onClick={()=>navigateToPath('/invoices',{closeTabId:'/invoices/'+invoiceId})}>{d.back}</Button><Button disabled={pdfBusy} aria-label={d.pdf} onClick={()=>printIssued(detail)}><InvoicePdfIcon/></Button>
        {detail.status==='ISSUED'&&<Button onClick={()=>reviseIssued(detail)}>{ui.edit}</Button>}
        </Stack>
        <InvoiceSheet sx={{p:0,overflow:'hidden'}}><Box component="iframe" title={d.title} sandbox="allow-same-origin" srcDoc={buildIssuedInvoicePrintHtml(detail)} onLoad={event=>{const frame=event.currentTarget;frame.style.height=(frame.contentDocument.body.scrollHeight+32)+'px';}} sx={{display:'block',border:0,width:'100%',minHeight:900}}/></InvoiceSheet>
      </>}
    </>}
  </PageContentStack>;
}
