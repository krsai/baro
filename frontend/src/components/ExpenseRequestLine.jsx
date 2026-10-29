import DeleteActionButton from './DeleteActionButton';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TableCell, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Add, DragIndicator, ExpandLess, ExpandMore } from '@mui/icons-material';
import ExpenseLookupField from './ExpenseLookupField';
import DecimalAmountField from './DecimalAmountField';
import { EXPENSE_LOOKUP_TEXT } from '../constants/expenseLookup';
import { serviceName, TRANSACTION_TEXT } from './OutsourcingServiceDialog';
import { EXPENSE_TEXT } from '../constants/expenseTypes';
import { requestJSON, buildQueryString } from '../utils/apiClient';
import { expenseLineAmounts, expenseCodeForLine, inputMode, visibleInput, validExpenseLine } from '../utils/expenseRequest.mjs';
import { formatCurrency } from '../utils/currencyFormat';
import { expenseIndustryMismatch, expenseLineDescription } from '../utils/expenseCodePresentation.mjs';

export default function ExpenseRequestLine({ line, index, codes, orders, partner, settings, orgId, labels, languageCode, disabled, dragHandleProps, onChange, onRemove, onStatus, onAddProcess, canAddProcess, validationAttempt=0 }) {
  const currency = line.currency;
  const [expanded, setExpanded] = useState(Boolean(line.expandLinks));
  const [options, setOptions] = useState({ orderId: null, styles: [], plans: [] });
  const [optionsLoading, setOptionsLoading] = useState(false), [optionsError, setOptionsError] = useState(false), [reload, setReload] = useState(0);
  const code = expenseCodeForLine(line,codes.find(row => row.id === line.transactionCodeId) || null);
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const expenseLabels = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko;
  const lookupText = EXPENSE_LOOKUP_TEXT[languageCode] || EXPENSE_LOOKUP_TEXT.ko;
  const isProcess = line.productionLinked || code?.base?.entryMode === 'PROCESS';
  const multipleProcesses = !isProcess && ['STYLE','PROCESS'].includes(code?.linkTarget) && (code?.linkReferenceVersion>=2 || line.linkTarget==='STYLE' || line.styleProcessIds?.length>0);
  const selectedProcessIds = line.styleProcessIds?.length ? line.styleProcessIds : multipleProcesses && line.styleProcessId ? [line.styleProcessId] : [];
  const mode = key => line.productionLinked ? 'REQUIRED' : inputMode(code, key), visible = key => line.productionLinked || visibleInput(line, code, key);
  const needsExpansion = isProcess || Boolean(code?.base?.requiredFields?.length) || ['order','style','process'].some(key=>mode(key)==='REQUIRED');
  useEffect(()=>{if(needsExpansion)setExpanded(true);},[line.transactionCodeId,needsExpansion,validationAttempt]);
  const availableOrders = line.preservedReferences?.order && !orders.some(row=>row.dbId===line.workOrderId) ? [...orders,{...line.preservedReferences.order,dbId:line.workOrderId}] : orders;
  useEffect(()=>{
    if(line.itemId||line.productionLinked)return;
    if(mode('style')==='HIDDEN'&&(line.styleId||line.styleProcessId||line.styleProcessIds?.length))onChange(line.key,{styleId:'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''});
    else if(mode('process')==='HIDDEN'&&(line.styleProcessId||line.styleProcessIds?.length||line.assignmentPlanId))onChange(line.key,{styleProcessId:'',styleProcessIds:[],assignmentPlanId:''});
  },[code?.linkTarget,code?.base?.processInput,code?.base?.styleInput,line.itemId,line.productionLinked,line.styleId,line.styleProcessId,line.styleProcessIds?.length,line.assignmentPlanId,line.key,onChange]);
  const selectedStyle = options.orderId === line.workOrderId ? options.styles.find(row => row.id === line.styleId) : null;
  const plans = useMemo(() => options.orderId === line.workOrderId ? options.plans.filter(plan => plan.styleId === line.styleId && plan.processIds?.includes(line.styleProcessId)) : [], [options, line.workOrderId, line.styleId, line.styleProcessId]);
  useEffect(() => {
    let alive = true;
    setOptions({ orderId: null, styles: [], plans: [] }); setOptionsError(false);
    if (line.productionLinked && line.preservedReferences) {
      setOptions({orderId:line.workOrderId,styles:[line.preservedReferences.style],plans:[line.preservedReferences.plan]});setOptionsLoading(false);
      return () => {alive=false;};
    }
    if (!line.workOrderId || mode('style')==='HIDDEN') { setOptionsLoading(false); return () => { alive = false; }; }
    setOptionsLoading(true);
    requestJSON(`/transaction-request-options${buildQueryString({ orgId, workOrderId: line.workOrderId })}`, { skipCache: true })
      .then(data => { if (alive) {
        const preserved=line.preservedReferences?.order?.id===line.workOrderId && line.preservedReferences?.style;
        const styles=preserved ? data.styles.map(style=>style.id!==preserved.id?style:{...style,styleProcesses:[...(style.styleProcesses||[]),...(preserved.styleProcesses||[]).filter(process=>!style.styleProcesses?.some(row=>row.id===process.id))]}) : data.styles;
        if(preserved&&!styles.some(style=>style.id===preserved.id))styles.push(preserved);
        setOptions({ ...data,styles,orderId: line.workOrderId });
      } })
      .catch(() => { if (alive) setOptionsError(true); }).finally(() => { if (alive) setOptionsLoading(false); });
    return () => { alive = false; };
  }, [line.workOrderId, orgId, reload,line.productionLinked,line.preservedReferences,code?.base?.styleInput]);
  useEffect(() => {
    if (line.productionLinked || !isProcess || !line.styleProcessId || optionsLoading || options.orderId !== line.workOrderId) return;
    const id = plans.length === 1 ? plans[0].id : plans.some(plan => plan.id === line.assignmentPlanId) ? line.assignmentPlanId : '';
    if (id !== line.assignmentPlanId) onChange(line.key, { assignmentPlanId: id });
  }, [plans, isProcess, line.key, line.styleProcessId, line.assignmentPlanId, line.workOrderId, optionsLoading, options.orderId, onChange]);
  const refsValid = (!line.workOrderId || availableOrders.some(row => row.dbId === line.workOrderId)) &&
    (!line.styleId || Boolean(selectedStyle)) && (!line.styleProcessId || selectedStyle?.styleProcesses?.some(row => row.id === line.styleProcessId)) && selectedProcessIds.every(id => selectedStyle?.styleProcesses?.some(row => row.id === id)) &&
    (!isProcess || plans.some(plan => plan.id === line.assignmentPlanId));
  const valid = validExpenseLine(line, code, currency) && (!line.productionLinked || currency === 'VND' && Number.isInteger(Number(line.quantity)) && Number(line.quantity) <= 2147483647) && refsValid && !optionsLoading && !optionsError;
  useEffect(() => { onStatus(line.key, Boolean(valid)); }, [line.key, valid, onStatus]);
  const change = key => event => onChange(line.key, { [key]: event.target.value });
  const chooseCode = selected => {
    if(selected?.id === line.transactionCodeId)return;
    if (line.productionLinked) {
      onChange(line.key,{transactionCodeId:selected?.id || '',vatRate:selected?.vatEnabled ? String(settings.defaultVatRate) : '0'});
      setExpanded(true);return;
    }
    onChange(line.key, { transactionCodeId: selected?.id || '', vatRate: selected?.vatEnabled ? String(settings.defaultVatRate) : '0',
      workOrderId: '', styleId: '', styleProcessId: '', styleProcessIds: [], assignmentPlanId: '', details: {}, enabled: { order: false, style: false, process: false } });
    if (selected?.base?.entryMode === 'PROCESS' || selected?.base?.requiredFields?.length || ['order','style','process'].some(key => inputMode(selected,key) === 'REQUIRED')) setExpanded(true);
  };
  const amount = expenseLineAmounts(line, currency);
  const money = value => value == null ? '—' : formatCurrency(value, { currencyCode: currency, languageCode });
  const industryMismatch = expenseIndustryMismatch(code,partner);
  const toggle = key => event => {
    const checked = event.target.checked;
    onChange(line.key, { enabled: { ...line.enabled, [key]: checked, ...(key === 'order' && !checked ? { style: false, process: false } : key === 'style' && !checked ? { process: false } : {}) },
      ...(key === 'order' ? { workOrderId: '', styleId: '', styleProcessId: '', styleProcessIds: [], assignmentPlanId: '' } : key === 'style' ? { styleId: '', styleProcessId: '', styleProcessIds: [], assignmentPlanId: '' } : { styleProcessId: '', styleProcessIds: [], assignmentPlanId: '' }) });
    setExpanded(true);
  };
  const field = { size: 'small', fullWidth: true, disabled };
  return <>
    <TableRow data-testid="expense-line" sx={{ '& td': { verticalAlign: 'top', px: 1, py: 1.25 } }}>
      <TableCell sx={{ color: 'text.secondary' }}><Stack direction="row" alignItems="center"><IconButton {...dragHandleProps} size="small" disabled={disabled} aria-label={labels.reorder + ' ' + (index + 1)} sx={{ cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}><DragIndicator fontSize="small" /></IconButton>{index + 1}</Stack></TableCell>
      <TableCell><ExpenseLookupField directCode required label={labels.code} options={codes.filter(row=>row.isActive!==false&&row.base?.isActive!==false)} value={code} disabled={disabled} languageCode={languageCode} onChange={chooseCode} columns={[
        {key:'code',label:common.code,value:row=>row.code},
        {key:'name',label:labels.description,value:row=>serviceName(row,languageCode)},
        {key:'type',label:expenseLabels.type,value:row=>serviceName(row.base?.expenseType,languageCode)},
        {key:'tax',label:lookupText.tax,value:row=>serviceName(row.taxTreatment,languageCode)||(row.vatEnabled?'VAT':lookupText.noVat)},
      ]} />
      </TableCell>
      <TableCell><TextField {...field} required label={labels.description} value={expenseLineDescription(line,languageCode,codes)} InputProps={{readOnly:true}} /></TableCell>
      <TableCell><TextField {...field} select label={labels.currency} value={currency} onChange={change('currency')}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></TableCell>
      <TableCell><TextField {...field} required label={labels.quantity} disabled={disabled || line.productionLocked} value={line.quantity} onChange={change('quantity')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell><DecimalAmountField {...field} required label={labels.price} disabled={disabled || line.productionLocked} value={line.unitPrice} onValueChange={unitPrice => onChange(line.key, { unitPrice })} /></TableCell>
      <TableCell><TextField {...field} label={labels.vat} disabled={disabled || !code?.vatEnabled} value={line.vatRate} onChange={change('vatRate')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.subtotal)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.vatAmount)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap', fontWeight: 700 }}>{money(amount?.amount)}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}><Tooltip title={expanded ? labels.hide : labels.detail}><IconButton aria-label={expanded ? labels.hide : labels.detail} onClick={() => setExpanded(value => !value)}>{expanded ? <ExpandLess /> : <ExpandMore />}</IconButton></Tooltip><Tooltip title={labels.remove}><span><DeleteActionButton aria-label={labels.remove} disabled={disabled || index === 0 || Boolean(line.sourceRecordId && !line.itemId)} onClick={() => onRemove(line.key)} /></span></Tooltip></TableCell>
    </TableRow>
    {(expanded || industryMismatch || isProcess && currency !== 'VND') && <TableRow><TableCell colSpan={11} sx={{ bgcolor: 'grey.50', px: 3, py: 1.5 }}><Stack spacing={1.5}>
      {industryMismatch && <Alert severity="warning">{expenseLabels.subMismatch}</Alert>}
      {isProcess && currency !== 'VND' && <Alert severity="error">{labels.processCurrency}</Alert>}
      {expanded && <><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="subtitle2">{labels.row} {index + 1} · {labels.options}</Typography>
        {code?.base?.entryMode==='PROCESS' && <Button startIcon={<Add />} disabled={disabled || !canAddProcess} onClick={()=>onAddProcess?.(line.key)}>{labels.addProcess}</Button>}
      </Stack>
        <Stack direction="row" flexWrap="wrap">{['order','style','process'].filter(key => mode(key) === 'OPTIONAL').map(key => <FormControlLabel key={key} label={labels[key]} control={<Checkbox checked={line.enabled[key]} disabled={disabled || key === 'style' && !visible('order') || key === 'process' && !visible('style')} onChange={toggle(key)} />} />)}</Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          {visible('order') && <TextField {...field} required={mode('order') === 'REQUIRED'} disabled={disabled || line.productionLinked} select label={labels.order} value={line.workOrderId} onChange={event => onChange(line.key, { workOrderId: event.target.value, styleId: '', styleProcessId: '', styleProcessIds: [], assignmentPlanId: '' })}><MenuItem value="">{common.none}</MenuItem>{availableOrders.map(row => <MenuItem key={row.dbId} value={row.dbId}>{row.orderNumber}</MenuItem>)}</TextField>}
          {visible('style') && <TextField {...field} required={mode('style') === 'REQUIRED'} disabled={disabled || line.productionLinked || !line.workOrderId || optionsLoading} select label={labels.style} value={line.styleId} onChange={event => onChange(line.key, { styleId: event.target.value, styleProcessId: '', styleProcessIds: [], assignmentPlanId: '' })}><MenuItem value="">{common.none}</MenuItem>{options.styles.map(row => <MenuItem key={row.id} value={row.id}>{row.name} ({row.code})</MenuItem>)}</TextField>}
          {visible('process') && <TextField {...field} required={mode('process') === 'REQUIRED'} disabled={disabled || line.productionLinked || !selectedStyle || optionsLoading} select label={labels.process}
            SelectProps={multipleProcesses ? {multiple:true,renderValue:ids=>ids.map(id=>{const process=selectedStyle?.styleProcesses?.find(row=>row.id===id);return process?.processName||String(id);}).join(', ')} : undefined}
            value={multipleProcesses ? selectedProcessIds : line.styleProcessId} onChange={event => {const value=multipleProcesses&&typeof event.target.value==='string'?event.target.value.split(',').map(Number):event.target.value;onChange(line.key,multipleProcesses?{styleProcessIds:value,styleProcessId:code.linkTarget==='PROCESS'?(value[0]||''):'',assignmentPlanId:''}:{styleProcessId:value,styleProcessIds:[],assignmentPlanId:''});}}>
            {!multipleProcesses&&<MenuItem value="">{common.none}</MenuItem>}{(selectedStyle?.styleProcesses || []).map(row => <MenuItem key={row.id} value={row.id}>{multipleProcesses&&<Checkbox checked={selectedProcessIds.includes(row.id)}/>} {row.processName} ({row.processCode})</MenuItem>)}
          </TextField>}
          {isProcess && plans.length > 1 && <TextField {...field} select required label={labels.assignment} value={line.assignmentPlanId} onChange={change('assignmentPlanId')}><MenuItem value="">{common.none}</MenuItem>{plans.map(row => <MenuItem key={row.id} value={row.id}>{row.factoryName} · #{row.id}</MenuItem>)}</TextField>}
          {(code?.base?.requiredFields || []).map(key => <TextField {...field} key={key} required error={validationAttempt>0&&!line.details[key]?.trim()} type={key === 'transportDate' ? 'date' : 'text'} label={common[key]} value={line.details[key] || ''} slotProps={key === 'transportDate' ? { inputLabel: { shrink: true } } : {}} onChange={event => onChange(line.key, { details: { ...line.details, [key]: event.target.value } })} />)}
        </Box>
        {optionsError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)} disabled={disabled}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
        {isProcess && line.styleProcessId && !optionsLoading && !plans.length && <Alert severity="warning">{labels.noPlan}</Alert>}
        {isProcess && <Typography variant="caption" color="text.secondary">{labels.processInfo}</Typography>}
      </>}
    </Stack></TableCell></TableRow>}
  </>;
}
