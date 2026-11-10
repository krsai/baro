import {expensePaymentText} from '../constants/expensePaymentSchedule';
import {ExpensePaymentScheduleView} from './ExpensePaymentSchedule';
import {accountingDirectionText,matchesAccountingDirection} from '../constants/accountingDirection';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
import {cashScheduleText} from '../constants/cashSchedule';
import { expenseLineDescription, expenseRequestSummary } from '../utils/expenseCodePresentation.mjs';
import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { EXPENSE_REQUEST_TEXT } from '../constants/expenseRequest';
import { TRANSACTION_TEXT, serviceName } from './OutsourcingServiceDialog';
import { formatCurrency } from '../utils/currencyFormat';

export const expenseRequestNumber = document => document?.managementNumber || `EXP-${String(document?.id ?? document).padStart(6, '0')}`;
export function ExpenseRequestContent({ document, languageCode }) {
  const labels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const money = (value, currency = document?.currency) => formatCurrency(value, { currencyCode: currency, languageCode });
  const totals = document?.currencyTotals || (document ? [document] : []);
  const unitPrice = value => Number(value).toLocaleString(languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 4 });
  return document && <Stack spacing={2}>
      <Typography variant="subtitle1">{labels.numbering}: {expenseRequestNumber(document)}</Typography>
      <Typography variant="h6">{expenseRequestSummary(document,languageCode)}</Typography>
      {document.remark && <Typography>REMARK: {document.remark}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>{[[labels.payee,document.payeeEmployee?.name||document.partner?.name],[labels.date,document.requestDate],[(cashScheduleText[languageCode]||cashScheduleText.en).payment,document.scheduledPaymentDate],[labels.applicant,document.createdByEmployee?.name]].map(([label,value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{value || '—'}</Typography></Box>)}</Box>
      <Divider />
      <TableContainer><Table size="small" sx={{ minWidth: 1000 }}><TableHead><TableRow>{['#',labels.code,labels.description,labels.currency,labels.quantity,labels.price,labels.subtotal,labels.tax,labels.total].map((label,index) => <TableCell key={index} align={index > 3 ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{document.items.map((item,index) => <TableRow key={item.id} sx={{ '& td': { verticalAlign: 'top' } }}>
          <TableCell>{index + 1}</TableCell><TableCell>{item.transactionCode?.code || '—'}{!matchesAccountingDirection(item.transactionCode,'OUT')&&<Typography role="status" variant="caption" color="warning.main">{(accountingDirectionText[languageCode]||accountingDirectionText.en).mismatch}</Typography>}</TableCell>
          <TableCell>{item.transactionDate !== document.requestDate && <Typography variant="caption" display="block">{labels.useDate}: {item.transactionDate}</Typography>}<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{expenseLineDescription(item,languageCode)}</Typography>
            {[item.workOrder?.orderNumber, item.style?.name, item.styleProcess?.processName].filter(Boolean).length > 0 && <Typography variant="caption" color="text.secondary">{[...new Set([item.workOrder?.orderNumber,item.style?.name,item.styleProcess?.processName,...(item.referenceLinks||[]).flatMap(link=>[link.workOrder?.orderNumber,link.style?.name]),...(item.processLinks||[]).map(link=>link.styleProcess?.processName)])].filter(Boolean).join(' · ')}</Typography>}
            {Object.entries(item.details || {}).filter(([,value]) => value).map(([key,value]) => <Typography key={key} display="block" variant="caption" color="text.secondary">{key==='evidenceFile'?(ledgerEvidenceText[languageCode]||ledgerEvidenceText.en).reference:key==='reference'&&!item.outsourcedWorkRecordId?(ledgerEvidenceText[languageCode]||ledgerEvidenceText.en).supplierReference:common[key] || key}: {value}</Typography>)}
            {!(document.paymentSchedule||[]).some(row=>row.expenseItemId===item.id)&&<Typography variant="caption">{(expensePaymentText[languageCode]||expensePaymentText.en).mode}: {(expensePaymentText[languageCode]||expensePaymentText.en).single}</Typography>}
            <ExpensePaymentScheduleView rows={(document.paymentSchedule||[]).filter(row=>row.expenseItemId===item.id)} languageCode={languageCode}/>
          </TableCell><TableCell>{item.currency || document.currency}</TableCell><TableCell align="right">{String(item.quantity)}{item.unit?' '+serviceName(item.unit,languageCode):''}</TableCell><TableCell align="right">{unitPrice(item.unitPrice)}</TableCell><TableCell align="right">{money(item.subtotal,item.currency || document.currency)}</TableCell><TableCell align="right">{money(item.vatAmount,item.currency || document.currency)} ({String(item.vatRate)}%)</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{money(item.amount,item.currency || document.currency)}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
      <Stack alignItems="flex-end" spacing={1} sx={{ p: 2, bgcolor: 'grey.50' }}>{totals.map(total=><Stack key={total.currency} alignItems="flex-end" spacing={1}><Typography>{labels.subtotal}: {money(total.subtotal,total.currency)}</Typography><Typography>{labels.tax}: {money(total.vatAmount,total.currency)}</Typography><Typography variant="h6" fontWeight={700}>{labels.total}: {money(total.amount,total.currency)}</Typography></Stack>)}</Stack>
    </Stack>;
}
export default function ExpenseRequestView({document,languageCode,onClose}){const labels=EXPENSE_REQUEST_TEXT[languageCode]||EXPENSE_REQUEST_TEXT.ko;return <Dialog open={Boolean(document)} onClose={onClose} fullWidth maxWidth="xl"><DialogTitle>{labels.document}</DialogTitle><DialogContent><ExpenseRequestContent document={document} languageCode={languageCode}/></DialogContent><DialogActions><Button onClick={onClose}>{labels.close}</Button></DialogActions></Dialog>;}
