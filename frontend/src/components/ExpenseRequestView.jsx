import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { EXPENSE_REQUEST_TEXT } from '../constants/expenseRequest';
import { TRANSACTION_TEXT, serviceName } from './OutsourcingServiceDialog';
import { formatCurrency } from '../utils/currencyFormat';

export const expenseRequestNumber = id => `EXP-${String(id).padStart(6, '0')}`;
export default function ExpenseRequestView({ document, languageCode, onClose }) {
  const labels = EXPENSE_REQUEST_TEXT[languageCode] || EXPENSE_REQUEST_TEXT.ko;
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const money = value => formatCurrency(value, { currencyCode: document?.currency, languageCode });
  const unitPrice = value => Number(value).toLocaleString(languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 4 });
  return <Dialog open={Boolean(document)} onClose={onClose} fullWidth maxWidth="xl">
    <DialogTitle>{labels.document} {document && expenseRequestNumber(document.id)}</DialogTitle>
    {document && <DialogContent><Stack spacing={2}>
      <Typography variant="h6">{document.title}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>{[[labels.payee,document.partner?.name],[labels.date,document.requestDate],[labels.applicant,document.createdByEmployee?.name],[labels.currency,document.currency]].map(([label,value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{value || '—'}</Typography></Box>)}</Box>
      <Divider />
      <TableContainer><Table size="small" sx={{ minWidth: 1000 }}><TableHead><TableRow>{['#',labels.code,labels.description,labels.quantity,labels.price,labels.subtotal,labels.tax,labels.total].map((label,index) => <TableCell key={index} align={index > 2 ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{document.items.map((item,index) => <TableRow key={item.id} sx={{ '& td': { verticalAlign: 'top' } }}>
          <TableCell>{index + 1}</TableCell><TableCell>{item.transactionCode?.code || '—'}</TableCell>
          <TableCell>{item.transactionDate !== document.requestDate && <Typography variant="caption" display="block">{labels.useDate}: {item.transactionDate}</Typography>}<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.description}</Typography>
            {[item.workOrder?.orderNumber, item.style?.name, item.styleProcess?.processName].filter(Boolean).length > 0 && <Typography variant="caption" color="text.secondary">{[item.workOrder?.orderNumber,item.style?.name,item.styleProcess?.processName].filter(Boolean).join(' · ')}</Typography>}
            {Object.entries(item.details || {}).filter(([,value]) => value).map(([key,value]) => <Typography key={key} display="block" variant="caption" color="text.secondary">{common[key] || key}: {value}</Typography>)}
          </TableCell><TableCell align="right">{String(item.quantity)}</TableCell><TableCell align="right">{unitPrice(item.unitPrice)}</TableCell><TableCell align="right">{money(item.subtotal)}</TableCell><TableCell align="right">{money(item.vatAmount)} ({String(item.vatRate)}%)</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{money(item.amount)}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
      <Stack alignItems="flex-end" spacing={1} sx={{ p: 2, bgcolor: 'grey.50' }}><Typography>{labels.subtotal}: {money(document.subtotal)}</Typography><Typography>{labels.tax}: {money(document.vatAmount)}</Typography><Typography variant="h6" fontWeight={700}>{labels.total}: {money(document.amount)}</Typography></Stack>
    </Stack></DialogContent>}
    <DialogActions><Button onClick={onClose}>{labels.close}</Button></DialogActions>
  </Dialog>;
}
