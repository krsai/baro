import React from 'react';
import {Button,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import ApprovalStatusLabel from './ApprovalStatusLabel';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {formatCurrency} from '../utils/currencyFormat';
export default function ApprovalInboxTable({rows,languageCode,onOpen,completed=false}){
 const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 return <TableContainer><Table size="small" sx={{minWidth:760}}><TableHead><TableRow>{[t.type,a.number,a.date,a.payee,a.drafter,t.amount,t.status,...(completed?[t.handledVersion,t.handledAt]:[])].map(label=><TableCell key={label} align={label===t.amount?'right':'left'} sx={{whiteSpace:'nowrap'}}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={`${row.kind}:${row.id}:${row.handledVersion||row.version}`} hover>
  <TableCell>{t.expense}</TableCell><TableCell><Button size="small" onClick={()=>onOpen(row)}>{row.managementNumber}</Button></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.requestDate||'—'}</TableCell><TableCell>{row.payee}</TableCell><TableCell>{row.drafter}</TableCell><TableCell align="right">{row.totals?.map(total=><Typography key={total.currency} variant="body2" noWrap>{formatCurrency(total.amount,{currencyCode:total.currency,languageCode})}</Typography>)}</TableCell><TableCell><ApprovalStatusLabel status={completed?row.decision:row.status} languageCode={languageCode}/>{row.reason&&<Typography variant="caption" sx={{display:'block',whiteSpace:'pre-wrap',maxWidth:240}}>{row.reason}</Typography>}</TableCell>
  {completed&&<><TableCell>{row.handledVersion}</TableCell><TableCell>{row.handledAt?new Date(row.handledAt).toLocaleString(languageCode):'—'}</TableCell></>}
 </TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={completed?9:7}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>;
}
