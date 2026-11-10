import React from 'react';
import {Alert,Box,MenuItem,Stack,TextField,Typography,Table,TableBody,TableCell,TableHead,TableRow,TableContainer} from '@mui/material';
import DecimalAmountField from './DecimalAmountField';
import DeleteActionButton from './DeleteActionButton';
import AddActionButton from './AddActionButton';
import {expensePaymentText} from '../constants/expensePaymentSchedule';
import {formatCurrency} from '../utils/currencyFormat';

export function ExpensePaymentScheduleView({rows=[],languageCode}){
 const t=expensePaymentText[languageCode]||expensePaymentText.en;
 if(!rows.length)return null;
 const actual=rows.some(row=>row.paid!==undefined);
 return <Stack spacing={1}><Typography fontWeight={700}>{t.title}</Typography><TableContainer><Table size="small"><TableHead><TableRow>{[t.label,t.date,t.currency,t.amount,...(actual?[t.paid,t.remaining]:[])].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell>{row.label}</TableCell><TableCell>{row.scheduledDate}</TableCell><TableCell>{row.currency}</TableCell>{[row.amount,...(actual?[row.paid,row.remaining]:[])].map((value,index)=><TableCell key={index} align="right">{formatCurrency(value,{currencyCode:row.currency,languageCode})}{actual&&index===1&&(row.payments||[]).map(payment=><Typography key={payment.entryId} variant="caption" display="block">{payment.date}: {formatCurrency(payment.amount,{currencyCode:row.currency,languageCode})}</Typography>)}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer><Typography variant="caption" color="text.secondary">{t.planned}</Typography></Stack>;
}

const installment=(label,currency,date)=>({id:crypto.randomUUID(),label,scheduledDate:date,currency,amount:''});
export function ExpensePaymentMode({rows=[],onChange,languageCode,disabled,currencies=['VND'],defaultDate='',hideLabel=false}){
 const t=expensePaymentText[languageCode]||expensePaymentText.en;
 return <TextField data-testid="expense-payment-mode" fullWidth select size="small" label={hideLabel?undefined:t.mode} inputProps={{'aria-label':t.mode}} value={rows.length?'SPLIT':'SINGLE'} disabled={disabled} onChange={event=>onChange(event.target.value==='SINGLE'?[]:[installment(t.advance,currencies[0]||'VND',defaultDate),installment(t.balance,currencies[0]||'VND',defaultDate)])}><MenuItem value="SINGLE">{t.single}</MenuItem><MenuItem value="SPLIT">{t.split}</MenuItem></TextField>;
}

export default function ExpensePaymentSchedule({rows=[],onChange,languageCode,disabled,currencies=['VND'],defaultDate='',showMode=true}){
 const t=expensePaymentText[languageCode]||expensePaymentText.en;
 if(disabled&&rows.some(row=>row.paid!==undefined))return <ExpensePaymentScheduleView rows={rows} languageCode={languageCode}/>;
 const newRow=label=>installment(label,currencies[0]||'VND',defaultDate);
 const change=(id,patch)=>onChange(rows.map(row=>row.id===id?{...row,...patch}:row));
 return <Stack spacing={2} data-testid="expense-payment-schedule">
  {showMode&&<ExpensePaymentMode rows={rows} onChange={onChange} languageCode={languageCode} disabled={disabled} currencies={currencies} defaultDate={defaultDate}/>}
  {rows.length>0&&<><Typography fontWeight={700}>{t.title}</Typography>{rows.map((row,index)=><Box key={row.id} sx={{display:'flex',gap:1,flexWrap:'wrap',alignItems:'center'}}>
   <TextField size="small" label={t.label} value={row.label} disabled={disabled} inputProps={{maxLength:100}} sx={{width:180}} onChange={event=>change(row.id,{label:event.target.value})}/>
   <TextField size="small" type="date" label={t.date} value={row.scheduledDate} disabled={disabled} slotProps={{inputLabel:{shrink:true}}} onChange={event=>change(row.id,{scheduledDate:event.target.value})}/>
   <TextField select size="small" label={t.currency} value={row.currency} disabled={disabled} sx={{width:100}} onChange={event=>change(row.id,{currency:event.target.value,amount:''})}>{[...new Set([...currencies,row.currency])].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}</TextField>
   <DecimalAmountField size="small" label={t.amount} currencyCode={row.currency} value={row.amount} disabled={disabled} onValueChange={amount=>change(row.id,{amount})}/>
   <AddActionButton aria-label={t.add} disabled={disabled||rows.length>=50} onClick={()=>onChange([...rows.slice(0,index+1),newRow(t.installment),...rows.slice(index+1)])}/>
   <DeleteActionButton aria-label={t.remove} title={t.remove} disabled={disabled||rows.length<=2} onClick={()=>onChange(rows.filter(item=>item.id!==row.id))}/>
  </Box>)}<Alert severity="info">{t.planned}</Alert></>}
 </Stack>;
}
