import {inventoryApprovalText,inventoryApprovalError} from '../../../constants/inventoryApproval';
import ApprovalStageFlow from '../../../components/ApprovalStageFlow';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import InventoryApprovalPanel,{InventoryDeleteDialog} from './InventoryApprovalPanel';
import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField} from '@mui/material';
import {useNavigate} from 'react-router-dom';
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
import {EXPENSE_TEXT} from '../../../constants/expenseTypes';

const labels={
 ko:['\uc785\uace0','\ucd9c\uace0','\uac1c\ubcc4 \ud488\ubaa9','\uc0c8 \ud488\ubaa9 \ub4f1\ub85d','\uc18c\uc720\uc790','\ud0c0\uc785','\uc218\ub7c9','\ucc98\ub9ac\uc77c','\uba54\ubaa8','\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.','\uc785\ucd9c\uace0 \uc720\ud615'],
 en:['Receipt','Issue','Stock item','Register new item','Owner','Type','Quantity','Date','Remark','Movement saved.','Movement type'],
 vi:['Nh\u1eadp kho','Xu\u1ea5t kho','M\u1eb7t h\u00e0ng','\u0110\u0103ng k\u00fd m\u1eb7t h\u00e0ng m\u1edbi','Ch\u1ee7 s\u1edf h\u1eefu','Lo\u1ea1i','S\u1ed1 l\u01b0\u1ee3ng','Ng\u00e0y','Ghi ch\u00fa','\u0110\u00e3 l\u01b0u.','Lo\u1ea1i giao d\u1ecbch'],
};
const masterLabels={ko:'\uc790\uc7ac \ub9c8\uc2a4\ud130',en:'Material master',vi:'Danh m\u1ee5c v\u1eadt t\u01b0'};
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
 const [approval,setApproval]=useState(null),[approvalSelection,setApprovalSelection]=useState({});
 const t=materialItemText[languageCode]||materialItemText.en,d=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 const [receipt,issue,itemLabel,add,ownerLabel,typeLabel,qty,dateLabel,remarkLabel,saved,directionLabel]=labels[languageCode]||labels.en;
 const [masters,setMasters]=useState([]),[master,setMaster]=useState(null),[options,setOptions]=useState(null),[variant,setVariant]=useState(null),[creating,setCreating]=useState(false);
 const [owner,setOwner]=useState(null),[color,setColor]=useState(null),[type,setType]=useState(null),[dimensions,setDimensions]=useState({});
 const [direction,setDirection]=useState('IN'),[date,setDate]=useState(today),[quantity,setQuantity]=useState(''),[remark,setRemark]=useState('');
 const [purchase,setPurchase]=useState(null),[purchaseRows,setPurchaseRows]=useState(null),[purchaseError,setPurchaseError]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const pending=useRef(null),locked=useRef(false),live=useRef(true);
 const needsPurchase=direction==='IN'&&Number(creating?owner?.id:variant?.attributes.owner?.id)===Number(orgId);
 useEffect(()=>{setPurchase(null);},[master?.id,needsPurchase]);
 useEffect(()=>{
  let active=true;setPurchaseRows(null);setPurchaseError('');
  if(needsPurchase&&master)requestJSON('/inventory-entry/purchase-expenses'+buildQueryString({orgId,masterId:master.id}),{skipCache:true}).then(rows=>{if(active){setPurchaseRows(rows);setPurchase(current=>rows.find(row=>row.expenseItemId===current?.expenseItemId&&row.version===current?.version)||null);}}).catch(()=>{if(active)setPurchaseError(t.failed);});
  return()=>{active=false;};
 },[needsPurchase,master?.id,orgId,reload,t.failed]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useUnsavedChanges(Boolean(master||quantity||remark));
 const close=async()=>{if(busy||pending.current)return;if((!master&&!quantity&&!remark)||await dialogs.confirm('',{purpose:'discard'}))onClose?.();};
 useEffect(()=>{let active=true;setApproval(null);requestJSON('/inventory-entry/approval-preview'+buildQueryString({orgId,selection:JSON.stringify(approvalSelection)}),{skipCache:true}).then(value=>{if(active)setApproval(value);}).catch(e=>{if(active)setError(inventoryApprovalError(e,a,t.failed));});return()=>{active=false;};},[orgId,reload,a,t.failed,approvalSelection]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements'],isBlocked:Boolean(master||quantity||remark||busy),onRefresh:()=>setReload(n=>n+1)});
 useEffect(()=>{let active=true;request('/masters',orgId).then(rows=>{if(active)setMasters(rows);}).catch(()=>{if(active)setError(t.failed);});return()=>{active=false;};},[orgId,reload,t.failed]);
 useEffect(()=>{
  if(!master)return;
  let active=true;
  requestJSON('/inventory-entry/options'+buildQueryString({orgId,masterId:master.id}),{skipCache:true}).then(data=>{if(active)setOptions(data);}).catch(()=>{if(active)setError(t.failed);});
  return()=>{active=false;};
 },[orgId,master,reload,t.failed]);
 const selectMaster=row=>{
  setMaster(row);setOptions(null);setVariant(null);setCreating(false);setOwner(null);setColor(null);setType(null);setDimensions({});
 };
 const unavailable=busy||Boolean(pending.current),positive=/^\d{1,16}(\.\d{1,4})?$/;
 const validQuantity=positive.test(quantity)&&Number(quantity)>0;
 const validVariant=variant||creating&&owner&&(options?.fields.color!=='REQUIRED'||color)&&(options?.fields.type!=='REQUIRED'||type)&&(!options?.fields.dimensions||axes.every(axis=>positive.test(dimensions[axis]||'')&&Number(dimensions[axis])>0));
 const save=async()=>{
  if(locked.current||!master||!validQuantity||!validVariant||!approval||approval.stages.some(stage=>!stage.employeeId)||needsPurchase&&(!purchase||!purchaseRows||purchaseError))return;
  locked.current=true;setBusy(true);setError('');
  const payload=pending.current||{clientKey:crypto.randomUUID(),masterId:master.id,variantId:variant?.id??null,ownerId:owner?.id??null,colorId:color?.id??null,typeId:type?.id??null,expenseItemId:needsPurchase?purchase.expenseItemId:null,expenseRequestVersion:needsPurchase?purchase.version:null,approvalRevision:approval.policy.revision,approvalSelection:Object.fromEntries(approval.stages.map(stage=>[stage.key+'EmployeeId',stage.employeeId])),dimensions,date,quantity:(direction==='OUT'?'-':'')+quantity,remark};
  pending.current=payload;
  try{
   await request('',orgId,{method:'POST',body:JSON.stringify(payload)});
   if(!live.current)return;
   pending.current=null;
   emitWorkspaceDataChanged({orgId,topics:['inventory-movements','inventory-stock']});
   showNotification(a.submitted,'success');
   if(onSaved){onSaved();return;}
   if(navigateToPath)navigateToPath('/inventory/movements',{closeTabId:'/inventory/movements/new',skipUnsavedChangesCheck:true});
   else navigate('/inventory/movements');
  }catch(error){
   if(live.current){if(error.status>=400&&error.status<500)pending.current=null;setError(inventoryApprovalError(error,a,t.failed));}
  }finally{locked.current=false;if(live.current)setBusy(false);}
 };
 const fieldGrid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(3,minmax(0,1fr))'},gap:2};
 return <Dialog open fullWidth maxWidth="md" onClose={close}><DialogTitle>{a.register}</DialogTitle><DialogContent><Stack spacing={2.5} sx={{pt:1.5,pb:1}}>
  {error&&<AppNotice severity="error" action={<Button onClick={()=>pending.current?save():(setError(''),setReload(n=>n+1))}>{t.retry}</Button>}>{error}</AppNotice>}
  {!approval&&<Button onClick={()=>navigate('/approval-settings?menu=INVENTORY')}>{a.settings}</Button>}
  {approval&&<ApprovalStageFlow drafter={approval.drafter} stages={approval.stages.map(stage=>({...stage,candidates:stage.candidates||[{id:stage.employeeId,name:stage.name}]}))} languageCode={languageCode} value={approvalSelection} onChange={(key,id)=>setApprovalSelection(current=>({...current,[key+'EmployeeId']:id}))} disabled={unavailable}/>}
  {lookup(masterLabels[languageCode]||masterLabels.en,masters,master,selectMaster,languageCode,row=>[row.data.baseSnapshot.code,materialItemName(row,languageCode),materialItemName(row.data.unit,languageCode)].join(' \u00b7 '),{required:true,disabled:unavailable,getCode:row=>row.data.baseSnapshot.code})}
  {options&&<Stack direction={{xs:'column',sm:'row'}} spacing={2} alignItems={{sm:'center'}}>
   <Box sx={{flex:1}}>{lookup(itemLabel,options.variants,variant,row=>{setVariant(row);setCreating(false);},languageCode,row=>variantName(row.attributes,languageCode),{disabled:unavailable})}</Box>
   <Button variant="outlined" disabled={unavailable} onClick={()=>{setVariant(null);setCreating(true);}}>{add}</Button>
  </Stack>}
  {creating&&options&&<Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
   <Box sx={fieldGrid}>
    {lookup(ownerLabel,options.owners,owner,setOwner,languageCode,row=>ownerName(row,languageCode),{required:true,disabled:unavailable})}
    {options.fields.type!=='HIDDEN'&&lookup(typeLabel,options.types,type,setType,languageCode,row=>materialItemName(row,languageCode),{required:options.fields.type==='REQUIRED',disabled:unavailable})}
    {options.fields.color!=='HIDDEN'&&lookup(t.color,options.colors,color,setColor,languageCode,row=>row.code+' \u00b7 '+materialItemName(row,languageCode),{required:options.fields.color==='REQUIRED',disabled:unavailable})}
   </Box>
   {options.fields.dimensions&&<Box sx={fieldGrid}>{axes.map(axis=><TextField key={axis} required size="small" label={d[axis]} value={dimensions[axis]||''} disabled={unavailable} onChange={e=>setDimensions({...dimensions,[axis]:e.target.value})}/>)}</Box>}
  </Stack></Paper>}
  <Box sx={fieldGrid}>
   <TextField select size="small" value={direction} label={directionLabel} disabled={unavailable} onChange={e=>setDirection(e.target.value)}><MenuItem value="IN">{receipt}</MenuItem><MenuItem value="OUT">{issue}</MenuItem></TextField>
   <TextField required size="small" type="date" label={dateLabel} value={date} disabled={unavailable} slotProps={{inputLabel:{shrink:true}}} onChange={e=>setDate(e.target.value)}/>
   <TextField required size="small" label={qty} value={quantity} disabled={unavailable} onChange={e=>setQuantity(e.target.value)} helperText={master?materialItemName(master.data.unit,languageCode):undefined}/>
  </Box>
  {needsPurchase&&<Stack spacing={1}>
   <ExpenseLookupField label={a.purchase} required disabled={unavailable||!purchaseRows||Boolean(purchaseError)} languageCode={languageCode} options={purchaseRows||[]} value={purchase} onChange={setPurchase} getOptionKey={row=>row.expenseItemId} getCode={row=>(row.managementNumber||String(row.requestId))+'-'+row.line} getOptionLabel={row=>[row.managementNumber||row.requestId,row.line,row.description].join(' · ')} columns={[{key:'number',label:a.purchase,value:row=>row.managementNumber||row.requestId},{key:'date',label:dateLabel,value:row=>row.requestDate},{key:'description',label:t.name,value:row=>row.description},{key:'quantity',label:qty,value:row=>row.quantity}]}/>
   {purchaseError&&<AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{purchaseError}</AppNotice>}
   {purchaseRows?.length===0&&<AppNotice severity="warning">{a.purchaseEmpty}</AppNotice>}
  </Stack>}
  <TextField size="small" label={remarkLabel} value={remark} disabled={unavailable} slotProps={{htmlInput:{maxLength:500}}} onChange={e=>setRemark(e.target.value)}/>
 </Stack></DialogContent><DialogActions><Button variant="outlined" disabled={unavailable} onClick={close}>{a.cancel}</Button><SaveButton loading={busy} disabled={!master||!validQuantity||!validVariant||!date||!approval||approval.stages.some(stage=>!stage.employeeId)||needsPurchase&&(!purchase||!purchaseRows||Boolean(purchaseError))} onClick={save}>{a.submit}</SaveButton></DialogActions></Dialog>;
}

export function InventoryRows({view,keyword='',start='',end=''}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage();
 const t=materialItemText[languageCode]||materialItemText.en;
 const [, ,itemLabel,, , ,qty,dateLabel,remarkLabel]=labels[languageCode]||labels.en;
 const [rows,setRows]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const history=view==='history';
 const a=inventoryApprovalText[languageCode]||inventoryApprovalText.en;
 const [deleting,setDeleting]=useState(null);
 useEffect(()=>{
  let active=true;
  setError(false);
  request(history?'/history':'/stock',orgId).then(data=>{if(active)setRows(data);}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[orgId,history,reload]);
 useWorkspaceRefreshOnEvent({orgId,topics:[history?'inventory-movements':'inventory-stock'],onRefresh:()=>setReload(n=>n+1)});
 const columns=[...(history?[dateLabel]:[]),masterLabels[languageCode]||masterLabels.en,itemLabel,qty,t.unit,...(history?[a.purchase,remarkLabel,a.status,a.actions]:[])];
 const displayed=rows?.filter(row=>(!history||(!start||row.date>=start)&&(!end||row.date<=end))&&[row.master.baseSnapshot.code,materialItemName(row.master,languageCode),variantName(row.attributes,languageCode),row.remark].join(' ').toLowerCase().includes(keyword.trim().toLowerCase()));
 if(error)return <AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>;
 return <Stack spacing={2}>{history&&<InventoryApprovalPanel onChanged={()=>setReload(n=>n+1)}/>}<TableContainer component={Paper} variant="outlined"><Table size="small">
  <TableHead><TableRow>{columns.map((column,index)=><TableCell key={column} sx={history&&index===columns.length-1?{position:'sticky',right:0,bgcolor:'background.paper'}:undefined}>{column}</TableCell>)}</TableRow></TableHead>
  <TableBody>{displayed?.map(row=><TableRow key={row.id}>
   {history&&<TableCell>{row.date}</TableCell>}<TableCell>{materialItemName(row.master,languageCode)}</TableCell>
   <TableCell>{variantName(row.attributes,languageCode)}</TableCell><TableCell>{quantityText(row.quantity)}</TableCell>
   <TableCell>{materialItemName(row.master.unit,languageCode)}</TableCell>{history&&<><TableCell>{row.purchaseSnapshot?[row.purchaseSnapshot.managementNumber||row.purchaseSnapshot.requestId,row.purchaseSnapshot.line].join(' / '):'\u2014'}</TableCell><TableCell>{row.remark}</TableCell><TableCell>{row.deletePending?a.DELETE+' \u00b7 '+a.PENDING:a[row.status]}</TableCell><TableCell sx={{position:'sticky',right:0,bgcolor:'background.paper'}}><Button disabled={row.deletePending} onClick={()=>setDeleting(row)}>{a.delete}</Button></TableCell></>}
  </TableRow>)}{rows&&!displayed.length&&<TableRow><TableCell colSpan={columns.length}>{t.empty}</TableCell></TableRow>}</TableBody>
 </Table></TableContainer>{deleting&&<InventoryDeleteDialog row={deleting} onClose={()=>setDeleting(null)} onSaved={()=>{setDeleting(null);setReload(n=>n+1);}}/>}</Stack>;
}
