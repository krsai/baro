import AddActionButton from '../../../components/AddActionButton';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,CircularProgress,FormControlLabel,MenuItem,Stack,Table,TableBody,TableCell,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import InvoiceSheet from '../../../components/InvoiceSheet';
import InvoiceFormHeader from '../../../components/InvoiceFormHeader';
import InvoiceFormSummary from '../../../components/InvoiceFormSummary';
import InvoiceBankConfirmation from '../../../components/InvoiceBankConfirmation';
import AccountingCodeField from '../../../components/AccountingCodeField';
import DecimalAmountField from '../../../components/DecimalAmountField';
import DeleteActionButton from '../../../components/DeleteActionButton';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {useAppActions} from '../../../context/AppContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {invoiceBankInfo,invoiceBankChoices} from '../../../utils/invoiceBankInfo.mjs';
import {formatInvoiceMoney} from '../../../utils/invoiceItemGrid.mjs';
import {newGeneralInvoiceLine,generalInvoiceLines,calculateGeneralInvoiceDraft} from '../../../utils/generalInvoice.mjs';
import {generalInvoiceText} from '../../../constants/generalInvoice';
import {invoiceUi,invoiceSubmissionUi} from '../../../constants/invoiceUi';
import {documentNumberError} from '../../../constants/documentNumber';
import {emitWorkspaceDataChanged,WORKSPACE_DATA_TOPICS} from '../../../utils/workspaceDataEvents';

