import React from 'react';
import {Button,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import ApprovalStatusLabel from './ApprovalStatusLabel';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
export const approvalRequestDestination=row=>row.kind==='EXPENSE_REQUEST'?`/outsourcing-record/edit/request/${row.id}`:null;
export default function ApprovalInboxTable({rows,languageCode,onOpen,completed=false}){
 const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 return <TableContainer><Table size="small" sx={{minWidth:650}}><TableHead><TableRow>{[t.type,a.number,a.date,a.drafter,t.status].map(label=><TableCell key={label} sx={{whiteSpace:'nowrap'}}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={`${row.kind}:${row.id}:${row.handledVersion||row.version}`} hover>
  <TableCell>{row.kind==='EXPENSE_REQUEST'?t.expense:row.kindLabel||row.kind}</TableCell><TableCell>{approvalRequestDestination(row)?<Button size="small" onClick={()=>onOpen(row)}>{row.managementNumber}</Button>:row.managementNumber}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.requestDate||'—'}</TableCell><TableCell>{row.drafter}</TableCell><TableCell><ApprovalStatusLabel status={completed?row.decision:row.status} languageCode={languageCode}/>{completed&&<Typography variant="caption" color="text.secondary" sx={{display:'block'}}>{t.handledVersion}: {row.handledVersion}{row.handledAt&&` · ${new Date(row.handledAt).toLocaleString(languageCode)}`}</Typography>}{row.reason&&<Typography variant="caption" sx={{display:'block',whiteSpace:'pre-wrap',maxWidth:300}}>{row.reason}</Typography>}</TableCell>
 </TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={5}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>;
}
