import MaterialSelectionDialog from './MaterialSelectionDialog';
import {useAppActions} from '../context/AppContext';
import {changeApprovalText} from '../constants/changeApprovals';
import {materialLineSelection} from '../utils/materialLineSelection.mjs';
import MaterialItemPicker from './MaterialItemPicker';
import {evidenceReference} from '../utils/evidenceReference.mjs';
import CodeItemAttributeFields from './CodeItemAttributeFields';
import {accountingCompactText} from '../constants/accountingCompact';
import {expensePaymentText} from '../constants/expensePaymentSchedule';
import {Dialog,DialogTitle,DialogContent,DialogActions} from '@mui/material';
import ExpensePaymentSchedule,{ExpensePaymentMode} from './ExpensePaymentSchedule';
import AddActionButton from './AddActionButton';
import ReadOnlyField from './ReadOnlyField';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
import ExpenseLookupField from './ExpenseLookupField';
import ExpenseReferenceFields from './ExpenseReferenceFields';
import DeleteActionButton from './DeleteActionButton';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Box,Button,IconButton,Menu,MenuItem,Stack,TableCell,TableRow,TextField,Typography} from '@mui/material';
import Alert from "./AppNotice";
import { MoreHoriz, DragIndicator } from '@mui/icons-material';
import AccountingCodeField from './AccountingCodeField';
import DecimalAmountField from './DecimalAmountField';
import { serviceName, TRANSACTION_TEXT } from './OutsourcingServiceDialog';
import { requestJSON, buildQueryString } from '../utils/apiClient';
import { expenseLineAmounts, expenseCodeForLine, inputMode,  validExpenseLine } from '../utils/expenseRequest.mjs';
import { formatCurrency } from '../utils/currencyFormat';
import { expenseLineDescription } from '../utils/expenseCodePresentation.mjs';