export default function GeneralInvoiceEditor({orgId,buyerOrgId,languageCode='ko',revisionInvoice,draftId,renderSelection,onIssued,onClose}){
 const t=generalInvoiceText[languageCode]||generalInvoiceText.en,ui=invoiceUi[languageCode]||invoiceUi.en,storage=invoiceSubmissionUi[languageCode]||invoiceSubmissionUi.en;
 const dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [source,setSource]=useState(null),[fields,setFields]=useState(null),[currency,setCurrency]=useState('VND'),[lines,setLines]=useState([newGeneralInvoiceLine()]);
 const [loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[dirty,setDirty]=useState(false),[reviewed,setReviewed]=useState(false),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[bankOpen,setBankOpen]=useState(false);
 const draft=useRef(null),clientKey=useRef(crypto.randomUUID()),revisionRequest=useRef(null),submission=useRef(null),busy=useRef(false),scope=useRef(orgId),mounted=useRef(true);
 scope.current=orgId;useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useUnsavedChanges(dirty||saving||uncertain);
 useEffect(()=>{
  let alive=true;setLoading(true);setLoadError(false);
  const load=async()=>{
   const stored=draftId?await requestJSON('/invoices/drafts/'+encodeURIComponent(draftId)+buildQueryString({orgId}),{skipCache:true}):null;
   if(stored&&stored.content?.documentKind!=='GENERAL')throw new Error('GENERAL_INVOICE_INVALID');
   const buyer=stored?.buyerOrgId||revisionInvoice?.buyerOrgId||buyerOrgId;
   if(!buyer){if(alive){setSource(null);setFields(null);}return;}
   const data=await requestJSON('/invoices/general-source'+buildQueryString({orgId,buyerOrgId:buyer}),{skipCache:true});
   if(!alive)return;
   setSource(data);
   // Retry a failed source load without overwriting an existing draft.
   if(fields)return;
   const content=stored?.content,snapshot=revisionInvoice?.snapshot;
   const chosenCurrency=content?.currency||revisionInvoice?.currencyCode||'VND';
   setCurrency(chosenCurrency);setLines(content?.lines|| (snapshot?generalInvoiceLines(snapshot):[newGeneralInvoiceLine()]));
   setFields(content?.fields||(snapshot?{...snapshot.fields,number:revisionInvoice.invoiceNumber+'-R'+(Number(revisionInvoice.revisionNumber||1)+1)}:{number:'',date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),seller:data.seller,buyer:data.buyer,shipTo:'',shipmentDate:'',dueDate:'',expectedCollectionDate:'',incoterm:'',paymentTerms:'',bank:invoiceBankInfo(data.sellerBankAccounts,chosenCurrency),notes:''}));
   if(stored){draft.current=stored;clientKey.current=stored.clientKey;}
  };
  load().catch(()=>{if(alive)setLoadError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[orgId,buyerOrgId,revisionInvoice?.id,draftId,reload]);
 const calculation=useMemo(()=>calculateGeneralInvoiceDraft(lines,currency),[lines,currency]);
 const locked=saving||uncertain,bankChoices=useMemo(()=>invoiceBankChoices(source?.sellerBankAccounts||[],currency),[source,currency]);
 const change=(fn)=>{if(locked)return;fn();setDirty(true);setReviewed(false);};
 const changeLine=(key,patch)=>change(()=>setLines(current=>current.map(row=>row.key===key?{...row,...patch}:row)));
 const changeField=(key,value)=>change(()=>setFields(current=>({...current,[key]:value})));
 const requestChange=async action=>{
  if(locked)return;if((dirty||draft.current)&&!await dialogs.confirm(ui.discard))return;
  draft.current=null;submission.current=null;clientKey.current=crypto.randomUUID();setSource(null);setFields(null);setDirty(false);setReviewed(false);action();
 };
 const close=async()=>{if(saving)return;if((dirty||uncertain)&&!await dialogs.confirm(ui.discard))return;setDirty(false);onClose?.();};
 const issue=async(options={})=>{
  if(busy.current||loading||loadError||!source||!fields?.date||!reviewed||!calculation.valid)return;
  if(!uncertain&&bankChoices.length&&!options.confirmedBank){setBankOpen(true);return;}
  if(!uncertain&&!await dialogs.confirm(storage.confirmIssue))return;
  const issueFields=options.confirmedBank?{...fields,bank:options.confirmedBank}:fields;
  if(revisionInvoice&&!draft.current&&!revisionRequest.current){const reason=await dialogs.prompt(t.reason);if(!reason?.trim())return;revisionRequest.current={clientKey:clientKey.current,reason:reason.trim()};}
  busy.current=true;setSaving(true);setError('');
  try{
   const attempt=submission.current||{phase:'SAVE',payload:{clientKey:clientKey.current,revision:draft.current?.revision,documentKind:'GENERAL',buyerOrgId:source.buyerOrgId,basis:null,currency,fields:issueFields,orders:[],percentages:{},settlements:{},lines:lines.map(({key,transactionCodeId,description,unit,quantity,unitPrice,vatRate,remark})=>({key,transactionCodeId,description,unit,quantity,unitPrice,vatRate,remark}))}};
   submission.current=attempt;const payload=attempt.payload;
   if(revisionInvoice&&!draft.current){const created=await requestJSON('/invoices/issued/'+encodeURIComponent(revisionInvoice.id)+'/revision-draft'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(revisionRequest.current)});draft.current=created;clientKey.current=created.clientKey;payload.clientKey=created.clientKey;payload.revision=created.revision;}
   if(attempt.phase==='SAVE'){const saved=await requestJSON('/invoices/drafts'+(draft.current?'/'+encodeURIComponent(draft.current.id):'')+buildQueryString({orgId}),{method:draft.current?'PUT':'POST',body:JSON.stringify(payload)});draft.current=saved;attempt.phase='ISSUE';}
   await requestJSON('/invoices/drafts/'+encodeURIComponent(draft.current.id)+'/issue'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({revision:draft.current.revision})});
   emitWorkspaceDataChanged({orgId,topics:[WORKSPACE_DATA_TOPICS.INVOICE_DRAFTS,WORKSPACE_DATA_TOPICS.ISSUED_INVOICES]});
   if(!mounted.current||scope.current!==orgId)return;
   setDirty(false);setUncertain(false);showNotification(storage.issued,'success');(onIssued||onClose)?.();
  }catch(failure){
   if(!mounted.current||scope.current!==orgId)return;
   const unknown=!failure.status||failure.status>=500;setUncertain(unknown);
   if(!unknown)submission.current=null;
   setError(documentNumberError(failure.details?.error||failure.message,languageCode)|| (unknown?t.uncertain:failure.message==='COMPANY_BILLING_CODE_INVALID'?t.codeInvalid:failure.message==='GENERAL_INVOICE_BUYER_INVALID'?t.buyerInvalid:t.failed));
  }finally{busy.current=false;if(mounted.current&&scope.current===orgId)setSaving(false);}
 };
 return <AppPageContainer title={t.general} titleActions={<Stack direction="row" spacing={1}><Button disabled={saving} onClick={close}>{ui.cancel}</Button><Button variant="contained" disabled={loading||loadError||saving||!source||!reviewed||!calculation.valid||!fields?.date} onClick={()=>issue()}>{saving?<CircularProgress size={18}/>:ui.issue}</Button></Stack>}>
  <InvoiceSheet><Stack spacing={2} sx={{p:2}}>
   {renderSelection?.({requestChange,disabled:locked})}
   {loading&&<CircularProgress size={22}/>}{loadError&&<Alert severity="error" action={<Button disabled={locked} onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}{error&&<Alert severity="error">{error}</Alert>}
   {source&&fields&&<Box component="fieldset" disabled={locked} sx={{border:0,p:0,m:0,minWidth:0}}>
    <InvoiceFormHeader fields={fields} languageCode={languageCode} onChange={changeField}/>
    <TextField select size="small" sx={{m:2,width:140}} label={t.currency} value={currency} disabled={!!revisionInvoice||!!draftId||locked} onChange={event=>change(()=>{setCurrency(event.target.value);setFields(current=>({...current,bank:invoiceBankInfo(source.sellerBankAccounts,event.target.value)}));})}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
    <Box sx={{overflowX:'auto'}}><Table size="small" sx={{minWidth:1120}}><TableHead><TableRow>{['#',t.code,t.description,t.quantity,t.unit,t.price,t.vat,t.tax,t.total,''].map((label,index)=><TableCell key={index} align={index===3||index>=5&&index<=8?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{lines.map((line,index)=><TableRow key={line.key} data-testid="general-invoice-line">
     <TableCell>{index+1}</TableCell><TableCell sx={{minWidth:145}}><AccountingCodeField direction="IN" codes={source.codes} value={line.transactionCodeId} valueObject={source.codes.find(code=>code.id===line.transactionCodeId)|| (line.code?{id:line.transactionCodeId,code:line.code,nameEn:line.codeDescription,cashDirection:'IN'}:null)} languageCode={languageCode} disabled={locked} onSelect={code=>changeLine(line.key,{transactionCodeId:code?.id||null,vatRate:code?.vatEnabled?line.vatRate:'0'})}/></TableCell>
     <TableCell><TextField size="small" label={t.description} value={line.description} disabled={locked} inputProps={{maxLength:1000}} onChange={event=>changeLine(line.key,{description:event.target.value})}/></TableCell><TableCell><DecimalAmountField size="small" label={t.quantity} sx={{width:100}} value={line.quantity} disabled={locked} onValueChange={quantity=>changeLine(line.key,{quantity})}/></TableCell><TableCell><TextField size="small" label={t.unit} sx={{width:80}} value={line.unit} disabled={locked} inputProps={{maxLength:100}} onChange={event=>changeLine(line.key,{unit:event.target.value})}/></TableCell>
     <TableCell><DecimalAmountField size="small" currencyCode={currency} label={t.price} sx={{width:145}} value={line.unitPrice} disabled={locked} onValueChange={unitPrice=>changeLine(line.key,{unitPrice})}/></TableCell><TableCell><TextField size="small" label={t.vat} sx={{width:90}} value={line.vatRate} disabled={locked||!source.codes.find(code=>code.id===line.transactionCodeId)?.vatEnabled} inputProps={{inputMode:'decimal'}} onChange={event=>changeLine(line.key,{vatRate:event.target.value})}/></TableCell>
     <TableCell align="right">{formatInvoiceMoney(calculation.lines[index]?.vatAmount,currency)}</TableCell><TableCell align="right">{formatInvoiceMoney(calculation.lines[index]?.amount,currency)}</TableCell><TableCell data-table-actions><Stack direction="row"><AddActionButton aria-label={t.add} disabled={locked||lines.length>=50} onClick={()=>change(()=>setLines(current=>[...current.slice(0,index+1),newGeneralInvoiceLine(),...current.slice(index+1)]))}/><DeleteActionButton aria-label={t.remove} disabled={locked||lines.length===1} onClick={()=>change(()=>setLines(current=>current.filter(row=>row.key!==line.key)))}/></Stack></TableCell>
    </TableRow>)}</TableBody></Table></Box>
    <Stack alignItems="flex-end" sx={{p:2}}><Typography>{t.subtotal}: {formatInvoiceMoney(calculation.subtotal,currency)}</Typography><Typography>{t.tax}: {formatInvoiceMoney(calculation.vatAmount,currency)}</Typography></Stack>
    <InvoiceFormSummary fields={fields} total={calculation.amount} currencyCode={currency} languageCode={languageCode} onRemark={value=>changeField('notes',value)}/>
    {!calculation.valid&&<Alert severity="info">{t.invalid}</Alert>}<FormControlLabel control={<Checkbox checked={reviewed} disabled={locked} onChange={event=>setReviewed(event.target.checked)}/>} label={t.review}/>
   </Box>}
  </Stack></InvoiceSheet>
  <InvoiceBankConfirmation open={bankOpen} onClose={()=>setBankOpen(false)} accounts={bankChoices} currencyCode={currency} currentText={fields?.bank||''} languageCode={languageCode} onConfirm={bank=>{setBankOpen(false);setFields(current=>({...current,bank}));issue({confirmedBank:bank});}}/>
 </AppPageContainer>;
}
