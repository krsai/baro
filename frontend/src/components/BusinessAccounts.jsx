import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DragIndicator from '@mui/icons-material/DragIndicator';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import EntityDetailSection from './EntityDetailSection';
import {useAuth} from '../context/AuthContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {bankLedgerMessages} from '../constants/bankLedgerMessages';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
const COPY={
 ko:{kind:'구분',BANK:'은행',CASH:'현금',name:'계좌명',help:'같은 통화의 계좌도 여러 개 등록할 수 있습니다. 손잡이를 드래그하고 순서를 저장하세요.',order:'순서 저장',opening:'입출금 기초잔액 설정',openingHelp:'기준일과 기초잔액을 입력하면 입출금에 사용됩니다. 저장한 기초잔액은 변경하지 않습니다.',move:'계좌 순서 이동'},
 en:{kind:'Type',BANK:'Bank',CASH:'Cash',name:'Account name',help:'Multiple accounts can use the same currency. Drag handles to reorder, then save the order.',order:'Save order',opening:'Opening balance for transactions',openingHelp:'Enter the opening date and balance to use this account for transactions. Saved opening balances remain unchanged.',move:'Move account'},
 vi:{kind:'Loại',BANK:'Ngân hàng',CASH:'Tiền mặt',name:'Tên tài khoản',help:'Có thể đăng ký nhiều tài khoản cùng loại tiền. Kéo để sắp xếp rồi lưu thứ tự.',order:'Lưu thứ tự',opening:'Số dư đầu kỳ giao dịch',openingHelp:'Nhập ngày và số dư đầu kỳ để ghi giao dịch. Số dư đã lưu được giữ nguyên.',move:'Di chuyển tài khoản'},
};
export default function BusinessAccounts({entityId,orgId,languageCode='ko',onAccountsChange}){
 const {activeOrgId}=useAuth(),scope=orgId||activeOrgId||entityId,labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,t=COPY[languageCode]||COPY.en,money=bankLedgerMessages[languageCode]||bankLedgerMessages.en;
 const [data,setData]=useState({accounts:[],currencies:[]}),[savedOrder,setSavedOrder]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
 const callback=useRef(onAccountsChange);callback.current=onAccountsChange;const scopeRef=useRef('');scopeRef.current=`${scope}:${entityId}`;
 const query=buildQueryString({orgId:scope}),path=`/entities/${entityId}/bank-accounts`,self=Number(scope)===Number(entityId)&&data.canLedger;
 const order=JSON.stringify(data.accounts.map(row=>row.id)),dirty=!!savedOrder&&order!==savedOrder;useUnsavedChanges(dirty);
 useEffect(()=>{setDraft(null);setData({accounts:[],currencies:[]});setSavedOrder('');setSaving(false);if(!entityId)return;let alive=true;setLoading(true);setError('');
  requestJSON(`${path}${query}`,{skipCache:true}).then(result=>{if(alive){setData(result);setSavedOrder(JSON.stringify(result.accounts.map(row=>row.id)));callback.current?.(result.accounts);}}).catch(()=>{if(alive)setError(labels.error);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[entityId,scope,reload]);
 const save=async(value,isOrder=false)=>{if(saving)return;const token=scopeRef.current;setSaving(true);setError('');try{
  await requestJSON(`${path}${isOrder?'/order':value.id?`/${encodeURIComponent(value.id)}`:''}${query}`,{method:isOrder||value.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(token!==scopeRef.current)return;setDraft(null);setReload(n=>n+1);emitWorkspaceDataChanged({orgId:scope,topics:['business-partners'],source:'business-accounts'});
 }catch(e){if(token===scopeRef.current)setError(money.errors[e.message]||`${labels.error} ${e.message||''}`);}finally{if(token===scopeRef.current)setSaving(false);}};
 const linked=draft?.ledgerAccounts?.[0];
 const valid=draft&&draft.currencyId&&(draft.accountKind==='CASH'?draft.displayName?.trim():['bankName','accountNumber','accountHolder'].every(key=>draft[key]?.trim()))&&(!self||(!draft.openingDate&&!draft.openingBalance)||(draft.openingDate&&draft.openingBalance!==''));
 const edit=account=>{const ledger=account.ledgerAccounts?.[0];setDraft({...account,openingDate:ledger?.openingDate||'',openingBalance:ledger?String(ledger.openingBalance):''});};
 const submit=()=>{const value={...draft};if(!self||(!value.openingDate&&!value.openingBalance)){delete value.openingDate;delete value.openingBalance;}save(value);};
 return <EntityDetailSection title={labels.banks}>
  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{mb:2}}><Typography variant="caption" color="text.secondary">{t.help}</Typography><Stack direction="row" spacing={1}>{dirty&&<Button onClick={()=>save({ids:data.accounts.map(row=>row.id),revision:data.revision},true)} disabled={saving}>{t.order}</Button>}<Button disabled={!entityId||loading||saving||dirty} onClick={()=>edit({accountKind:Number(scope)===Number(entityId)?'CASH':'BANK',displayName:'',bankName:'',accountNumber:'',accountHolder:'',currencyId:data.currencies.find(row=>row.code==='VND')?.id||data.currencies[0]?.id||''})}>{labels.add}</Button></Stack></Stack>
  {error&&<Alert severity="error">{error}</Alert>}
  {!entityId?<Typography>{labels.firstSave}</Typography>:loading?<CircularProgress size={20}/>:<DragDropContext onDragEnd={({source,destination})=>{if(!destination||source.index===destination.index||saving)return;setData(current=>{const accounts=[...current.accounts];accounts.splice(destination.index,0,accounts.splice(source.index,1)[0]);return {...current,accounts};});}}><TableContainer><Table size="small" sx={{minWidth:650}}><TableHead><TableRow>{['',labels.currency,t.kind,t.name,labels.bank,labels.number,labels.holder,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><Droppable droppableId="business-accounts">{provided=><TableBody ref={provided.innerRef} {...provided.droppableProps}>
   {data.accounts.map((account,index)=><Draggable key={account.id} draggableId={account.id} index={index} isDragDisabled={saving}>{drag=><TableRow ref={drag.innerRef} {...drag.draggableProps} data-account-id={account.id}><TableCell {...drag.dragHandleProps} aria-label={t.move}><DragIndicator fontSize="small"/></TableCell><TableCell>{account.currency.code}</TableCell><TableCell>{t[account.accountKind||'BANK']}</TableCell><TableCell>{account.displayName||'—'}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.bankName}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountNumber}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountHolder}</TableCell><TableCell><Button aria-label={labels.edit} disabled={saving||dirty} onClick={()=>edit(account)} sx={{minWidth:32,p:.5}}><EditOutlined fontSize="small"/></Button></TableCell></TableRow>}</Draggable>)}{provided.placeholder}
   {!data.accounts.length&&<TableRow><TableCell colSpan={8}>{labels.empty}</TableCell></TableRow>}
  </TableBody>}</Droppable></Table></TableContainer></DragDropContext>}
  <Dialog open={!!draft} onClose={()=>!saving&&setDraft(null)} scroll="paper" fullWidth maxWidth="sm"><DialogTitle>{draft?.id?labels.edit:labels.add}</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
   <TextField select label={t.kind} value={draft?.accountKind||'BANK'} disabled={saving||!!linked} onChange={e=>setDraft({...draft,accountKind:e.target.value})}>{['CASH','BANK'].map(kind=><MenuItem key={kind} value={kind}>{t[kind]}</MenuItem>)}</TextField>
   <TextField label={t.name} required={draft?.accountKind==='CASH'} value={draft?.displayName||''} disabled={saving} inputProps={{maxLength:160}} onChange={e=>setDraft({...draft,displayName:e.target.value})}/>
   <TextField select label={labels.currency} value={draft?.currencyId||''} disabled={saving||!!linked} onChange={e=>setDraft({...draft,currencyId:Number(e.target.value)})}>{data.currencies.map(row=><MenuItem key={row.id} value={row.id}>{row.code}</MenuItem>)}</TextField>
   {draft?.accountKind!=='CASH'&&['bankName','accountNumber','accountHolder'].map((key,index)=><TextField key={key} required disabled={saving||!!linked&&key!=='accountHolder'} label={labels[['bank','number','holder'][index]]} value={draft?.[key]||''} inputProps={{maxLength:{bankName:120,accountNumber:100,accountHolder:160}[key]}} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>)}
   {self&&<><Typography variant="subtitle2">{t.opening}</Typography><Typography variant="caption">{t.openingHelp}</Typography><TextField type="date" label={money.openingDate} InputLabelProps={{shrink:true}} value={draft?.openingDate||''} disabled={saving||!!linked} onChange={e=>setDraft({...draft,openingDate:e.target.value})}/><TextField label={money.openingBalance} value={draft?.openingBalance||''} disabled={saving||!!linked} inputProps={{inputMode:'decimal'}} onChange={e=>setDraft({...draft,openingBalance:e.target.value})}/></>}
   {error&&<Alert severity="error">{error}</Alert>}
  </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={()=>setDraft(null)}>{labels.cancel}</Button><Button variant="contained" disabled={!valid||saving} onClick={submit}>{labels.save}</Button></DialogActions></Dialog>
 </EntityDetailSection>;
}