export default function ExpenseRequestLine({ line, index, codes, orders, units = [], settings, orgId, labels, languageCode, disabled, dragHandleProps, onChange, onRemove, onAdd, onStatus, onAddProcess, canAddProcess, validationAttempt=0,paidCorrectionOnly=false }) {
  const currency = line.currency;const compact=accountingCompactText[languageCode]||accountingCompactText.en,payment=expensePaymentText[languageCode]||expensePaymentText.en;const [detailsOpen,setDetailsOpen]=useState(false),[paymentOpen,setPaymentOpen]=useState(false);
  const materialRef=useRef(null),selectionBusy=useRef(false),scope=useRef(orgId);scope.current=orgId;
  const [selectingMaterial,setSelectingMaterial]=useState(false),[codeSelectionRevision,setCodeSelectionRevision]=useState(0);
  const {showNotification}=useAppActions();
  const [referencesBusy,setReferencesBusy]=useState(false),[attributesBusy,setAttributesBusy]=useState(false),[materialsBusy,setMaterialsBusy]=useState(false);
  const [added,setAdded]=useState([]),[addAnchor,setAddAnchor]=useState(null);
  const addLabel=languageCode==='ko'?'\uD56D\uBAA9 \uCD94\uAC00':languageCode==='vi'?'Th\u00EAm tr\u01B0\u1EDDng':'Add fields';
  const [options, setOptions] = useState({ orderId: null, styles: [], plans: [] });
  const [optionsLoading, setOptionsLoading] = useState(false), [optionsError, setOptionsError] = useState(false), [reload, setReload] = useState(0);
  const configuredCode=codes.find(row => row.id === line.transactionCodeId) || null;
  const code = expenseCodeForLine(line,configuredCode);
  const referenceDisabled=key=>!line.productionLinked&&inputMode(configuredCode,key)==='HIDDEN';
  const evidence=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en;
  const common = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const isProcess = line.productionLinked || code?.base?.entryMode === 'PROCESS';
  const multipleProcesses = !isProcess && ['STYLE','PROCESS'].includes(code?.linkTarget) && (code?.linkReferenceVersion>=2 || line.linkTarget==='STYLE' || line.styleProcessIds?.length>0);
  const selectedProcessIds = line.styleProcessIds?.length ? line.styleProcessIds : multipleProcesses && line.styleProcessId ? [line.styleProcessId] : [];
  const mode = key => line.productionLinked ? 'REQUIRED' : inputMode(code, key);
  const present=key=>key==='order'?line.workOrderId||line.linkedOrderIds?.length:key==='style'?line.styleId||line.linkedStyles?.length:key==='process'?line.styleProcessId||line.styleProcessIds?.length:line.details?.[key];
  const visible=key=>mode(key)==='REQUIRED'||Boolean(present(key))||added.includes(key);
  const materialEnabled=code?.base?.materialSettings?.enabled===true;
  const requiredDetails=[...(code?.base?.requiredFields||[]),...(!materialEnabled&&code?.base?.requiredFields?.includes('length')?['height']:[])].filter(key=>key!=='height'||!line.itemId||Boolean(line.originalDetails?.height)||['length','width','height'].some(field=>(line.details?.[field]||'')!==(line.originalDetails?.[field]||'')));
  const detailKeys=[...new Set([...(code?.base?.requiredFields||[]).filter(key=>key!=='reference'),...['transportDate','origin','destination','length','width','height'].filter(key=>present(key)||added.includes(key)||key==='height'&&code?.base?.requiredFields?.includes('length'))])].filter(key=>!materialEnabled||!line.materialItemId||!['length','width','height'].includes(key));
  const optionalKeys=['order','style','process'].filter(key=>mode(key)==='OPTIONAL'&&!visible(key));
  const expanded=Boolean(code);
  useEffect(()=>{setAdded([]);},[line.transactionCodeId]);
  const availableOrders = line.preservedReferences?.order && !orders.some(row=>row.dbId===line.workOrderId) ? [...orders,{...line.preservedReferences.order,dbId:line.workOrderId}] : orders;
  useEffect(()=>{
    if(!code||line.itemId||line.productionLinked)return;
    if(mode('order')==='HIDDEN'&&(line.workOrderId||line.linkedOrderIds?.length))onChange(line.key,{workOrderId:'',linkedOrderIds:[],linkedStyles:[],styleId:'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''});
    else if(mode('style')==='HIDDEN'&&(line.styleId||line.linkedStyles?.length||line.styleProcessId||line.styleProcessIds?.length))onChange(line.key,{styleId:'',linkedStyles:[],styleProcessId:'',styleProcessIds:[],assignmentPlanId:''});
    else if(mode('process')==='HIDDEN'&&(line.styleProcessId||line.styleProcessIds?.length||line.assignmentPlanId))onChange(line.key,{styleProcessId:'',styleProcessIds:[],assignmentPlanId:''});
  },[code?.linkTarget,code?.base?.orderInput,code?.base?.processInput,code?.base?.styleInput,line.itemId,line.productionLinked,line.workOrderId,line.linkedOrderIds?.length,line.linkedStyles?.length,line.styleId,line.styleProcessId,line.styleProcessIds?.length,line.assignmentPlanId,line.key,onChange]);
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
  const valid = validExpenseLine(line, code, currency) && (!line.productionLinked || currency === 'VND' && Number.isInteger(Number(line.quantity)) && Number(line.quantity) <= 2147483647) && refsValid && !optionsLoading && !optionsError && !referencesBusy && !attributesBusy&&!materialsBusy;
  useEffect(() => { onStatus(line.key, Boolean(valid)&&!selectingMaterial); }, [line.key, valid, selectingMaterial, onStatus]);
  const change = key => event => onChange(line.key, { [key]: event.target.value });
  const chooseCode = async selected => {
    if(selectionBusy.current||disabled)return;
    const sameCode=selected?.id===line.transactionCodeId;
    if(line.productionLinked){if(!sameCode)onChange(line.key,{transactionCodeId:selected?.id||'',vatRate:selected?.vatEnabled?String(settings.defaultVatRate):'0'});return;}
    if(selected?.base?.materialSettings?.enabled){
      selectionBusy.current=true;setSelectingMaterial(true);const company=orgId;
      let material;
      try{material=await materialRef.current.prepare({baseId:selected.baseId,value:line.materialItemId,snapshot:line.materialItemSnapshot});}
      finally{selectionBusy.current=false;if(scope.current===company){setSelectingMaterial(false);setCodeSelectionRevision(n=>n+1);}}
      if(!material||scope.current!==company)return;
      if(paidCorrectionOnly&&line.unitId&&line.unitId!==material.unitId){showNotification((changeApprovalText[languageCode]||changeApprovalText.en).PAID_MATERIAL_UNIT_MISMATCH,'error');return;}
      const reset=!sameCode&&!paidCorrectionOnly?{workOrderId:'',styleId:'',linkedOrderIds:[],linkedStyles:[],styleProcessId:'',styleProcessIds:[],assignmentPlanId:'',details:{},enabled:{order:false,style:false,process:false}}:{};
      onChange(line.key,{...reset,transactionCodeId:selected.id,...(!sameCode&&!paidCorrectionOnly?{vatRate:selected.vatEnabled?String(settings.defaultVatRate):'0'}:{}),...materialLineSelection({...line,...reset},material)});setDetailsOpen(true);return;
    }
    if(sameCode)return;
    if(paidCorrectionOnly){onChange(line.key,{transactionCodeId:selected?.id||''});return;}
    onChange(line.key,{transactionCodeId:selected?.id||'',vatRate:selected?.vatEnabled?String(settings.defaultVatRate):'0',materialItemId:null,materialItemSnapshot:null,workOrderId:'',styleId:'',linkedOrderIds:[],linkedStyles:[],styleProcessId:'',styleProcessIds:[],assignmentPlanId:'',itemCustomerId:null,itemTypeId:null,itemAttributeSnapshot:null,details:{},enabled:{order:false,style:false,process:false}});
  };
  const amount = expenseLineAmounts(line, currency);
  const money = value => value == null ? '—' : formatCurrency(value, { currencyCode: currency, languageCode });
  const financialDisabled=disabled||paidCorrectionOnly;
  const field = { size: 'small', fullWidth: true, disabled };
  return <><MaterialSelectionDialog ref={materialRef} orgId={orgId} languageCode={languageCode}/>
    <TableRow data-testid="expense-line" sx={{ '& td': { verticalAlign: 'top', px: .75, py: 1.25 } }}>
      <TableCell sx={{ color: 'text.secondary' }}><Stack direction="row" alignItems="center"><IconButton {...dragHandleProps} size="small" disabled={disabled} aria-label={labels.reorder + ' ' + (index + 1)} sx={{ cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}><DragIndicator fontSize="small" /></IconButton>{index + 1}</Stack></TableCell>
      <TableCell><AccountingCodeField resetKey={codeSelectionRevision} hideLabel codes={codes.filter(row=>row.isActive!==false&&row.base?.isActive!==false)} value={line.transactionCodeId} valueObject={code} disabled={disabled||selectingMaterial} requireMaterialSelection={materialEnabled&&!line.materialItemSnapshot?.variantId} languageCode={languageCode} onSelect={chooseCode}/></TableCell>
      <TableCell><ReadOnlyField hideLabel multiline label={labels.description} value={expenseLineDescription(line,languageCode,codes)}/></TableCell>
      <TableCell><TextField {...field} select disabled={financialDisabled} label={labels.currency} value={currency} onChange={change('currency')}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></TableCell>
      <TableCell><TextField {...field} required label={labels.quantity} disabled={financialDisabled || line.productionLocked} value={line.quantity} onChange={change('quantity')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell><TextField {...field} select disabled={financialDisabled||Boolean(line.materialItemId)} title={serviceName(units.find(row=>row.id===line.unitId)||line.unit||{},languageCode)} label={labels.unit} value={line.unitId||''} onChange={change('unitId')}><MenuItem value="">—</MenuItem>{[...units,...(line.unit&&!units.some(unit=>unit.id===line.unit.id)?[line.unit]:[])].filter(unit=>unit.isActive||unit.id===line.unitId).map(unit=><MenuItem key={unit.id} value={unit.id}>{serviceName(unit,languageCode)}</MenuItem>)}</TextField></TableCell>
      <TableCell><DecimalAmountField currencyCode={currency} {...field} required label={labels.price} disabled={financialDisabled || line.productionLocked} value={line.unitPrice} onValueChange={unitPrice => onChange(line.key, { unitPrice })} /></TableCell>
      <TableCell><TextField {...field} label={labels.vat} disabled={financialDisabled || !code?.vatEnabled} value={line.vatRate} onChange={change('vatRate')} inputProps={{ inputMode: 'decimal' }} /></TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.subtotal)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap' }}>{money(amount?.vatAmount)}</TableCell>
      <TableCell align="right" sx={{ pt: '20px !important', whiteSpace: 'nowrap', fontWeight: 700 }}>{money(amount?.amount)}</TableCell>
      <TableCell><Button fullWidth size="small" variant="outlined" title={line.paymentSchedule?.length?payment.split:payment.single} disabled={financialDisabled} onClick={()=>setPaymentOpen(true)}>{line.paymentSchedule?.length?payment.split:payment.single}</Button></TableCell>
      <TableCell><Button fullWidth size="small" variant="outlined" color={validationAttempt&&!valid?'error':'primary'} disabled={!code} onClick={()=>setDetailsOpen(true)} title={[line.details?.reference,evidenceReference(line.details?.evidenceFile)].filter(Boolean).join(' / ')}>{line.details?.reference||line.productionLinked?compact.link:compact.evidence}</Button></TableCell>
      <TableCell data-table-actions sx={{whiteSpace:'nowrap'}}><Stack direction="row" alignItems="center"><AddActionButton aria-label={labels.add} disabled={financialDisabled} onClick={()=>onAdd?.(line.key)}/><DeleteActionButton aria-label={labels.remove} title={labels.remove} disabled={financialDisabled||index===0||Boolean(line.sourceRecordId&&!line.itemId)} onClick={()=>onRemove(line.key)}/>{code&&optionalKeys.length>0&&<IconButton size="small" aria-label={addLabel} title={addLabel} disabled={financialDisabled} onClick={event=>setAddAnchor(event.currentTarget)}><MoreHoriz fontSize="small"/></IconButton>}</Stack><Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={()=>setAddAnchor(null)}>{optionalKeys.map(key=><MenuItem key={key} onClick={()=>{setDetailsOpen(true);setAdded(previous=>[...previous,key,...(key==='process'?['order','style']:key==='style'?['order']:[])]);setAddAnchor(null);}}>{labels[key]||common[key]}</MenuItem>)}</Menu></TableCell>
    </TableRow>
    <Dialog open={paymentOpen} onClose={()=>setPaymentOpen(false)} fullWidth maxWidth="md"><DialogTitle>{payment.mode}</DialogTitle><DialogContent><ExpensePaymentSchedule rows={line.paymentSchedule||[]} languageCode={languageCode} disabled={disabled} currencies={[currency]} onChange={paymentSchedule=>onChange(line.key,{paymentSchedule})}/></DialogContent><DialogActions><Button onClick={()=>setPaymentOpen(false)}>{compact.close}</Button></DialogActions></Dialog>
    <Dialog open={detailsOpen} onClose={()=>setDetailsOpen(false)} fullWidth maxWidth="md"><DialogTitle>{compact.details}</DialogTitle><DialogContent data-testid="expense-line-links"><Stack spacing={1.5}>
      {isProcess && currency !== 'VND' && <Alert severity="error">{labels.processCurrency}</Alert>}
      {expanded && <>
        {code?.base?.entryMode==='PROCESS' && <Box><AddActionButton aria-label={labels.addProcess} disabled={disabled || !canAddProcess} onClick={()=>onAddProcess?.(line.key)}/></Box>}
        <Box sx={{ display: 'flex', flexWrap:'wrap', gap: 2, '& > *':{width:220,maxWidth:'100%'} }}>
        <ExpenseReferenceFields inline languageCode={languageCode} line={line} orders={availableOrders} orgId={orgId} labels={isProcess?{...labels,order:labels.order+' · '+labels.options,style:labels.style+' · '+labels.options}:labels} disabled={disabled} production={isProcess} orderDisabled={referenceDisabled('order')} styleDisabled={referenceDisabled('style')} hiddenOrder={isProcess||!visible('order')} hiddenStyle={isProcess||!visible('style')} onChange={onChange} onLoading={setReferencesBusy}/>
          {isProcess&&visible('order')&&<ExpenseLookupField label={labels.order} required={mode('order')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked} options={availableOrders} value={availableOrders.find(row=>row.dbId===line.workOrderId)||null} getOptionKey={row=>row.dbId} getOptionLabel={row=>row.orderNumber} getCode={row=>row.orderNumber} columns={[{key:'order',label:labels.order,value:row=>row.orderNumber}]} onChange={row=>onChange(line.key,{workOrderId:row?.dbId||'',styleId:'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''})}/>}
          {isProcess&&visible('style')&&<ExpenseLookupField label={labels.style} required={mode('style')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked||!line.workOrderId||optionsLoading} options={options.styles} value={options.styles.find(row=>row.id===line.styleId)||null} getOptionLabel={row=>row.name} columns={[{key:'code',label:'',value:row=>row.code},{key:'name',label:labels.style,value:row=>row.name}]} onChange={row=>onChange(line.key,{styleId:row?.id||'',styleProcessId:'',styleProcessIds:[],assignmentPlanId:''})}/>}
          {visible('process')&&<ExpenseLookupField label={labels.process} required={mode('process')==='REQUIRED'} languageCode={languageCode} disabled={disabled||line.productionLinked||referenceDisabled('process')||!selectedStyle||optionsLoading} multiple={multipleProcesses} options={selectedStyle?.styleProcesses||[]} value={multipleProcesses?(selectedStyle?.styleProcesses||[]).filter(row=>selectedProcessIds.includes(row.id)):(selectedStyle?.styleProcesses||[]).find(row=>row.id===line.styleProcessId)||null} getOptionLabel={row=>row.processName} getCode={row=>row.processCode} columns={[{key:'code',label:'',value:row=>row.processCode},{key:'name',label:labels.process,value:row=>row.processName}]} onChange={row=>{const value=multipleProcesses?row.map(item=>item.id):row?.id||'';onChange(line.key,multipleProcesses?{styleProcessIds:value,styleProcessId:code.linkTarget==='PROCESS'?(value[0]||''):'',assignmentPlanId:''}:{styleProcessId:value,styleProcessIds:[],assignmentPlanId:''});}}/>}
          {isProcess&&plans.length>1&&<ExpenseLookupField label={labels.assignment} required languageCode={languageCode} disabled={disabled} options={plans} value={plans.find(row=>row.id===line.assignmentPlanId)||null} getOptionLabel={row=>row.factoryName+' #'+row.id} columns={[{key:'name',label:labels.assignment,value:row=>row.factoryName+' #'+row.id}]} onChange={row=>onChange(line.key,{assignmentPlanId:row?.id||''})}/>}
          {materialEnabled?<MaterialItemPicker key={configuredCode?.baseId} selectVariants autoOpen={!line.materialItemSnapshot?.variantId||line.materialSelectionRequired} orgId={orgId} baseId={configuredCode?.baseId} value={line.materialItemId} snapshot={line.materialItemSnapshot} languageCode={languageCode} disabled={disabled} required={!line.itemId||line.materialItemWasRequired} onBusyChange={setMaterialsBusy} onChange={row=>{if(paidCorrectionOnly&&line.unitId&&row?.unitId!==line.unitId){showNotification((changeApprovalText[languageCode]||changeApprovalText.en).PAID_MATERIAL_UNIT_MISMATCH,'error');return;}onChange(line.key,materialLineSelection(line,row));}}/>:<CodeItemAttributeFields line={line} code={code} orgId={orgId} languageCode={languageCode} disabled={disabled||paidCorrectionOnly} onChange={onChange} onBusyChange={setAttributesBusy} validationAttempt={validationAttempt}/>}
          {detailKeys.map(key => <TextField {...field} key={key} disabled={disabled||paidCorrectionOnly||!code?.base?.requiredFields?.includes(key==='height'?'length':key)} required={requiredDetails.includes(key)} error={validationAttempt>0&&((requiredDetails.includes(key))&&!line.details[key]?.trim()||['length','width','height'].includes(key)&&Boolean(line.details[key])&&(!/^\d{1,12}(\.\d{1,4})?$/.test(line.details[key])||Number(line.details[key])<=0))} inputProps={['length','width','height'].includes(key)?{inputMode:'decimal',pattern:'[0-9]{1,12}([.][0-9]{1,4})?'}:undefined} type={key === 'transportDate' ? 'date' : 'text'} label={common[key]} value={line.details[key] || ''} slotProps={key === 'transportDate' ? { inputLabel: { shrink: true } } : {}} onChange={event => onChange(line.key, { details: { ...line.details, [key]: event.target.value } })} />)}
          {!isProcess&&<TextField {...field} required label={evidence.reference} value={evidenceReference(line.details.evidenceFile)} error={validationAttempt>0&&!line.details.evidenceFile?.trim()} inputProps={{maxLength:500}} onChange={event=>onChange(line.key,{details:{...line.details,evidenceFile:evidenceReference(event.target.value)}})}/>}
        </Box>
        {optionsError && <Alert severity="error" action={<Button onClick={() => setReload(value => value + 1)} disabled={disabled}>{labels.retryLoad}</Button>}>{labels.loadError}</Alert>}
        {isProcess && line.styleProcessId && !optionsLoading && !plans.length && <Alert severity="warning">{labels.noPlan}</Alert>}
        {isProcess && <Typography variant="caption" color="text.secondary">{labels.processInfo}</Typography>}
      </>}
    </Stack></DialogContent><DialogActions><Button onClick={()=>setDetailsOpen(false)}>{compact.close}</Button></DialogActions></Dialog>
  </>;
}
