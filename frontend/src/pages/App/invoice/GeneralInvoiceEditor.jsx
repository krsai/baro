import GeneralInvoiceDocument from '../../../components/GeneralInvoiceDocument';
import GeneralInvoiceBody from '../../../components/GeneralInvoiceBody';
import GeneralInvoiceLineTable from '../../../components/GeneralInvoiceLineTable';
import {invoiceDocumentText} from '../../../constants/invoiceDocument';
import {advanceAfterSelection} from '../../../utils/formFocus.mjs';
import {keyboardAction} from '../../../utils/keyboardPolicy.mjs';
import {paymentAccountError} from '../../../utils/invoicePaymentAccount.mjs';
import AddActionButton from '../../../components/AddActionButton';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Box,Button,Checkbox,CircularProgress,FormControlLabel,IconButton,InputAdornment,MenuItem,Stack,TextField} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import Alert from "../../../components/AppNotice";
import AppPageContainer from '../../../components/AppPageContainer';
import InvoiceSheet from '../../../components/InvoiceSheet';
import InvoiceEntrySettings from '../../../components/InvoiceEntrySettings';
import MaterialSelectionDialog from '../../../components/MaterialSelectionDialog';
import ReadOnlyField from '../../../components/ReadOnlyField';
import {accountingCodeDescription} from '../../../utils/accountingCode.mjs';
import {materialItemName,materialItemSpec,materialItemText} from '../../../constants/materialItems';
import AccountingCodeField from '../../../components/AccountingCodeField';
import DecimalAmountField from '../../../components/DecimalAmountField';
import DeleteActionButton from '../../../components/DeleteActionButton';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {useAppActions} from '../../../context/AppContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {formatInvoiceMoney} from '../../../utils/invoiceItemGrid.mjs';
import {newGeneralInvoiceLine,generalInvoiceLines,calculateGeneralInvoiceDraft} from '../../../utils/generalInvoice.mjs';
import {generalInvoiceText} from '../../../constants/generalInvoice';
import {invoiceUi,invoiceSubmissionUi} from '../../../constants/invoiceUi';
import {documentNumberError} from '../../../constants/documentNumber';
import {emitWorkspaceDataChanged,WORKSPACE_DATA_TOPICS} from '../../../utils/workspaceDataEvents';

