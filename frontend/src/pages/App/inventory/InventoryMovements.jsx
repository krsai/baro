import {inventoryColorText} from '../../../constants/inventoryColors';
import StockColorDialog,{StockColorHistory} from '../../../components/StockColorDialog';
import Dialog from '../../../components/AppDialog';
import TableStatusRow from '../../../components/TableStatusRow';
import AppPageContainer from '../../../components/AppPageContainer';
import PageContentStack from '../../../components/PageContentStack';
import DocumentEntryHeader from '../../../components/DocumentEntryHeader';
import ApprovalLineSummary from '../../../components/ApprovalLineSummary';
import CustomDatePicker from '../../../components/CustomDatePicker';
import {approvalBandText} from '../../../constants/approvalBands';
import {inventoryApprovalText,inventoryApprovalError} from '../../../constants/inventoryApproval';
import {approvalVacancyText} from '../../../constants/approvalVacancy';
import ApprovalStageFlow from '../../../components/ApprovalStageFlow';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import InventoryApprovalPanel,{InventoryDeleteDialog} from './InventoryApprovalPanel';
import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,DialogActions,DialogContent,DialogTitle,LinearProgress,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {Add} from '@mui/icons-material';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import ExpenseLookupField from '../../../components/ExpenseLookupField';
import SaveButton from '../../../components/SaveButton';
import AppNotice from '../../../components/AppNotice';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
import {materialItemName,materialItemText} from '../../../constants/materialItems';
import {inventoryEntryText} from '../../../constants/inventoryEntry';

const labels={
 ko:['\uc785\uace0','\ucd9c\uace0','\uac1c\ubcc4 \ud488\ubaa9','\uc0c8 \ud488\ubaa9 \ub4f1\ub85d','\uc18c\uc720\uc790','\ud0c0\uc785','\uc218\ub7c9','\ucc98\ub9ac\uc77c','\uba54\ubaa8','\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.','\uc785\ucd9c\uace0 \uc720\ud615'],
 en:['Receipt','Issue','Stock item','Register new item','Owner','Type','Quantity','Date','Remark','Movement saved.','Movement type'],
 vi:['Nh\u1eadp kho','Xu\u1ea5t kho','M\u1eb7t h\u00e0ng','\u0110\u0103ng k\u00fd m\u1eb7t h\u00e0ng m\u1edbi','Ch\u1ee7 s\u1edf h\u1eefu','Lo\u1ea1i','S\u1ed1 l\u01b0\u1ee3ng','Ng\u00e0y','Ghi ch\u00fa','\u0110\u00e3 l\u01b0u.','Lo\u1ea1i giao d\u1ecbch'],
};
const masterLabels={ko:'자재',en:'Material',vi:'Vật tư'};
const axes=['length','width','height'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const ownerName=(row,language)=>materialItemName(row,language)||row?.name||'';
const quantityText=value=>{
 const [whole,fraction='']=value.split('.');
 const decimals=fraction.replace(/0+$/,'');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimals?'.'+decimals:'');
};
const variantName=(data,language)=>[ownerName(data.owner,language),materialItemName(data.type,language),data.color?.code,axes.map(axis=>data.dimensions?.[axis]).filter(Boolean).join(' \u00d7 ')].filter(Boolean).join(' \u00b7 ');
const request=(path,orgId,options)=>requestJSON('/inventory-entry'+path+buildQueryString({orgId}),{skipCache:true,...options});
const lookup=(label,options,value,onChange,languageCode,getOptionLabel,props={})=><ExpenseLookupField label={label} options={options} value={value} onChange={onChange} languageCode={languageCode} getOptionLabel={getOptionLabel} columns={[{key:'name',label,value:getOptionLabel}]} {...props}/>;

export function InventoryEntry({onClose,onSaved}){
 const {activeOrgId}=useAuth();
 return <MovementForm key={activeOrgId} orgId={activeOrgId} onClose={onClose} onSaved={onSaved}/>;
}

