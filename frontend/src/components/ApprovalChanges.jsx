import React,{useState} from 'react';
import {Box,Button,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography,Tooltip} from '@mui/material';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';
import {evidenceReference} from '../utils/evidenceReference.mjs';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {approvalReviewText} from '../constants/approvalReview';
import {ledgerFlowText} from '../constants/ledgerFlow';
import {ledgerEntryText} from '../constants/ledgerEntry';

const TEXT={
 ko:{title:'변경된 항목',field:'항목',code:'회계 코드',currency:'통화',same:'변경 없는 항목',hide:'접기',none:'변경된 항목이 없습니다.',item:'비용 항목',quantity:'수량',price:'단가',tax:'세율',fee:'은행 수수료',feeHelp:'은행에 지급하는 이체·처리 비용입니다.',writeoff:'대손 처리',writeoffHelp:'회수하지 못하는 채권을 손실로 처리하는 금액입니다. 은행에서 나가는 수수료와 다릅니다.'},
 en:{title:'Changed fields',field:'Field',code:'Accounting code',currency:'Currency',same:'Unchanged fields',hide:'Collapse',none:'No fields changed.',item:'Expense item',quantity:'Quantity',price:'Unit price',tax:'Tax rate',fee:'Bank fee',feeHelp:'Transfer or processing costs paid to the bank.',writeoff:'Write-off',writeoffHelp:'An uncollectible receivable recognized as a loss, rather than a bank charge.'},
 vi:{title:'Nội dung thay đổi',field:'Mục',code:'Mã kế toán',currency:'Tiền tệ',same:'Mục không thay đổi',hide:'Thu gọn',none:'Không có thay đổi.',item:'Khoản chi',quantity:'Số lượng',price:'Đơn giá',tax:'Thuế suất',fee:'Phí ngân hàng',feeHelp:'Chi phí chuyển tiền hoặc xử lý trả cho ngân hàng.',writeoff:'Xóa nợ',writeoffHelp:'Khoản phải thu không thể thu hồi được ghi nhận là tổn thất, không phải phí ngân hàng.'},
};
const canonical=value=>String(value??'').replace(/^(\d+)(?:\.(\d*?))?0*$/,(_all,whole,fraction)=>whole.replace(/^0+(?=\d)/,'')+(fraction?'.'+fraction:''));
const codeText=(code,language)=>[code?.code,accountingCodeDescription(code,language)].filter(Boolean).join(' · ')||'—';

