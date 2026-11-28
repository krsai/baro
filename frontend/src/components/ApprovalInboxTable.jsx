import {getRowActionsLabel} from '../constants/rowActions';
import TableStatusRow from './TableStatusRow';
import React from 'react';
import {Button,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import ApprovalStatusLabel from './ApprovalStatusLabel';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
export const approvalRequestDestination=row=>row.kind==='EXPENSE_REQUEST'?`/outsourcing-record/edit/request/${row.id}`:null;
export default function ApprovalInboxTable({rows,languageCode,onOpen,completed=false,renderActions}){
 const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 return <TableContainer><Table data-table-kind="review" size="small" sx={{minWidth:650}}><TableHead><TableRow>{[t.status,t.type,a.number,a.date,a.drafter,...(renderActions?[getRowActionsLabel(languageCode)]:[])].map(label=><TableCell key={label} sx={{whiteSpace:'nowrap'}}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={`${row.kind}:${row.id}:${row.handledVersion||row.version}`} hover><TableCell><ApprovalStatusLabel status={completed?row.decision:row.status} languageCode={languageCode}/>{completed&&<Typography variant="caption" color="text.secondary" sx={{display:'block'}}>{t.handledVersion}: {row.handledVersion}{row.handledAt&&` · ${new Date(row.handledAt).toLocaleString(languageCode)}`}</Typography>}{row.reason&&<Typography variant="caption" sx={{display:'block',whiteSpace:'pre-wrap',maxWidth:300}}>{row.reason}</Typography>}</TableCell>
  <TableCell>{row.kind==='EXPENSE_REQUEST'?t.expense:row.kindLabel||row.kind}</TableCell><TableCell>{approvalRequestDestination(row)?<Button size="small" onClick={()=>onOpen(row)}>{row.managementNumber}</Button>:row.managementNumber}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.requestDate||'—'}</TableCell><TableCell>{row.drafter}</TableCell>
 {renderActions&&<TableCell sx={{minWidth:180}}>{renderActions(row)}</TableCell>}</TableRow>)}{!rows.length&&<TableStatusRow colSpan={renderActions?6:5} languageCode={languageCode} state="empty"/>}</TableBody></Table></TableContainer>;
}