export default function GeneralInvoiceEditor({orgId,buyerOrgId,languageCode='ko',revisionInvoice,draftId,renderSelection,onIssued,onClose,inlineRevision=false,pageTitle}){
 const t=generalInvoiceText[languageCode]||generalInvoiceText.en,ui=invoiceUi[languageCode]||invoiceUi.en,storage=invoiceSubmissionUi[languageCode]||invoiceSubmissionUi.en;
 const dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [source,setSource]=useState(null),[fields,setFields]=useState(null),[currency,setCurrency]=useState('VND'),[lines,setLines]=useState([newGeneralInvoiceLine()]);
 const [selectingMaterial,setSelectingMaterial]=useState(false),[codeRevision,setCodeRevision]=useState(0);
 const [loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[dirty,setDirty]=useState(false),[reviewed,setReviewed]=useState(false),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const gridRef=useRef(null),materialRef=useRef(null),selectionBusy=useRef(false);
 const draft=useRef(null),clientKey=useRef(crypto.randomUUID()),revisionRequest=useRef(null),submission=useRef(null),busy=useRef(false),scope=useRef(orgId),mounted=useRef(true);
 scope.current=orgId;useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useUnsavedChanges(dirty||saving||uncertain);
 useEffect(()=>{
  let alive=true;setLoading(true);setLoadError(false);
  const load=async()=>{
   const stored=draftId?await requestJSON('/invoices/drafts/'+encodeURIComponent(draftId)+buildQueryString({orgId}),{skipCache:true}):null;
   if(stored&&stored.content?.documentKind!=='GENERAL')throw new Error('GENERAL_INVOICE_INVALID');
   const buyer=stored?.buyerOrgId||revisionInvoice?.buyerOrgId||buyerOrgId;
   if(!buyer){if(alive){setSource(null);setFields(null);setDirty(false);setReviewed(false);draft.current=null;submission.current=null;clientKey.current=crypto.randomUUID();}return;}
   const data=await requestJSON('/invoices/general-source'+buildQueryString({orgId,buyerOrgId:buyer}),{skipCache:true});
   if(!alive)return;
   setSource(data);
   // Retry a failed source load without overwriting an existing draft.
   if(fields)return;
   const content=stored?.content,snapshot=revisionInvoice?.snapshot;
   const chosenCurrency=content?.currency||snapshot?.currencyTotals?.[0]?.currencyCode||revisionInvoice?.currencyCode||'VND';
   setCurrency(chosenCurrency);setLines(content?.lines?.map(row=>({...row,currencyCode:row.currencyCode||chosenCurrency}))|| (snapshot?generalInvoiceLines(snapshot):[newGeneralInvoiceLine(data.defaultCurrencyCode||'VND')]));
   setFields(content?.fields||(snapshot?{...snapshot.fields,number:inlineRevision?revisionInvoice.invoiceNumber:revisionInvoice.invoiceNumber+'-R'+(Number(revisionInvoice.revisionNumber||1)+1)}:{number:'',date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}),seller:data.seller,buyer:data.buyer,shipTo:'',shipmentDate:'',dueDate:'',expectedCollectionDate:'',incoterm:'',paymentTerms:'',bank:'',bankAccountId:null,notes:''}));
   if(stored){draft.current=stored;clientKey.current=stored.clientKey;}
  };
  load().catch(()=>{if(alive)setLoadError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[orgId,buyerOrgId,revisionInvoice?.id,draftId,reload]);
 const calculation=useMemo(()=>{
  const calculated=calculateGeneralInvoiceDraft(lines,currency),snapshot=revisionInvoice?.snapshot;
  if(!inlineRevision||dirty||!snapshot)return calculated;
  return {...calculated,amount:snapshot.total,lines:snapshot.lines,currencyTotals:snapshot.currencyTotals||[{currencyCode:snapshot.currencyCode,subtotal:snapshot.subtotal,vatAmount:snapshot.vatAmount,total:snapshot.total}]};
 },[lines,currency,inlineRevision,dirty,revisionInvoice?.snapshot]);
 const locked=saving||uncertain||selectingMaterial;
 const change=(fn)=>{if(locked)return;if(inlineRevision&&!dirty)setFields(current=>({...current,number:current.number===revisionInvoice.invoiceNumber?revisionInvoice.invoiceNumber+'-R'+(Number(revisionInvoice.revisionNumber||1)+1):current.number}));fn();setDirty(true);setReviewed(false);};
 const changeLine=(key,patch)=>change(()=>setLines(current=>current.map(row=>row.key===key?{...row,...patch}:row)));
 const lineElement=key=>gridRef.current?.querySelector('[data-invoice-line-key="'+CSS.escape(key)+'"]');
 const addLine=(line,origin)=>{if(locked||lines.length>=50)return;const next=newGeneralInvoiceLine(line.currencyCode||currency);change(()=>setLines(current=>{const index=current.findIndex(row=>row.key===line.key);return [...current.slice(0,index+1),next,...current.slice(index+1)];}));advanceAfterSelection(origin,{targetSelector:'[data-invoice-line-key="'+next.key+'"] [data-invoice-code] input',afterContainer:gridRef.current});};
 const removeLine=(line,origin)=>{if(locked||lines.length===1)return;const index=lines.findIndex(row=>row.key===line.key),next=lines[index+1]||lines[index-1];change(()=>setLines(current=>current.filter(row=>row.key!==line.key)));advanceAfterSelection(origin,{targetSelector:'[data-invoice-line-key="'+next.key+'"] [data-invoice-code] input',afterContainer:gridRef.current});};
 const chooseCode=async(line,code,focusOrigin)=>{
  if(locked||selectionBusy.current)return;
  const company=orgId;
  if(code?.base?.materialSettings?.enabled){
   const origin=focusOrigin||lineElement(line.key)?.querySelector('[data-invoice-code] input');let selected=false;
   selectionBusy.current=true;setSelectingMaterial(true);
   try{const item=await materialRef.current.prepare({baseId:code.baseId,value:line.materialItemId,snapshot:line.materialItemSnapshot,context:'INVOICE'});
    if(!item||!mounted.current||scope.current!==company)return;selected=true;
    changeLine(line.key,{transactionCodeId:code.id,description:[materialItemName(item,languageCode),materialItemSpec(item)].filter(Boolean).join(' / ')||accountingCodeDescription(code,languageCode),vatRate:code.vatEnabled?line.vatRate:'0',materialItemId:item.id,materialVariantId:item.variantId,materialVariantRevision:item.variantRevision,materialItemSnapshot:{id:item.id,baseId:item.baseId,unitId:item.unitId,...item.data},unitId:item.unitId,unit:materialItemName(item.data?.unit,languageCode)});
   }finally{selectionBusy.current=false;if(mounted.current&&scope.current===company){setSelectingMaterial(false);setCodeRevision(value=>value+1);advanceAfterSelection(origin,{restoreOnly:!selected});}}
   return;
  }
  changeLine(line.key,{transactionCodeId:code?.id||null,description:accountingCodeDescription(code,languageCode),vatRate:code?.vatEnabled?line.vatRate:'0',materialItemId:null,materialVariantId:null,materialVariantRevision:null,materialItemSnapshot:null});
 };
 const changeField=(key,value)=>change(()=>setFields(current=>({...current,[key]:value})));
 const requestChange=async action=>{
  if(locked)return;if((dirty||draft.current)&&!await dialogs.confirm(ui.discard,{purpose:'discard'}))return;
  draft.current=null;submission.current=null;clientKey.current=crypto.randomUUID();setSource(null);setFields(null);setDirty(false);setReviewed(false);action();
 };
 const issue=async(options={})=>{
  if(busy.current||loading||loadError||!source||selectingMaterial||!fields?.date||!reviewed||!calculation.valid)return;
  if(!uncertain&&!await dialogs.confirm(storage.confirmIssue))return;
  const issueFields={...fields};
  if(revisionInvoice&&!draft.current&&!revisionRequest.current){const reason=await dialogs.prompt(t.reason);if(!reason?.trim())return;revisionRequest.current={clientKey:clientKey.current,reason:reason.trim()};}
  busy.current=true;setSaving(true);setError('');
  try{
   const attempt=submission.current||{phase:'SAVE',payload:{clientKey:clientKey.current,revision:draft.current?.revision,documentKind:'GENERAL',buyerOrgId:source.buyerOrgId,basis:null,currency,fields:issueFields,orders:[],percentages:{},settlements:{},lines:lines.map(({key,transactionCodeId,description,unit,unitId,materialItemId,materialVariantId,materialVariantRevision,quantity,unitPrice,vatRate,remark,currencyCode})=>({key,transactionCodeId,description,unit,unitId,materialItemId,materialVariantId,materialVariantRevision,quantity,unitPrice,vatRate,remark,currencyCode}))}};
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
   setError(paymentAccountError(failure.details?.error||failure.message,languageCode)||documentNumberError(failure.details?.error||failure.message,languageCode)|| (unknown?t.uncertain:failure.message==='COMPANY_BILLING_CODE_INVALID'?t.codeInvalid:failure.message==='GENERAL_INVOICE_BUYER_INVALID'?t.buyerInvalid:t.failed));
  }finally{busy.current=false;if(mounted.current&&scope.current===orgId)setSaving(false);}
 };
 if(inlineRevision&&!source)return <AppPageContainer title={pageTitle}><GeneralInvoiceDocument invoice={revisionInvoice} languageCode={languageCode}/>{loading&&<CircularProgress size={22}/>}{loadError&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}</AppPageContainer>;
 return <AppPageContainer keyboardEntry title={pageTitle||(invoiceDocumentText[languageCode]||invoiceDocumentText.en).title} titleActions={<Stack direction="row" spacing={1}><Button variant="contained" disabled={inlineRevision&&!dirty||loading||loadError||saving||selectingMaterial||!source||!reviewed||!calculation.valid||!fields?.date} onClick={()=>issue()}>{saving?<CircularProgress size={18}/>:ui.issue}</Button></Stack>}>
  <MaterialSelectionDialog ref={materialRef} orgId={orgId} languageCode={languageCode}/>
  <InvoiceSheet><Stack spacing={0} sx={{minWidth:0}}>
   <InvoiceEntrySettings selection={renderSelection?.({requestChange:requestChange,disabled:locked})}/>
   {loading&&<CircularProgress size={22}/>}{loadError&&<Alert severity="error" action={<Button disabled={locked} onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}{error&&<Alert severity="error">{error}</Alert>}
   {source&&fields&&<Box component="fieldset" disabled={locked} sx={{border:0,p:0,m:0,minWidth:0}}>
    <GeneralInvoiceBody fields={fields} languageCode={languageCode} onChange={changeField} currencyCode={currency} currencyTotals={calculation.currencyTotals} summaryProps={{orgId,total:calculation.amount,onRemark:value=>changeField('notes',value),bankAccounts:source.sellerBankAccounts,disabled:locked,onBankChange:patch=>change(()=>setFields(current=>({...current,...patch})))}}>
     <GeneralInvoiceLineTable lines={lines} currencyCode={currency} languageCode={languageCode} gridRef={gridRef} renderers={{description:(line,index)=>(<><Stack direction="row" alignItems="center" spacing={1}><Box data-invoice-code sx={{width:120,flexShrink:0}}><AccountingCodeField resetKey={codeRevision} hideLabel direction="IN" codes={source.codes} value={line.transactionCodeId} valueObject={source.codes.find(code=>code.id===line.transactionCodeId)|| (line.code?{id:line.transactionCodeId,code:line.code,nameEn:line.codeDescription,cashDirection:'IN'}:null)} languageCode={languageCode} disabled={locked} requireMaterialSelection={!line.materialItemId} onSelect={code=>chooseCode(line,code)}/></Box><Box sx={{flex:1,minWidth:0}}><TextField onKeyDown={event=>{if(keyboardAction(event,'lookup')==='search'&&source.codes.find(code=>code.id===line.transactionCodeId)?.base?.materialSettings?.enabled){event.preventDefault();event.stopPropagation();chooseCode(line,source.codes.find(code=>code.id===line.transactionCodeId),event.target);}}} size="small" inputProps={{maxLength:1000,'aria-label':t.description}} value={line.description} disabled={locked} onChange={event=>changeLine(line.key,{description:event.target.value})} InputProps={{endAdornment:(line.materialItemId||source.codes.find(code=>code.id===line.transactionCodeId)?.base?.materialSettings?.enabled)?<InputAdornment position="end"><IconButton tabIndex={-1} size="small" aria-label={(materialItemText[languageCode]||materialItemText.en).select} disabled={locked} onMouseDown={event=>event.preventDefault()} onClick={event=>{const origin=event.currentTarget.closest('.MuiInputBase-root')?.querySelector('input');origin?.focus();chooseCode(line,source.codes.find(code=>code.id===line.transactionCodeId),origin);}}><SearchIcon fontSize="small"/></IconButton></InputAdornment>:null}}/></Box></Stack></>),
quantity:(line,index)=>(<><DecimalAmountField size="small" inputProps={{'aria-label':t.quantity,style:{textAlign:'right'},onFocus:event=>{const input=event.target;if(line.quantity==='1')requestAnimationFrame(()=>{if(document.activeElement===input)input.select();});},onMouseUp:event=>{if(line.quantity==='1')event.preventDefault();}}} value={line.quantity} disabled={locked} onValueChange={quantity=>changeLine(line.key,{quantity})}/></>),
unit:(line,index)=>(<>{line.materialItemId?<ReadOnlyField hideLabel label={t.unit} value={line.unit}/>:<TextField select size="small" value={line.unitId||line.unit||''} disabled={locked} slotProps={{select:{inputProps:{'aria-label':t.unit}}}} onChange={event=>{const unit=source.units?.find(unit=>unit.id===event.target.value);changeLine(line.key,{unitId:unit?.id||null,unit:unit?.nameEn||unit?.nameKo||unit?.nameVi||''});}}><MenuItem value="">—</MenuItem>{line.unit&&!line.unitId&&<MenuItem value={line.unit}>{line.unit}</MenuItem>}{(source.units||[]).map(unit=><MenuItem key={unit.id} value={unit.id}>{materialItemName(unit,languageCode)}</MenuItem>)}</TextField>}</>),
currency:(line,index)=>(<><TextField size="small" select value={line.currencyCode||currency} disabled={locked} slotProps={{select:{inputProps:{'aria-label':t.currency}}}} onChange={event=>changeLine(line.key,{currencyCode:event.target.value})}>{['VND','USD','KRW'].map(value=><MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></>),
price:(line,index)=>(<><DecimalAmountField size="small" currencyCode={line.currencyCode||currency} inputProps={{'aria-label':t.price,style:{textAlign:'right'}}} value={line.unitPrice} disabled={locked} onValueChange={unitPrice=>changeLine(line.key,{unitPrice})}/></>),
vat:(line,index)=>(<><TextField size="small"  value={line.vatRate} disabled={locked||!source.codes.find(code=>code.id===line.transactionCodeId)?.vatEnabled} inputProps={{inputMode:'decimal','aria-label':t.vat,style:{textAlign:'right'}}} onChange={event=>changeLine(line.key,{vatRate:event.target.value})}/></>),
tax:(line,index)=>(<>{formatInvoiceMoney(calculation.lines[index]?.vatAmount,line.currencyCode||currency)}</>),
total:(line,index)=>(<>{formatInvoiceMoney(calculation.lines[index]?.amount,line.currencyCode||currency)}</>),
actions:(line,index)=>(<><Stack direction="row"><AddActionButton aria-label={t.add} disabled={locked||lines.length>=50} onClick={event=>addLine(line,event.currentTarget)}/><DeleteActionButton aria-label={t.remove} disabled={locked||lines.length===1} onClick={event=>removeLine(line,event.currentTarget)}/></Stack></>)}}/>
    </GeneralInvoiceBody>
    {!calculation.valid&&<Alert severity="info">{t.invalid}</Alert>}<FormControlLabel sx={{m:2}} control={<Checkbox checked={reviewed} disabled={locked} onChange={event=>setReviewed(event.target.checked)}/>} label={t.review}/>
   </Box>}
  </Stack></InvoiceSheet>
 </AppPageContainer>;
}
