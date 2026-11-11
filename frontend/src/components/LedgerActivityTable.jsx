import {accountingSummary} from '../utils/accountingSummary.mjs';
import {ledgerFlowText} from '../constants/ledgerFlow';
import {accountingDirectionText,matchesAccountingDirection} from '../constants/accountingDirection';
import React from 'react';
import {Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import DeleteActionButton from './DeleteActionButton';
import {accountingCodeDescription} from '../utils/accountingCode.mjs';
import {formatLedgerAmount} from '../utils/bankLedgerMoney.mjs';
import {ACCOUNTING_CODE_TEXT} from '../constants/accountingCode';
import {changeApprovalText} from '../constants/changeApprovals';

export default function LedgerActivityTable({rows=[],loading,text:t,labels:l,currencyLabel,languageCode,onEdit,onEditKey,onDelete}){
 const warning=(code,direction)=>!matchesAccountingDirection(code,direction)&&<Typography role="status" variant="caption" display="block" color="warning.main">{(accountingDirectionText[languageCode]||accountingDirectionText.en).mismatch}</Typography>;
 const flow=ledgerFlowText[languageCode]||ledgerFlowText.en;
 const change=changeApprovalText[languageCode]||changeApprovalText.en;
 const amountWidth=Math.max(112,...rows.map(row=>formatLedgerAmount(row.amount,row.currencyCode).length*7+16));
 const columns=[{title:t.transactionDate,width:96},{title:flow.from,width:'15%'},{title:flow.to,width:'15%'},{title:(ACCOUNTING_CODE_TEXT[languageCode]||ACCOUNTING_CODE_TEXT.en).code,width:88},{title:l.codeDescription,width:'18%'},{title:currencyLabel,width:56,numeric:true},{title:t.IN,width:'12%',numeric:true},{title:t.OUT,width:'12%',numeric:true},{title:t.createdBy,width:88},{title:'',width:44}];
 const interaction=row=>({hover:!row.voidedAt,tabIndex:row.voidedAt?undefined:0,onDoubleClick:()=>onEdit(row),onKeyDown:event=>onEditKey(event,row),sx:{cursor:row.voidedAt?'default':'pointer'}});
 return <TableContainer><Table size="small" data-testid="ledger-activity-table" data-table-layout="columns" sx={{minWidth:0,width:'100%',tableLayout:'auto','& [data-ledger-amount]':{minWidth:amountWidth}}}>
  <colgroup>{columns.map((column,index)=><col key={index} style={column.width?{width:column.width}:undefined}/>)}</colgroup>
  <TableHead><TableRow>{columns.map((column,index)=><TableCell key={index} align={column.numeric?'right':'left'}>{column.title}</TableCell>)}</TableRow></TableHead>
  <TableBody>
   {!rows.length&&<TableRow><TableCell colSpan={columns.length}>{loading?'…':t.empty}</TableCell></TableRow>}
   {rows.map(row=><React.Fragment key={row.id}>
    <TableRow {...interaction(row)}>
     <TableCell sx={{whiteSpace:'nowrap'}}>{row.transactionDate}{row.voidedAt&&<Typography variant="caption" display="block">{l.deleted}</Typography>}</TableCell>
     <TableCell sx={{overflowWrap:'anywhere'}}>{row.direction==='OUT'?row.accountName:row.evidenceType==='ADJUSTMENT'?'—':row.counterpartyName||'—'}</TableCell><TableCell sx={{overflowWrap:'anywhere'}}>{row.direction==='IN'?row.accountName:row.evidenceType==='ADJUSTMENT'?'—':row.counterpartyName||'—'}</TableCell><TableCell>{accountingSummary(row.allocations?.filter(a=>a.expenseItem).sort((a,b)=>(a.expenseItem.expenseRequestLine||0)-(b.expenseItem.expenseRequestLine||0))?.length?row.allocations?.filter(a=>a.expenseItem).sort((a,b)=>(a.expenseItem.expenseRequestLine||0)-(b.expenseItem.expenseRequestLine||0)).map(a=>a.expenseItem.transactionCode?.code):[row.accountingCode?.code],languageCode)}{warning(row.accountingCode,row.direction)}</TableCell><TableCell sx={{overflowWrap:'anywhere'}}>{accountingSummary(row.allocations?.filter(a=>a.expenseItem).sort((a,b)=>(a.expenseItem.expenseRequestLine||0)-(b.expenseItem.expenseRequestLine||0))?.length?row.allocations?.filter(a=>a.expenseItem).sort((a,b)=>(a.expenseItem.expenseRequestLine||0)-(b.expenseItem.expenseRequestLine||0)).map(a=>accountingCodeDescription(a.expenseItem.transactionCode,languageCode)):[accountingCodeDescription(row.accountingCode,languageCode)],languageCode)}{row.voidedAt&&<Typography variant="caption" display="block">{row.voidReason}</Typography>}</TableCell><TableCell align="right">{row.currencyCode}</TableCell>
     {['IN','OUT'].map(direction=><TableCell key={direction} data-ledger-amount={direction} align="right" sx={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',textDecoration:row.voidedAt?'line-through':undefined}}>{row.direction===direction?formatLedgerAmount(row.amount,row.currencyCode):'—'}</TableCell>)}

     <TableCell sx={{overflowWrap:'anywhere'}}>{row.createdByName||'—'}</TableCell>
     <TableCell data-table-actions onDoubleClick={event=>event.stopPropagation()}>{!row.voidedAt&&<DeleteActionButton stopPropagation disabled={row.changePending} aria-label={change.requestDelete} title={row.changePending?change.pending:change.requestDelete} onDoubleClick={event=>event.stopPropagation()} onClick={()=>onDelete(row)}/>}</TableCell>
    </TableRow>
    {row.settlementLines?.map(detail=><TableRow key={detail.id} {...interaction(row)} sx={{...interaction(row).sx,bgcolor:'action.hover',textDecoration:row.voidedAt?'line-through':undefined}}>
     <TableCell>{'↳'}</TableCell><TableCell>{row.accountName}</TableCell><TableCell>{row.counterpartyName||'—'}</TableCell><TableCell>{detail.accountingCode?.code||'—'}{warning(detail.accountingCode,'OUT')}</TableCell>
     <TableCell><Stack direction="row" spacing={1} justifyContent="space-between"><Typography variant="body2">{accountingCodeDescription(detail.accountingCode,languageCode)||l[detail.kind]}</Typography><Typography variant="body2" sx={{whiteSpace:'nowrap'}}>{formatLedgerAmount(detail.amount,row.currencyCode)}</Typography></Stack><Typography variant="caption" color="text.secondary">{l.noncash}</Typography></TableCell><TableCell>{row.currencyCode}</TableCell><TableCell align="right">{'—'}</TableCell><TableCell align="right">{'—'}</TableCell><TableCell>{detail.createdByName||'—'}</TableCell><TableCell/>
    </TableRow>)}
   </React.Fragment>)}
  </TableBody>
 </Table></TableContainer>;
}
