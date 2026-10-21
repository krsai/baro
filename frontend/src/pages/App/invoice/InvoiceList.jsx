import { usePageDialogs } from '../../../components/PageDialogProvider';
import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Box, Paper, Menu, MenuItem, IconButton, TextField, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import { buildIssuedInvoicePrintHtml } from '../../../utils/issuedInvoicePrint.mjs';
import {useAppActions} from '../../../context/AppContext';
import {invoiceUi,invoiceListUi} from '../../../constants/invoiceUi';
import SearchInput from '../../../components/SearchInput';
import StatusLabel from '../../../components/StatusLabel';
import {formatCurrency} from '../../../utils/currencyFormat';
import MoreVert from '@mui/icons-material/MoreVert';
import InvoiceFinalReviewDialog from './InvoiceFinalReviewDialog';
import InvoiceCreditDialog from './InvoiceCreditDialog';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

export default function InvoiceList({ orgId, languageCode }) {
  const pageDialogs = usePageDialogs();
  const {navigateToPath}=useAppActions();
  const ui=invoiceUi[languageCode]||invoiceUi.en;
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[menuRow,setMenuRow]=useState(null);
  const labels=invoiceListUi[languageCode]||invoiceListUi.en;
  const common = invoiceMessages[languageCode] || invoiceMessages.en;
  const [issued, setIssued] = useState({ rows: [], hasMore: false });
  const [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [finalReviewId, setFinalReviewId] = useState(null);
  const [creditId, setCreditId] = useState(null);
  useWorkspaceRefreshOnEvent({ orgId, topics: [WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS, WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],
    isBlocked: Boolean(finalReviewId) || Boolean(creditId), onRefresh: () => setReload(value => value + 1) });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setError(''); setIssued({rows:[],hasMore:false}); setMenuRow(null);
    const timer=setTimeout(()=>requestJSON(`/invoices/issued${buildQueryString({ orgId, page, search, status })}`, { skipCache:true })
      .then(invoices=>{if(!cancelled)setIssued(invoices);})
      .catch(()=>{if(!cancelled)setError(ui.failed);})
      .finally(()=>{if(!cancelled)setLoading(false);}),200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [orgId, page, reload, search, status, ui.failed]);
  const printIssued = async row => {
    // Open synchronously from the click so browsers do not block the print tab.
    const popup = window.open('', '_blank');
    if (!popup) { setError(ui.failed); return; }
    popup.opener = null;
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const html = buildIssuedInvoicePrintHtml(invoice);
      if (popup.closed) return;
      popup.document.write(html); popup.document.close();
    } catch { popup.close(); setError(ui.failed); }
  };
  const cancelIssued = async row => {
    const policy = languageCode === 'ko' ? '취소하면 이 회차의 채권은 제거되지만 이전 개정본이 다시 활성화되지는 않습니다. 기록된 입금은 보존되어 고객 예수금/환급 검토에 계속 표시됩니다.'
      : languageCode === 'vi' ? 'Hủy sẽ xóa khoản phải thu của đợt này nhưng không khôi phục bản sửa đổi trước. Khoản đã thu vẫn được giữ để kiểm tra số dư hoặc hoàn tiền.'
      : 'Cancellation removes this installment debt but does not reactivate an earlier revision. Recorded receipts remain as customer credit/refund review.';
    if (!await pageDialogs.confirm(policy)) return;
    const reason = await pageDialogs.prompt(languageCode === 'ko' ? '취소 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do hủy.' : 'Enter a cancellation reason.');
    if (!reason?.trim()) return;
    try { await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/cancel${buildQueryString({ orgId })}`, { method: 'POST', body: JSON.stringify({ reason }) });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch (e) { setError(String(e.message).includes('REVERSE_ORDER') ? (languageCode === 'ko' ? '후속 회차를 먼저 취소해야 합니다.' : 'Cancel later installments first.') : ui.failed); }
  };
  const addPayment = async row => {
    let recorded = false;
    const amount = await pageDialogs.prompt(languageCode === 'ko' ? `실입금액을 입력하세요. (${row.currencyCode})` : `Enter received amount (${row.currencyCode}).`);
    if (!amount?.trim()) return;
    const reference = await pageDialogs.prompt(languageCode === 'ko' ? '입금 참고번호를 입력하세요. (선택)' : 'Payment reference (optional).') || '';
    try { const payment = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/payments${buildQueryString({ orgId })}`, {
      method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), amount: amount.trim(),
        receivedAt: new Date().toISOString(), reference, note: '', kind: 'RECEIPT' }),
    });
      recorded = true;
      await pageDialogs.alert(languageCode === 'ko' ? '입금이 저장되었습니다. 다음 배분 입력을 취소해도 입금은 유지됩니다. 배분 버튼에서 이어서 처리할 수 있습니다.' : languageCode === 'vi' ? 'Đã lưu khoản thu. Hủy nhập phân bổ không hủy khoản thu. Có thể tiếp tục bằng nút phân bổ.' : 'Receipt saved. Cancelling allocation will keep this receipt. Use Allocate to resume.');
      if (row.orders.length > 1) {
        const allocations = [];
        for (const order of row.orders) {
          const allocated = await pageDialogs.prompt(languageCode === 'ko'
            ? `${order.sourceOrderNumber} 주문에 배분할 금액을 입력하세요. (배분하지 않으면 0)`
            : `Amount allocated to order ${order.sourceOrderNumber} (0 for none).`, '0');
          if (allocated === null) return;
          if (Number(allocated) > 0) allocations.push({ invoiceOrderId: order.id, amount: allocated.trim() });
        }
        if (allocations.length) await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
          method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: '', allocations }),
        });
      }
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch { setError(recorded ? (languageCode === 'ko' ? '입금은 저장되었으나 배분하지 못했습니다. 다시 입금하지 말고 배분 버튼을 사용하세요.' : languageCode === 'vi' ? 'Đã lưu khoản thu nhưng phân bổ thất bại. Hãy phân bổ lại, không nhập khoản thu lần nữa.' : 'Receipt saved, allocation failed. Use Allocate; do not record the receipt again.') : ui.failed); }
    finally { if (recorded) { emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1); } }
  };
  const refundPayment = async row => {
    let recorded = false;
    const amount = await pageDialogs.prompt(`Refund amount (${row.currencyCode}).`);
    if (!amount?.trim()) return;
    const reference = await pageDialogs.prompt('Refund reference (optional).') || '';
    try {
      const payment = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/payments${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), amount: amount.trim(),
          receivedAt: new Date().toISOString(), reference, note: '', kind: 'REFUND' }),
      });
      recorded = true;
      await pageDialogs.alert(languageCode === 'ko' ? '환불이 저장되었습니다. 배분 입력을 취소해도 환불은 유지됩니다. 배분 버튼에서 이어서 처리할 수 있습니다.' : languageCode === 'vi' ? 'Đã lưu hoàn tiền. Hủy phân bổ không hủy hoàn tiền. Có thể tiếp tục bằng nút phân bổ.' : 'Refund saved. Cancelling allocation will keep this refund. Use Allocate to resume.');
      if (row.orders.length > 1) {
        const allocations = [];
        for (const order of row.orders) {
          const allocated = await pageDialogs.prompt(`Refund allocated to order ${order.sourceOrderNumber} (0 for none).`, '0');
          if (allocated === null) return;
          if (Number(allocated) > 0) allocations.push({ invoiceOrderId: order.id, amount: allocated.trim() });
        }
        if (allocations.length) await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
          method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: '', allocations }),
        });
      }
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId });
      setReload(value => value + 1);
    } catch { setError(recorded ? (languageCode === 'ko' ? '환불은 저장되었으나 배분하지 못했습니다. 다시 환불하지 말고 배분 버튼을 사용하세요.' : languageCode === 'vi' ? 'Đã lưu hoàn tiền nhưng phân bổ thất bại. Hãy phân bổ lại, không hoàn tiền lần nữa.' : 'Refund saved, allocation failed. Use Allocate; do not record the refund again.') : ui.failed); }
    finally { if (recorded) { emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1); } }
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
  const allocateExistingPayment = async row => {
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const payments = (invoice.payments || []).filter(payment => !payment.voidedAt);
      if (!payments.length) return;
      const options = payments.map((payment, index) => `${index + 1}. ${payment.receivedAt} · ${invoice.currencyCode} ${payment.amount} · ${payment.reference || '-'}`).join('\n');
      const selectedIndex = Number(await pageDialogs.prompt(`${options}\n\n${languageCode === 'ko' ? '배분할 입금 번호를 선택하세요.' : 'Select the payment number to allocate.'}`, '1')) - 1;
      const payment = payments[selectedIndex]; if (!payment) return;
      const allocations = [];
      for (const order of invoice.orders || []) {
        const current = (payment.allocations || []).find(item => !item.voidedAt && item.invoiceOrderId === order.id);
        const amount = await pageDialogs.prompt(languageCode === 'ko' ? `${order.sourceOrderNumber} 주문 배분액` : `Allocation for ${order.sourceOrderNumber}`, current?.amount || '0');
        if (amount === null) return;
        if (Number(amount) > 0) allocations.push({ invoiceOrderId: order.id, amount: amount.trim() });
      }
      if (!allocations.length) return;
      const hasCurrent = (payment.allocations || []).some(item => !item.voidedAt);
      const reason = hasCurrent ? await pageDialogs.prompt(languageCode === 'ko' ? '기존 배분을 바꾸는 사유를 입력하세요.' : 'Reason for changing the allocation.') : '';
      if (hasCurrent && !reason?.trim()) return;
      await requestJSON(`/invoices/payments/${encodeURIComponent(payment.id)}/allocations${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason?.trim() || '', allocations }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES], orgId }); setReload(value => value + 1);
    } catch { setError(ui.failed); }
  };
  const showHistory = async row => {
    try {
      const invoice = await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}${buildQueryString({ orgId })}`, { skipCache: true });
      const lines = [
        `${invoice.invoiceNumber} · r${invoice.revisionNumber || 1} · ${invoice.status}`,
        invoice.revisedFrom ? `← ${invoice.revisedFrom.invoiceNumber} (r${invoice.revisedFrom.revisionNumber})` : '',
        invoice.revision ? `→ ${invoice.revision.invoiceNumber} (r${invoice.revision.revisionNumber})` : '',
        ...(invoice.finalLockEvents || []).map(event => `[${event.action}] ${event.createdAt} · ${event.actor} · ${event.recognizedQuantity ?? '-'} · ${event.reason}`),
        ...(invoice.payments || []).map(payment => `${payment.voidedAt ? '[VOID] ' : ''}${payment.kind === 'REFUND' ? '[REFUND] ' : ''}${payment.receivedAt} ${invoice.currencyCode} ${payment.amount}${payment.allocations?.filter(item => !item.voidedAt).map(item => ` · #${item.invoiceOrderId} ${item.amount}`).join('') || ''}`),
      ].filter(Boolean);
      await pageDialogs.alert(lines.join('\n'));
    } catch { setError(ui.failed); }
  };
  const approveFinalLock = row => setFinalReviewId(row.id);
  const unlockFinalLock = async row => {
    const reason = await pageDialogs.prompt(languageCode === 'ko' ? '최종 정산 잠금 해제 사유를 입력하세요.' : languageCode === 'vi' ? 'Nhập lý do mở khóa quyết toán cuối cùng.' : 'Enter a reason for unlocking the final settlement.');
    if (!reason?.trim()) return;
    try {
      await requestJSON(`/invoices/issued/${encodeURIComponent(row.id)}/final-unlock${buildQueryString({ orgId })}`, {
        method: 'POST', body: JSON.stringify({ clientKey: globalThis.crypto.randomUUID(), reason: reason.trim() }),
      });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.ISSUED_INVOICES, WORKSPACE_DATA_TOPICS.ORDERS], orgId }); setReload(value => value + 1);
    } catch { setError(ui.failed); }
  };
  const amount=(value,currencyCode)=>formatCurrency(value,{currencyCode,languageCode});
  const active=menuRow?.row;
  const action=(label,run,color)=> <MenuItem key={label} sx={color?{color}:undefined} onClick={()=>{setMenuRow(null);run(active);}}>{label}</MenuItem>;
  return <Paper variant="outlined" sx={{borderRadius:2,overflow:'hidden'}}>
    <Stack direction={{xs:'column',sm:'row'}} spacing={2} sx={{p:2}}>
      <SearchInput value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder={ui.search}/>
      <TextField select size="small" label={common.invoiceStatus} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}} sx={{minWidth:180}}><MenuItem value="">{ui.all}</MenuItem>{['ISSUED','CANCELLED','SUPERSEDED'].map((value,index)=><MenuItem key={value} value={value}>{[ui.issued,ui.cancelled,ui.superseded][index]}</MenuItem>)}</TextField>
    </Stack>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{common.retry}</Button>}>{error}</Alert>}
    <Box sx={{overflowX:'auto'}}><Table size="small" sx={{minWidth:1100}}><TableHead><TableRow>
      {[common.invoiceNumber,common.issuedDate,common.customerName,labels.orders,labels.statement,labels.received,labels.balance,ui.actions].map((label,index)=><TableCell key={label} align={index>=4&&index<=6?'right':'left'}>{label}</TableCell>)}
    </TableRow></TableHead><TableBody>
      {loading?<TableRow><TableCell colSpan={8} align="center"><CircularProgress size={22}/></TableCell></TableRow>:!issued.rows.length?<TableRow><TableCell colSpan={8} align="center" sx={{py:5}}>{ui.empty}</TableCell></TableRow>:issued.rows.map(row=><TableRow key={row.id} hover>
        <TableCell><Typography variant="subtitle2">{row.invoiceNumber}</Typography><StatusLabel tone={row.status==='ISSUED'?'blue':'gray'} label={{ISSUED:ui.issued,CANCELLED:ui.cancelled,SUPERSEDED:ui.superseded}[row.status]||row.status}/>{row.isFinalLocked&&<Typography variant="caption" color="success.main" display="block">{labels.locked}</Typography>}</TableCell>
        <TableCell sx={{whiteSpace:'nowrap'}}>{new Date(row.issuedAt).toLocaleDateString({ko:'ko-KR',vi:'vi-VN',en:'en-GB'}[languageCode]||'en-GB')}</TableCell>
        <TableCell>{row.buyerName}</TableCell><TableCell>{row.orders.map(order=>order.sourceOrderNumber).join(', ')}<Typography variant="caption" color="text.secondary">r{row.revisionNumber||1}</Typography></TableCell>
        <TableCell align="right"><Typography variant="subtitle2">{amount(row.total,row.currencyCode)}</Typography><Typography variant="caption" color="text.secondary">{labels.debt}: {amount(row.receivableAdded,row.currencyCode)}</Typography></TableCell>
        <TableCell align="right">{amount(row.receivedAmount,row.currencyCode)}</TableCell>
        <TableCell align="right">{amount(row.familyBalanceAmount,row.currencyCode)}<Typography variant="caption" display="block" color={row.familyBalanceKind==='CREDIT'?'warning.main':'text.secondary'}>{!row.isCurrentRevision?labels.historical:row.familyBalanceKind==='CREDIT'?labels.credit:row.familyBalanceKind==='SETTLED'?labels.settled:labels.due}</Typography></TableCell>
        <TableCell sx={{whiteSpace:'nowrap'}}><Button onClick={()=>printIssued(row)}>PDF</Button><IconButton aria-label={ui.actions} onClick={event=>setMenuRow({row,anchor:event.currentTarget})}><MoreVert/></IconButton></TableCell>
      </TableRow>)}
    </TableBody></Table></Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1.5}}><Typography variant="caption" color="text.secondary">{ui.count}: {issued.rows.length}</Typography><Stack direction="row" alignItems="center" spacing={1}><Button disabled={!page||loading} onClick={()=>setPage(v=>v-1)}>{common.previous}</Button><Typography variant="caption">{page+1}</Typography><Button disabled={!issued.hasMore||loading} onClick={()=>setPage(v=>v+1)}>{common.next}</Button></Stack></Stack>
    <Menu anchorEl={menuRow?.anchor} open={Boolean(active)} onClose={()=>setMenuRow(null)}>
      {active&&[
        action(labels.history,showHistory),action(labels.credits,row=>setCreditId(row.id)),
        active.orders.length>1? action(labels.allocate,allocateExistingPayment):null,
        ...(active.status==='ISSUED'?[action(labels.payment,addPayment),action(labels.revise,reviseIssued),active.isFinalLocked?action(labels.unlock,unlockFinalLock,'warning.main'):action(labels.finalClose,approveFinalLock,'success.main'),action(labels.cancel,cancelIssued,'error.main')]:[]),
        Number(active.receivedAmount)>0?action(labels.refund,refundPayment,'warning.main'):null,
      ]}
    </Menu>
    {creditId&&<InvoiceCreditDialog key={creditId} invoiceId={creditId} orgId={orgId} languageCode={languageCode} onClose={()=>setCreditId(null)} onChanged={()=>{setReload(v=>v+1);emitWorkspaceDataChanged({topics:[WORKSPACE_DATA_TOPICS.ISSUED_INVOICES],orgId});}}/>}
    {finalReviewId&&<InvoiceFinalReviewDialog key={finalReviewId} invoiceId={finalReviewId} orgId={orgId} languageCode={languageCode} onClose={()=>setFinalReviewId(null)} onSaved={()=>{setFinalReviewId(null);setReload(v=>v+1);emitWorkspaceDataChanged({topics:[WORKSPACE_DATA_TOPICS.ISSUED_INVOICES,WORKSPACE_DATA_TOPICS.ORDERS],orgId});}}/>}
  </Paper>;
}