export default function ApprovalChanges({detail,languageCode}){
 const t=approvalReviewText[languageCode]||approvalReviewText.en,x=TEXT[languageCode]||TEXT.en,flow=ledgerFlowText[languageCode]||ledgerFlowText.en;
 const ledgerLabels=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const [showSame,setShowSame]=useState(false),rows=[];
 const add=(key,label,before,after,beforeKey=before,afterKey=after,help)=>rows.push({key,label,before:before??'—',after:after??'—',changed:String(beforeKey??'')!==String(afterKey??''),help});
 if(detail.menu==='BANK_LEDGER'){
  const before=detail.before?.entry||{},after=detail.after?.rows?.find(row=>row.entryKind==='BANK')||{},account=detail.before?.account||{},proposed=detail.before?.proposedAccount||account;
  const currency=account.currencyCode,afterCurrency=proposed.currencyCode||currency;
  add('date',t.dateTransaction,before.transactionDate,after.transactionDate);
  add('account',t.account,[account.name,currency].filter(Boolean).join(' / '),[proposed.name,afterCurrency].filter(Boolean).join(' / '),before.accountId??account.id,after.accountId??account.id);
  add('party',t.party,before.counterpartyName,detail.before?.proposedCounterparty?.name||after.counterparty?.name,before.counterpartyOrgId?`PARTNER:${before.counterpartyOrgId}`:before.counterpartyEmployeeId?`EMPLOYEE:${before.counterpartyEmployeeId}`:before.counterpartyAccountId?`ACCOUNT:${before.counterpartyAccountId}`:before.counterpartyName,after.counterparty?`${after.counterparty.kind}:${after.counterparty.id}`:detail.before?.proposedCounterparty?.name);
  add('direction',t.direction,t[before.direction],t[after.direction],before.direction,after.direction);
  add('code',x.code,codeText(before.accountingCode,languageCode),codeText(after.accountingCode,languageCode),before.accountingCodeId,after.accountingCodeId);
  add('amount',t.amount,formatInvoiceMoney(String(before.amount||0),currency),formatInvoiceMoney(String(after.amount||0),afterCurrency),currency+':'+canonical(before.amount),afterCurrency+':'+canonical(after.amount));
  add('purpose',t.purpose,before.remark||before.purpose,after.remark||after.purpose);
  add('reference',t.reference,evidenceReference(before.evidenceNumber),evidenceReference(after.evidenceNumber));
  add('evidenceType',ledgerLabels.evidenceKind,ledgerLabels[before.evidenceType]||before.evidenceType,ledgerLabels[after.evidenceType]||after.evidenceType,before.evidenceType,after.evidenceType);
  const children=(detail.after?.rows||[]).filter(row=>row.entryKind!=='BANK'&&(!row.parentClientKey||row.parentClientKey===after.clientKey));
  for(const [kind,key,label,help] of [['FEE','bankFee',x.fee,x.feeHelp],['WRITEOFF','writeOffAmount',x.writeoff,x.writeoffHelp]]){
   const next=children.filter(row=>row.entryKind===kind),old=before[key]||'0';
   if(Number(old)!==0||next.some(row=>Number(row.amount)!==0))add(key,label,formatInvoiceMoney(String(old),currency),next.length?next.map(row=>formatInvoiceMoney(String(row.amount),afterCurrency)).join(' + '):formatInvoiceMoney('0',afterCurrency),canonical(old),next.length===1?canonical(next[0].amount):next.length?next.map(row=>canonical(row.amount)).join('+'):'0',help);
  }
  if(detail.before?.transfer||after.transferCurrencyCode)add('transfer',flow.transferAmount,detail.before?.transfer?formatInvoiceMoney(String(detail.before.transfer.amount),detail.before.transfer.currencyCode):'—',after.transferAmount?formatInvoiceMoney(String(after.transferAmount),after.transferCurrencyCode):'—');
  for(const [index,row] of (detail.after?.rows||[]).filter(row=>row.entryKind==='BANK'&&row!==after).entries()){
   const source=detail.before?.proposedRows?.find(item=>item.clientKey===row.clientKey)||row,cash=detail.before?.proposedAccounts?.find(item=>item.accountId===row.accountId)?.currency||afterCurrency;
   add('extra-'+index,`${t.CREATE} ${index+2}`,'—',[codeText(row.accountingCode,languageCode),source.counterparty?.name,formatInvoiceMoney(String(row.amount),cash)].filter(Boolean).join(' · '));
  }
 }else if(detail.menu==='EXPENSE'){
  const before=detail.before?.document||{},after=detail.after?.document||{},oldItems=detail.before?.costs||before.items||[],newItems=detail.after?.costs||after.items||[];
  add('date',t.dateTransaction,before.requestDate,after.requestDate);add('party',t.party,before.partner?.name||before.payeeEmployee?.name,after.partner?.name||after.payeeEmployee?.name,before.payeeEmployeeId?'E:'+before.payeeEmployeeId:before.partnerOrgId,after.payeeEmployeeId?'E:'+after.payeeEmployeeId:after.partnerOrgId);add('remark',t.purpose,before.remark,after.remark);
  const used=new Set();
  const itemRows=(old,next,index)=>{const label=`${x.item} ${index+1} · `;
   add('code-'+index,label+x.code,codeText(old?.transactionCode,languageCode),codeText(next?.transactionCode,languageCode),old?.transactionCodeId,next?.transactionCodeId);
   for(const [key,title] of [['quantity',x.quantity],['unitPrice',x.price],['vatRate',x.tax],['amount',t.amount]])add(key+index,label+title,old?key==='amount'||key==='unitPrice'?formatInvoiceMoney(String(old[key]||0),old.currency):old[key]:'—',next?key==='amount'||key==='unitPrice'?formatInvoiceMoney(String(next[key]||0),next.currency):next[key]:'—',old?old.currency+':'+canonical(old[key]):'',next?next.currency+':'+canonical(next[key]):'');
   add('details'+index,label+t.reference,[old?.details?.reference,evidenceReference(old?.details?.evidenceFile)].filter(Boolean).join('\n'),[next?.details?.reference,evidenceReference(next?.details?.evidenceFile)].filter(Boolean).join('\n'));
  };
  oldItems.forEach((old,index)=>{const next=newItems.find(row=>(row.itemId||row.id)===old.id);if(next)used.add(next);itemRows(old,next,index);});newItems.filter(row=>!used.has(row)).forEach((next,index)=>itemRows(null,next,oldItems.length+index));
 }
 const changed=rows.filter(row=>row.changed),same=rows.filter(row=>!row.changed);
 return <Paper variant="outlined" sx={{p:2,minWidth:0}} data-testid="approval-changes"><Stack direction="row" gap={1} alignItems="center" sx={{mb:1}}><Typography variant="h6">{x.title}</Typography><Typography color="primary" fontWeight={700}>{changed.length}</Typography></Stack>
  {!changed.length&&<Typography color="text.secondary">{x.none}</Typography>}
  <TableContainer><Table size="small" data-table-layout="fixed" sx={{tableLayout:'fixed'}}><TableHead><TableRow>{[x.field,t.before,t.after].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{[...changed,...(showSame?same:[])].map(row=><TableRow key={row.key} data-changed={row.changed||undefined} sx={row.changed?{bgcolor:'action.selected'}:{}}><TableCell sx={{width:'24%',overflowWrap:'anywhere'}}>{row.help?<Tooltip title={row.help}><span>{row.label} ⓘ</span></Tooltip>:row.label}</TableCell><TableCell sx={{color:'text.secondary',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.before||'—'}</TableCell><TableCell sx={{fontWeight:row.changed?700:400,color:row.changed?'primary.main':'text.primary',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.after||'—'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
  {!!same.length&&<Button size="small" sx={{mt:1}} onClick={()=>setShowSame(value=>!value)}>{showSame?x.hide:`${x.same} (${same.length})`}</Button>}
 </Paper>;
}
