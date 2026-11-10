import ExpensePaymentSchedule from './ExpensePaymentSchedule';
import ReadOnlyField from './ReadOnlyField';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
import ExpenseLookupField from './ExpenseLookupField';
import ExpenseReferenceFields from './ExpenseReferenceFields';
import DeleteActionButton from './DeleteActionButton';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, Menu, MenuItem, Stack, TableCell, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Add, DragIndicator } from '@mui/icons-material';
import AccountingCodeField from './AccountingCodeField';
import DecimalAmountField from './DecimalAmountField';
import { serviceName, TRANSACTION_TEXT } from './OutsourcingServiceDialog';
import { requestJSON, buildQueryString } from '../utils/apiClient';
import { expenseLineAmounts, expenseCodeForLine, inputMode,  validExpenseLine } from '../utils/expenseRequest.mjs';
import { formatCurrency } from '../utils/currencyFormat';
import { expenseLineDescription } from '../utils/expenseCodePresentation.mjs';

export default function ExpenseRequestLine({ line, index, codes, orders, units = [], settings, orgId, labels, languageCode, disabled, dragHandleProps, onChange, onRemove, onAdd, onStatus, onAddProcess, canAddProcess, validationAttempt=0 }) {
  const currency = line.currency;
  const [referencesBusy,setReferencesBusy]=useState(false);
  const [added,setAdded]=useState([]),[addAnchor,setAddAnchor]=useState(null);
  const addLabel=languageCode==='ko'?'\uD56D\uBAA9 \uCD94\uAC00':languageCode==='vi'?'Th\u00EAm tr\u01B0\u1EDDng':'Add fields';
  const [options, setOptions] = useState({ orderId: null, styles: [], plans: [] });
  const [optionsLoading, setOptionsLoading] = useState(false), [optionsError, setOptionsError] = useState(false), [reload, setReload] = useState(0);
  const code = expenseCodeForLine(line,codes.find(row => row.id === line.transactionCodeId) || null);
  const evidence=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en;
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const isProcess = line.productionLinked || code?.base?.entryMode === 'PROCESS';
  const multipleProcesses = !isProcess && ['STYLE','PROCESS'].includes(code?.linkTarget) && (code?.linkReferenceVersion>=2 || line.linkTarget==='STYLE' || line.styleProcessIds?.length>0);
  const selectedProcessIds = line.styleProcessIds?.length ? line.styleProcessIds : multipleProcesses && line.styleProcessId ? [line.styleProcessId] : [];
  const mode = key => line.productionLinked ? 'REQUIRED' : inputMode(code, key);
  const present=key=>key==='order'?line.workOrderId||line.linkedOrderIds?.length:key==='style'?line.styleId||line.linkedStyles?.length:key==='process'?line.styleProcessId||line.styleProcessIds?.length:line.details?.[key];
  const visible=key=>mode(key)==='REQUIRED'||Boolean(present(key))||added.includes(key);
  const detailKeys=[...new Set(['reference',...(code?.base?.requiredFields||[]),...['transportDate','origin','destination'].filter(key=>present(key)||added.includes(key))])];
  const optionalKeys=['order','style','process'].filter(key=>mode(key)==='OPTIONAL'&&!visible(key)).concat(['transportDate','origin','destination'].filter(key=>!detailKeys.includes(key)));
  const expanded=Boolean(code);
  useEffect(()=>{setAdded([]);},[line.transactionCodeId]);
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
  const valid = validExpenseLine(line, code, currency) && (!line.productionLinked || currency === 'VND' && Number.isInteger(Number(line.quantity)) && Number(line.quantity) <= 2147483647) && refsValid && !optionsLoading && !optionsError && !referencesBusy;
  useEffect(() => { onStatus(line.key, Boolean(valid)); }, [line.key, valid, onStatus]);
  const change = key => event => onChange(line.key, { [key]: event.target.value });
  const chooseCode = selected => {
    if(selected?.id === line.transactionCodeId)return;
    if (line.productionLinked) {
      onChange(line.key,{transactionCodeId:selected?.id || '',vatRate:selected?.vatEnabled ? String(settings.defaultVatRate) : '0'});
      return;
    }
    onChange(line.key, { transactionCodeId: selected?.id || '', vatRate: selected?.vatEnabled ? String(settings.defaultVatRate) : '0',
      workOrderId: '', styleId: '', linkedOrderIds:[],linkedStyles:[], styleProcessId: '', styleProcessIds: [], assignmentPlanId: '', details: {}, enabled: { order: false, style: false, process: false } });
  };
  const amount = expenseLineAmounts(line, currency);
  const money = value => value == null ? '—' : formatCurrency(value, { currencyCode: currency, languageCode });
  const field = { size: 'small', fullWidth: true, disabled };
  return <>
    <TableRow data-testid="expense-line" sx={{ '& td': { verticalAlign: 'top', px: 1, py: 1.25 } }}>
      <TableCell sx={{ color: 'text.secondary' }}><Stack direction="row" alignItems="center"><IconButton {...dragHandleProps} size="small" disabled={disabled} aria-label={labels.reorder + ' ' + (index + 1)} sx={{ cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}><DragIndicator fontSize="small" /></IconButton>{index + 1}</Stack></TableCell>
      <TableCell><AccountingCodeField hideLabel codes={codes.filter(row=>row.isActive!==false&&row.base?.isActive!==false)} value={line.transactionCodeId} valueObject={code} disabled={disabled} languageCode={languageCode} onSelect={chooseCode}/></TableCell>
      <TableCell><ReadOnlyField hideLabel label={labels.description} value={expenseLineDescription(line,languageCode,codes)}/></TableCell>
      <TableCell><TextField {...field} select label={labels.currency} value={currency} onChange={change('currency')}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></TableCell>
      <TableCell><TextField {...field} required label={labels.quantity} disabled={disabled || line.productionLocked} value={line.quantity} onChange={change('quantity')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell><TextField {...field} select label={labels.unit} value={line.unitId||''} onChange={change('unitId')}><MenuItem value="">—</MenuItem>{[...units,...(line.unit&&!units.some(unit=>unit.id===line.unit.id)?[line.unit]:[])].filter(unit=>unit.isActive||unit.id===line.unitId).map(unit=><MenuItem key={unit.id} value={unit.id}>{serviceName(unit,languageCode)}</MenuItem>)}</TextField></TableCell>
      <TableCell><DecimalAmountField currencyCode={currency} {...field} required label={labels.price} disabled={disabled || line.productionLocked} value={line.unitPrice} onValueChange={unitPrice => onChange(line.key, { unitPrice })} /></TableCell>
      <TableCell><TextField {...field} label={labels.vat} disabled={disabled || !code?.vatEnabled} value={line.vatRate} onChange={change('vatRate')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.subtotal)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.vatAmount)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap', fontWeight: 700 }}>{money(amount?.amount)}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}><Tooltip title={labels.add}><span><IconButton aria-label={labels.add} disabled={disabled} onClick={()=>onAdd?.(line.key)}><Add/></IconButton></span></Tooltip><Button size="small" startIcon={<Add/>} disabled={disabled||!code||!optionalKeys.length} onClick={event=>setAddAnchor(event.currentTarget)}>{addLabel}</Button><Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={()=>setAddAnchor(null)}>{optionalKeys.map(key=><MenuItem key={key} onClick={()=>{setAdded(previous=>[...previous,key,...(key==='process'?['order','style']:key==='style'?['order']:[])]);setAddAnchor(null);}}>{labels[key]||common[key]}</MenuItem>)}</Menu><Tooltip title={labels.remove}><span><DeleteActionButton aria-label={labels.remove} disabled={disabled || index === 0 || Boolean(line.sourceRecordId && !line.itemId)} onClick={() => onRemove(line.key)} /></span></Tooltip></TableCell>
    </TableRow>
    <TableRow><TableCell/><TableCell colSpan={11}><ExpensePaymentSchedule rows={line.paymentSchedule||[]} languageCode={languageCode} disabled={disabled} currencies={[currency]} onChange={paymentSchedule=>onChange(line.key,{paymentSchedule})}/></TableCell></TableRow>
    {(expanded || isProcess && currency !== 'VND') && <TableRow data-testid="expense-line-links"><TableCell sx={{verticalAlign:'top',pt:2,color:'text.secondary',textAlign:'right'}}><span aria-hidden="true">└</span></TableCell><TableCell colSpan={11} sx={{ bgcolor: 'grey.50', px: 1, py: 1.5 }}><Stack spacing={1.5}>
      {isProcess && currency !== 'VND' && <Alert severity="error">{labels.processCurrency}</Alert>}
      {expanded && <>
        {code?.base?.entryMode==='PROCESS' && <Box><Button startIcon={<Add />} disabled={disabled || !canAddProcess} onClick={()=>onAddProcess?.(line.key)}>{labels.addProcess}</Button></Box>}
        <Box sx={{ display: 'flex', flexWrap:'wrap', gap: 2, '& > *':{width:220,maxWidth:'100%'} }}>
        <ExpenseReferenceFields inline languageCode={languageCode} line={line} orders={availableOrders} orgId={orgId} labels={isProcess?{...labels,order:labels.order+' · '+labels.options,style:labels.style+' · '+labels.options}:labels} disabled={disabled} production={isProcess} hiddenOrder={isProcess||!visible('order')} hiddenStyle={isProcess||!visible('style')} onChange={onChange} onLoading={setReferencesBusy}/>
          {isProcess&&visible('order')&&<ExpenseLookupField label={labels.order} required={mode('order')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked} options={availableOrders} value={availableOrders.find(row=>row.dbId===line.workOrderId)||null} getOptionKey={row=>row.dbId} getOptionLabel={row=>row.orderNumber} getCode={row=>row.orderNumber} columns={[{key:'order',label:labels.order,value:row=>row.orderNumber}]} onChange={row=>onChange(line.key,{workOrderId:row?.dbId||'',styleId:'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''})}/>}
          {isProcess&&visible('style')&&<ExpenseLookupField label={labels.style} required={mode('style')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked||!line.workOrderId||optionsLoading} options={options.styles} value={options.styles.find(row=>row.id===line.styleId)||null} getOptionLabel={row=>row.name} columns={[{key:'code',label:'',value:row=>row.code},{key:'name',label:labels.style,value:row=>row.name}]} onChange={row=>onChange(line.key,{styleId:row?.id||'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''})}/>}
          {visible('process')&&<ExpenseLookupField label={labels.process} required={mode('process')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked||!selectedStyle||optionsLoading} multiple={multipleProcesses} options={selectedStyle?.styleProcesses||[]} value={multipleProcesses?(selectedStyle?.styleProcesses||[]).filter(row=>selectedProcessIds.includes(row.id)):(selectedStyle?.styleProcesses||[]).find(row=>row.id===line.styleProcessId)||null} getOptionLabel={row=>row.processName} getCode={row=>row.processCode} columns={[{key:'code',label:'',value:row=>row.processCode},{key:'name',label:labels.process,value:row=>row.processName}]} onChange={row=>{const value=multipleProcesses?row.map(item=>item.id):row?.id||'';onChange(line.key,multipleProcesses?{styleProcessIds:value,styleProcessId:code.linkTarget==='PROCESS'?(value[0]||''):'',assignmentPlanId:''}:{styleProcessId:value,styleProcessIds:[],assignmentPlanId:''});}}/>}
          {isProcess&&plans.length>1&&<ExpenseLookupField label={labels.assignment} required languageCode={languageCode} disabled={disabled} options={plans} value={plans.find(row=>row.id===line.assignmentPlanId)||null} getOptionLabel={row=>row.factoryName+' #'+row.id} columns={[{key:'name',label:labels.assignment,value:row=>row.factoryName+' #'+row.id}]} onChange={row=>onChange(line.key,{assignmentPlanId:row?.id||''})}/>}
          {detailKeys.map(key => <TextField {...field} key={key} required={key==='reference'||code?.base?.requiredFields?.includes(key)} error={validationAttempt>0&&(key==='reference'||code?.base?.requiredFields?.includes(key))&&!line.details[key]?.trim()} type={key === 'transportDate' ? 'date' : 'text'} label={key==='reference'&&!isProcess?evidence.supplierReference:common[key]} value={line.details[key] || ''} slotProps={key === 'transportDate' ? { inputLabel: { shrink: true } } : {}} onChange={event => onChange(line.key, { details: { ...line.details, [key]: event.target.value } })} />)}
          {!isProcess&&<TextField {...field} required label={evidence.reference} value={line.details.evidenceFile||''} error={validationAttempt>0&&!line.details.evidenceFile?.trim()} inputProps={{maxLength:500}} onChange={event=>onChange(line.key,{details:{...line.details,evidenceFile:event.target.value}})}/>}
        </Box>
        {optionsError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)} disabled={disabled}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
        {isProcess && line.styleProcessId && !optionsLoading && !plans.length && <Alert severity="warning">{labels.noPlan}</Alert>}
        {isProcess && <Typography variant="caption" color="text.secondary">{labels.processInfo}</Typography>}
      </>}
    </Stack></TableCell></TableRow>}
  </>;
}