function MovementForm({orgId,onClose,onSaved}){
 const {languageCode}=useLanguage(),{showNotification,navigateToPath}=useAppActions(),navigate=useNavigate(),dialogs=usePageDialogs();
 const a=inventoryApprovalText[languageCode]||inventoryApprovalText.en;
 const [approval,setApproval]=useState(null),[approvalSelection,setApprovalSelection]=useState({}),[approvalOpen,setApprovalOpen]=useState(false),[approvalOnly,setApprovalOnly]=useState(false);
 const t=materialItemText[languageCode]||materialItemText.en,e=inventoryEntryText[languageCode]||inventoryEntryText.en;
 const [receipt,issue,itemLabel,add,ownerLabel,typeLabel,qty,dateLabel,remarkLabel,saved,directionLabel]=labels[languageCode]||labels.en;
 const [items,setItems]=useState(null),[employees,setEmployees]=useState(null),[user,setUser]=useState(null),[selectedItem,setSelectedItem]=useState(null);
 const master=selectedItem?{id:selectedItem.masterId,data:selectedItem.master}:null,variant=selectedItem;
 const [stockOptions,setStockOptions]=useState(null),[color,setColor]=useState(null),[colorError,setColorError]=useState(false),[colorReload,setColorReload]=useState(0);
 const colorMode=selectedItem?.materialSettings?.masterInputs?.color??selectedItem?.materialSettings?.colorInput??'HIDDEN';
 useEffect(()=>{let active=true;setStockOptions(null);setColor(selectedItem?.attributes.color||null);setColorError(false);if(selectedItem&&colorMode!=='HIDDEN')requestJSON('/inventory-entry/options'+buildQueryString({orgId,masterId:selectedItem.masterId}),{skipCache:true}).then(data=>{if(active)setStockOptions(data);}).catch(()=>{if(active)setColorError(true);});return()=>{active=false;};},[selectedItem?.id,colorMode,orgId,colorReload]);
 const [direction,setDirection]=useState('IN'),[date,setDate]=useState(today),[quantity,setQuantity]=useState(''),[remark,setRemark]=useState('');
 const [purchase,setPurchase]=useState(null),[purchaseRows,setPurchaseRows]=useState(null),[purchaseError,setPurchaseError]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const pending=useRef(null),locked=useRef(false),live=useRef(true);
 const initialUser=useRef(null),initialDate=useRef(date),dirty=Boolean(selectedItem||quantity||remark||direction!=='IN'||date!==initialDate.current||user&&user.id!==initialUser.current);
 const needsPurchase=direction==='IN'&&Number(variant?.attributes.owner?.id)===Number(orgId);
 useEffect(()=>{setPurchase(null);},[master?.id,variant?.id,needsPurchase]);
 useEffect(()=>{
  let active=true;setPurchaseRows(null);setPurchaseError('');
  if(needsPurchase&&master)requestJSON('/inventory-entry/purchase-expenses'+buildQueryString({orgId,masterId:master.id,variantId:variant?.id}),{skipCache:true}).then(rows=>{if(active){setPurchaseRows(rows);setPurchase(current=>rows.find(row=>row.expenseItemId===current?.expenseItemId&&row.version===current?.version)||null);}}).catch(()=>{if(active)setPurchaseError(t.failed);});
  return()=>{active=false;};
 },[needsPurchase,master?.id,variant?.id,orgId,reload,t.failed]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useUnsavedChanges(dirty);
 const close=async()=>{if(busy||pending.current)return;if(!dirty||await dialogs.confirm('',{purpose:'discard'})){if(onClose)onClose();else if(navigateToPath)navigateToPath('/inventory/movements',{closeTabId:'/inventory/movements/new',skipUnsavedChangesCheck:true});else navigate('/inventory/movements');}};
 useEffect(()=>{let active=true;setApproval(null);setError('');requestJSON('/inventory-entry/approval-preview'+buildQueryString({orgId,selection:JSON.stringify(approvalSelection)}),{skipCache:true}).then(value=>{if(active)setApproval(value);}).catch(e=>{if(active)setError(inventoryApprovalError(e,a,t.failed));});return()=>{active=false;};},[approvalOpen,orgId,reload,a,t.failed,approvalSelection]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements'],isBlocked:dirty||busy||approvalOpen,onRefresh:()=>setReload(n=>n+1)});
 useEffect(()=>{let active=true;setError('');setItems(null);setEmployees(null);Promise.all([request('/items',orgId),request('/employees',orgId)]).then(([rows,people])=>{if(!active)return;setItems(rows);setEmployees(people.employees);if(initialUser.current===null){initialUser.current=people.currentEmployeeId;setUser(people.employees.find(person=>person.id===people.currentEmployeeId)||null);}}).catch(()=>{if(active)setError(t.failed);});return()=>{active=false;};},[orgId,reload,t.failed]);
 const unavailable=busy||Boolean(pending.current),positive=/^\d{1,16}(\.\d{1,4})?$/;
 const validQuantity=positive.test(quantity)&&Number(quantity)>0;
 const validVariant=Boolean(variant&&(colorMode==='HIDDEN'||stockOptions&&!colorError&&(colorMode!=='REQUIRED'||color)));
 const save=async()=>{
  if(locked.current||!user||!master||!validQuantity||!validVariant||!approval||approval.stages.some(stage=>!stage.employeeId)||needsPurchase&&(!purchase||!purchaseRows||purchaseError))return;
  locked.current=true;setBusy(true);setError('');
  const payload=pending.current||{clientKey:crypto.randomUUID(),masterId:master.id,variantId:variant?.id??null,variantRevision:variant?.revision,colorId:colorMode!=='HIDDEN'?color?.id??null:null,userEmployeeId:user.id,expenseItemId:needsPurchase?purchase.expenseItemId:null,expenseRequestVersion:needsPurchase?purchase.version:null,approvalRevision:approval.policy.revision,approvalSelection:Object.fromEntries(approval.stages.map(stage=>[stage.key+'EmployeeId',stage.employeeId])),date,quantity:(direction==='OUT'?'-':'')+quantity,remark};
  pending.current=payload;
  try{
   await request('',orgId,{method:'POST',body:JSON.stringify(payload)});
   if(!live.current)return;
   pending.current=null;
   emitWorkspaceDataChanged({orgId,topics:['inventory-movements','inventory-stock']});
   showNotification(approval?.stages.length&&!approval.automatic?a.submitted:saved,'success');
   if(onSaved){onSaved();return;}
   if(navigateToPath)navigateToPath('/inventory/movements',{closeTabId:'/inventory/movements/new',skipUnsavedChangesCheck:true});
   else navigate('/inventory/movements');
  }catch(error){
   if(live.current){if(error.status>=400&&error.status<500)pending.current=null;setError(error.message==='INVALID_INVENTORY_USER'?e.invalidUser:error.message==='VARIANT_CHANGED'?e.changedItem:inventoryApprovalError(error,a,t.failed));}
  }finally{locked.current=false;if(live.current)setBusy(false);}
 };
 const b=approvalBandText[languageCode]||approvalBandText.en;
 const canSave=Boolean(user&&items&&employees&&master&&validQuantity&&validVariant&&date&&(!needsPurchase||purchase&&purchaseRows&&!purchaseError));
 const summary=[{key:'drafter',label:b.drafter,name:approval?.drafter?.name||'—',status:'drafter'},...(approval?.stages||[]).map((stage,index,all)=>({key:stage.key,label:index===all.length-1?b.final:b.middle,name:stage.name||b[stage.role]||'—',status:stage.employeeId?'draft':'unconfirmed'}))];
 return <AppPageContainer keyboardEntry title={a.register} titleActions={<Stack direction="row" spacing={1}><Button disabled={unavailable} onClick={close}>{a.cancel}</Button><SaveButton type="submit" form="inventory-entry-form" disabled={unavailable||!canSave}>{t.save}</SaveButton></Stack>}><PageContentStack>
  {error&&!approvalOpen&&<AppNotice severity="error" action={<Button onClick={()=>pending.current?save():(setError(''),setReload(n=>n+1))}>{t.retry}</Button>}>{error}</AppNotice>}
  <Box component="form" id="inventory-entry-form" noValidate onSubmit={event=>{event.preventDefault();if(!unavailable&&canSave){setApprovalOnly(false);setApprovalOpen(true);}}}><Paper variant="outlined" sx={{overflow:'hidden',borderRadius:2.5}}>
  <DocumentEntryHeader approval={<ApprovalLineSummary cells={summary} languageCode={languageCode} label={a.settings} disabled={unavailable||!approval} onClick={()=>{setApprovalOnly(true);setApprovalOpen(true);}}/>}>
  <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
   <CustomDatePicker label={dateLabel} value={date} adapterLocale={languageCode} disabled={unavailable} slotProps={{textField:{fullWidth:true,size:'small'}}} onChange={(value,context)=>{if(value?.isValid()&&!context?.validationError)setDate(value.format('YYYY-MM-DD'));}}/>

  </Stack></DocumentEntryHeader>
  <Box sx={{p:2}}><Stack spacing={2}>
  {(!items||!employees)&&!error&&<LinearProgress/>}
  <TableContainer data-testid="inventory-entry-lines"><Table data-table-kind="entry" size="small" data-table-layout="wide" sx={{minWidth:1000,tableLayout:'fixed','& th,& td':{px:1},'& td':{verticalAlign:'top'},'& .MuiFormControl-root':{minWidth:0}}}>
   <colgroup><col style={{width:216}}/><col style={{width:132}}/><col/>{colorMode!=='HIDDEN'&&<col style={{width:180}}/>}<col style={{width:140}}/><col style={{width:100}}/></colgroup>
   <TableHead><TableRow>{[e.user,e.direction,e.material,...(colorMode!=='HIDDEN'?[t.color]:[]),qty,t.unit].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
   <TableBody><TableRow>
    <TableCell>{lookup(e.user,employees||[],user,setUser,languageCode,row=>row.name||row.employeeNo||'',{hideLabel:true,required:true,disabled:unavailable||!employees,getCode:row=>row.employeeNo,columns:[{key:'code',label:e.employeeNo,value:row=>row.employeeNo},{key:'name',label:e.user,value:row=>row.name}]})}</TableCell>
    <TableCell><TextField id="inventory-entry-direction" select size="small" value={direction} slotProps={{select:{inputProps:{'aria-label':e.direction}}}} disabled={unavailable} onChange={e=>setDirection(e.target.value)} fullWidth><MenuItem value="IN">{receipt}</MenuItem><MenuItem value="OUT">{issue}</MenuItem></TextField></TableCell>
    <TableCell><ExpenseLookupField label={e.material} hideLabel required disabled={unavailable||!items} options={items||[]} value={selectedItem} onChange={setSelectedItem} languageCode={languageCode} getCode={row=>row.master.baseSnapshot.code} getOptionLabel={row=>[row.master.baseSnapshot.code,materialItemName(row.master,languageCode),variantName(row.attributes,languageCode)].filter(Boolean).join(' / ')} columns={[{key:'code',label:t.code,value:row=>row.master.baseSnapshot.code},{key:'name',label:t.name,value:row=>materialItemName(row.master,languageCode)},{key:'owner',label:ownerLabel,value:row=>ownerName(row.attributes.owner,languageCode)},{key:'type',label:typeLabel,value:row=>materialItemName(row.attributes.type,languageCode)},{key:'color',label:t.color,value:row=>[row.attributes.color?.code,materialItemName(row.attributes.color,languageCode)].filter(Boolean).join(' / ')}]}/></TableCell>
    {colorMode!=='HIDDEN'&&<TableCell><ExpenseLookupField label={t.color} hideLabel required={colorMode==='REQUIRED'} disabled={unavailable||!stockOptions} options={stockOptions?.colors||[]} value={color} onChange={setColor} languageCode={languageCode} getCode={row=>row.code} getOptionLabel={row=>[row.code,materialItemName(row,languageCode)].filter(Boolean).join(' / ')} columns={[{key:'code',label:t.code,value:row=>row.code},{key:'name',label:t.color,value:row=>materialItemName(row,languageCode)}]}/>{colorError&&<AppNotice severity="error" action={<Button onClick={()=>setColorReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}</TableCell>}
    <TableCell><TextField required fullWidth size="small" value={quantity} disabled={unavailable} slotProps={{htmlInput:{inputMode:'decimal','aria-label':qty}}} onChange={event=>setQuantity(event.target.value)}/></TableCell>
    <TableCell><TextField fullWidth size="small" value={master?materialItemName(master.data.unit,languageCode):''} slotProps={{input:{readOnly:true},htmlInput:{'aria-label':t.unit}}}/></TableCell>
   </TableRow></TableBody>
  </Table></TableContainer>
  {items?.length===0&&<AppNotice severity="warning">{e.noItems}</AppNotice>}
  {needsPurchase&&<Stack spacing={1}>
   <ExpenseLookupField label={a.purchase} required disabled={unavailable||!purchaseRows||Boolean(purchaseError)} languageCode={languageCode} options={purchaseRows||[]} value={purchase} onChange={setPurchase} getOptionKey={row=>row.expenseItemId} getCode={row=>(row.managementNumber||String(row.requestId))+'-'+row.line} getOptionLabel={row=>[row.managementNumber||row.requestId,row.line,row.description].join(' · ')} columns={[{key:'number',label:a.purchase,value:row=>row.managementNumber||row.requestId},{key:'date',label:dateLabel,value:row=>row.requestDate},{key:'description',label:t.name,value:row=>row.description},{key:'quantity',label:qty,value:row=>row.quantity}]}/>
   {purchaseError&&<AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{purchaseError}</AppNotice>}
   {purchaseRows?.length===0&&<AppNotice severity="warning">{a.purchaseEmpty}</AppNotice>}
  </Stack>}
  </Stack></Box>
  <Box sx={{p:3,bgcolor:'grey.50',borderTop:1,borderColor:'divider'}}><TextField fullWidth size="small" label={e.remark} multiline minRows={2} value={remark} disabled={unavailable} slotProps={{htmlInput:{maxLength:500}}} onChange={e=>setRemark(e.target.value)}/>
 </Box></Paper></Box>
 <Dialog open={approvalOpen} fullWidth maxWidth="md" onClose={()=>{if(!unavailable)setApprovalOpen(false);}}><DialogTitle>{a.title} · {a.CREATE}</DialogTitle><DialogContent><Stack spacing={2}>
  <Typography variant="body2">{[date,user?.name,direction==='IN'?receipt:issue,master&&materialItemName(master,languageCode),variant&&variantName(variant.attributes,languageCode),quantity,master&&materialItemName(master.data.unit,languageCode)].filter(Boolean).join(' · ')}</Typography>
  {!approval&&!error&&<LinearProgress/>}
  {approval?.automatic&&<Typography variant="body2">{(approvalVacancyText[languageCode]||approvalVacancyText.en).automatic}</Typography>}
  {approval&&<ApprovalStageFlow drafter={approval.drafter} stages={approval.stages.map(stage=>({...stage,candidates:stage.candidates||[{id:stage.employeeId,name:stage.name}]}))} languageCode={languageCode} value={approvalSelection} onChange={(key,id)=>setApprovalSelection(current=>({...current,[key+'EmployeeId']:id}))} disabled={unavailable}/>}
  {error&&<AppNotice severity="error" action={<Button disabled={busy} onClick={()=>pending.current?save():setReload(n=>n+1)}>{t.retry}</Button>}>{error}</AppNotice>}
 </Stack></DialogContent><DialogActions><Button variant="outlined" disabled={unavailable} onClick={()=>setApprovalOpen(false)}>{a.cancel}</Button><SaveButton loading={busy} disabled={!approval||!!error&&!pending.current||approval.stages.some(stage=>!stage.employeeId)} onClick={()=>approvalOnly?setApprovalOpen(false):save()}>{pending.current&&error?t.retry:approvalOnly?t.save:a.submit}</SaveButton></DialogActions></Dialog></PageContentStack></AppPageContainer>;
}

export function InventoryRows({view,keyword='',start='',end=''}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage();
 const t=materialItemText[languageCode]||materialItemText.en;
 const [, ,itemLabel,, , ,qty,dateLabel,remarkLabel]=labels[languageCode]||labels.en;
 const [rows,setRows]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const history=view==='history',location=useLocation(),variantId=new URLSearchParams(location.search).get('variantId')||undefined;
 const a=inventoryApprovalText[languageCode]||inventoryApprovalText.en;
 const [deleting,setDeleting]=useState(null),[classifying,setClassifying]=useState(null);
 const c=inventoryColorText[languageCode]||inventoryColorText.en;
 useEffect(()=>{
  let active=true;
  setError(false);setLoading(true);
  requestJSON('/inventory-entry/'+(history?'history':'stock')+buildQueryString({orgId,...(history&&variantId?{variantId}:{})}),{skipCache:true}).then(data=>{if(active)setRows(data);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[orgId,history,reload,variantId]);
 useWorkspaceRefreshOnEvent({orgId,topics:[history?'inventory-movements':'inventory-stock'],isBlocked:Boolean(classifying),onRefresh:()=>setReload(n=>n+1)});
 const columns=[...(history?[dateLabel,(inventoryEntryText[languageCode]||inventoryEntryText.en).user]:[]),masterLabels[languageCode]||masterLabels.en,itemLabel,qty,t.unit,...(history?[a.purchase,remarkLabel,a.status,a.actions]:[t.color,a.actions])];
 const displayed=rows?.filter(row=>(!history||(!start||row.date>=start)&&(!end||row.date<=end))&&[row.master.baseSnapshot.code,materialItemName(row.master,languageCode),variantName(row.attributes,languageCode),row.remark,row.userSnapshot?.name,row.userSnapshot?.employeeNo].join(' ').toLowerCase().includes(keyword.trim().toLowerCase()));
 return <Stack spacing={2}>{error&&<AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}{history&&<InventoryApprovalPanel onChanged={()=>setReload(n=>n+1)}/>}{!history&&<><StockColorHistory orgId={orgId} languageCode={languageCode}/>{rows?.some(row=>row.colorMissing)&&<AppNotice severity="warning">{c.missing}</AppNotice>}</>}<TableContainer component={Paper} variant="outlined" aria-busy={loading}><Table data-table-kind="summary" size="small">
  <TableHead><TableRow>{columns.map((column,index)=><TableCell key={column} sx={history&&index===columns.length-1?{position:'sticky',right:0,bgcolor:'background.paper'}:undefined}>{column}</TableCell>)}</TableRow></TableHead>
  <TableBody>{displayed?.map(row=><TableRow key={row.id}>
   {history&&<><TableCell>{row.date}</TableCell><TableCell>{row.userSnapshot?[row.userSnapshot.employeeNo,row.userSnapshot.name].filter(Boolean).join(' / '):'\u2014'}</TableCell></>}<TableCell>{materialItemName(row.master,languageCode)}</TableCell>
   <TableCell>{variantName(row.attributes,languageCode)}</TableCell><TableCell>{quantityText(row.quantity)}</TableCell>
   <TableCell>{materialItemName(row.master.unit,languageCode)}</TableCell>{!history&&<><TableCell>{materialItemName(row.attributes.color,languageCode)||row.attributes.color?.code||'\u2014'}</TableCell><TableCell>{row.colorMissing&&<Button onClick={()=>setClassifying(row)}>{c.classify}</Button>}</TableCell></>}{history&&<><TableCell>{row.purchaseSnapshot?[row.purchaseSnapshot.managementNumber||row.purchaseSnapshot.requestId,row.purchaseSnapshot.line].join(' / '):'\u2014'}</TableCell><TableCell>{row.remark}</TableCell><TableCell>{row.deletePending?a.DELETE+' \u00b7 '+a.PENDING:a[row.status]}</TableCell><TableCell sx={{position:'sticky',right:0,bgcolor:'background.paper'}}><Button disabled={row.deletePending} onClick={()=>setDeleting(row)}>{a.delete}</Button></TableCell></>}
  </TableRow>)}{(loading||error||!displayed?.length)&&<TableStatusRow colSpan={columns.length} languageCode={languageCode} loading={loading} error={error} onRetry={()=>setReload(n=>n+1)}/>}</TableBody>
 </Table></TableContainer>{classifying&&<StockColorDialog row={classifying} orgId={orgId} languageCode={languageCode} onClose={()=>setClassifying(null)} onSaved={()=>{setClassifying(null);setReload(n=>n+1);}}/>}{deleting&&<InventoryDeleteDialog row={deleting} onClose={()=>setDeleting(null)} onSaved={()=>{setDeleting(null);setReload(n=>n+1);}}/>}</Stack>;
}
