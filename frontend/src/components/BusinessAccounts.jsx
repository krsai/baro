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
import {useRequestScopeContext} from '../context/RequestScopeContext';
const COPY={
 ko:{kind:'구분',BANK:'은행',CASH:'현금',name:'계좌명',cashHint:'현금 계정에는 은행·계좌번호·예금주를 입력하지 않습니다.',readOnly:'계좌 정보는 회사 관리자만 등록·수정할 수 있습니다.',help:'같은 통화의 계좌도 여러 개 등록할 수 있습니다. 손잡이를 드래그하고 순서를 저장하세요.',order:'순서 저장',move:'계좌 순서 이동'},
 en:{kind:'Type',BANK:'Bank',CASH:'Cash',name:'Account name',cashHint:'Cash accounts do not have bank, account number or account holder fields.',readOnly:'Only company administrators can add or edit account information.',help:'Multiple accounts can use the same currency. Drag handles to reorder, then save the order.',order:'Save order',move:'Move account'},
 vi:{kind:'Loại',BANK:'Ngân hàng',CASH:'Tiền mặt',name:'Tên tài khoản',cashHint:'Quỹ tiền mặt không có ngân hàng, số tài khoản hoặc chủ tài khoản.',readOnly:'Chỉ quản trị viên công ty được thêm hoặc sửa thông tin tài khoản.',help:'Có thể đăng ký nhiều tài khoản cùng loại tiền. Kéo để sắp xếp rồi lưu thứ tự.',order:'Lưu thứ tự',move:'Di chuyển tài khoản'},
};
const LOAD_COPY={ko:{retry:'다시 불러오기',empty:'공통 통화 목록을 불러오지 못했습니다. 다시 불러온 뒤 계좌를 등록해 주세요.'},en:{retry:'Reload',empty:'The shared currency list is unavailable. Reload before adding an account.'},vi:{retry:'Tải lại',empty:'Không thể tải danh sách tiền tệ dùng chung. Hãy tải lại trước khi thêm tài khoản.'}};
export default function BusinessAccounts({entityId,orgId,languageCode='ko',onAccountsChange}){
 const {activeOrgId,activeOrgRole}=useAuth(),canManage=activeOrgRole==='ADMIN',scope=orgId||activeOrgId||entityId,labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,t=COPY[languageCode]||COPY.en,money=bankLedgerMessages[languageCode]||bankLedgerMessages.en;
 const {active}=useRequestScopeContext();
 const [ready,setReady]=useState(false);
 const loadText=LOAD_COPY[languageCode]||LOAD_COPY.en;
 const [data,setData]=useState({accounts:[],currencies:[]}),[savedOrder,setSavedOrder]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
 const callback=useRef(onAccountsChange);callback.current=onAccountsChange;const scopeRef=useRef('');scopeRef.current=`${scope}:${entityId}`;
 const query=buildQueryString({orgId:scope}),path=`/entities/${entityId}/bank-accounts`;
 const order=JSON.stringify(data.accounts.map(row=>row.id)),dirty=!!savedOrder&&order!==savedOrder;useUnsavedChanges(dirty);
 useEffect(()=>{setDraft(null);setReady(false);setData({accounts:[],currencies:[]});setSavedOrder('');setSaving(false);if(!entityId||!active)return;let alive=true;setLoading(true);setError('');
  requestJSON(`${path}${query}`,{skipCache:true}).then(result=>{if(alive){if(!Array.isArray(result?.accounts)||!Array.isArray(result?.currencies)||!result.currencies.length)throw new Error('CURRENCY_LIST_UNAVAILABLE');setData(result);setReady(true);setSavedOrder(JSON.stringify(result.accounts.map(row=>row.id)));callback.current?.(result.accounts);}}).catch(()=>{if(alive)setError(loadText.empty);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[entityId,scope,reload,active]);
 const save=async(value,isOrder=false)=>{if(saving||!canManage)return;const token=scopeRef.current;setSaving(true);setError('');try{
  await requestJSON(`${path}${isOrder?'/order':value.id?`/${encodeURIComponent(value.id)}`:''}${query}`,{method:isOrder||value.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(token!==scopeRef.current)return;setDraft(null);setReload(n=>n+1);emitWorkspaceDataChanged({orgId:scope,topics:['business-partners'],source:'business-accounts'});
 }catch(e){if(token===scopeRef.current)setError(money.errors[e.message]||`${labels.error} ${e.message||''}`);}finally{if(token===scopeRef.current)setSaving(false);}};

 const valid=draft&&draft.currencyId&&(draft.accountKind==='CASH'?draft.displayName?.trim():['bankName','accountNumber','accountHolder'].every(key=>draft[key]?.trim()));
 const edit=account=>{if(canManage)setDraft({...account});};
 const addBank=()=>edit({accountKind:'BANK',displayName:'',bankName:'',accountNumber:'',accountHolder:'',currencyId:draft?.currencyId||data.currencies.find(row=>row.code==='VND')?.id||data.currencies[0]?.id||''});
 const submit=()=>save(draft);
 return <EntityDetailSection title={labels.banks}>
  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{mb:2}}><Typography variant="caption" color="text.secondary">{canManage?t.help:t.readOnly}</Typography><Stack direction="row" spacing={1}>{dirty&&<Button onClick={()=>save({ids:data.accounts.map(row=>row.id),revision:data.revision},true)} disabled={saving||!canManage}>{t.order}</Button>}<Button disabled={!entityId||!ready||loading||saving||dirty||!canManage} onClick={addBank}>{labels.add}</Button></Stack></Stack>
  {error&&<Alert severity="error" action={!ready&&<Button color="inherit" onClick={()=>setReload(n=>n+1)}>{loadText.retry}</Button>}>{error}</Alert>}
  {!entityId?<Typography>{labels.firstSave}</Typography>:loading?<CircularProgress size={20}/>:<DragDropContext onDragEnd={({source,destination})=>{if(!destination||source.index===destination.index||saving||!canManage)return;setData(current=>{const accounts=[...current.accounts];accounts.splice(destination.index,0,accounts.splice(source.index,1)[0]);return {...current,accounts};});}}><TableContainer><Table size="small" sx={{minWidth:650}}><TableHead><TableRow>{['',labels.currency,t.kind,t.name,labels.bank,labels.number,labels.holder,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><Droppable droppableId="business-accounts">{provided=><TableBody ref={provided.innerRef} {...provided.droppableProps}>
   {data.accounts.map((account,index)=><Draggable key={account.id} draggableId={account.id} index={index} isDragDisabled={saving||!canManage}>{drag=><TableRow ref={drag.innerRef} {...drag.draggableProps} data-account-id={account.id}><TableCell {...drag.dragHandleProps} aria-label={t.move}><DragIndicator fontSize="small"/></TableCell><TableCell>{account.currency.code}</TableCell><TableCell>{t[account.accountKind||'BANK']}</TableCell><TableCell>{account.displayName||'—'}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.bankName}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountNumber}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountHolder}</TableCell><TableCell><Button aria-label={labels.edit} disabled={saving||dirty||!canManage} onClick={()=>edit(account)} sx={{minWidth:32,p:.5}}><EditOutlined fontSize="small"/></Button></TableCell></TableRow>}</Draggable>)}{provided.placeholder}
   {!data.accounts.length&&<TableRow><TableCell colSpan={8}>{labels.empty}</TableCell></TableRow>}
  </TableBody>}</Droppable></Table></TableContainer></DragDropContext>}
  <Dialog open={!!draft} onClose={()=>!saving&&setDraft(null)} scroll="paper" fullWidth maxWidth="sm"><DialogTitle>{draft?.id?labels.edit:labels.add}</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
   <TextField select label={t.kind} value={draft?.accountKind||'BANK'} disabled={saving||!canManage} onChange={e=>setDraft({...draft,accountKind:e.target.value})}>{['CASH','BANK'].map(kind=><MenuItem key={kind} value={kind}>{t[kind]}</MenuItem>)}</TextField>
   <TextField label={t.name} required={draft?.accountKind==='CASH'} value={draft?.displayName||''} disabled={saving||!canManage} inputProps={{maxLength:160}} onChange={e=>setDraft({...draft,displayName:e.target.value})}/>
   <TextField select label={labels.currency} value={draft?.currencyId||''} disabled={saving||!canManage} onChange={e=>setDraft({...draft,currencyId:Number(e.target.value)})}>{data.currencies.map(row=><MenuItem key={row.id} value={row.id}>{row.code}</MenuItem>)}</TextField>
   {draft?.accountKind!=='CASH'&&['bankName','accountNumber','accountHolder'].map((key,index)=><TextField key={key} required disabled={saving||!canManage} label={labels[['bank','number','holder'][index]]} value={draft?.[key]||''} inputProps={{maxLength:{bankName:120,accountNumber:100,accountHolder:160}[key]}} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>)}
   {draft?.accountKind==='CASH'&&<Alert severity="info">{t.cashHint}</Alert>}
   {error&&<Alert severity="error" action={!ready&&<Button color="inherit" onClick={()=>setReload(n=>n+1)}>{loadText.retry}</Button>}>{error}</Alert>}
  </Stack></DialogContent><DialogActions><Button disabled={saving||!canManage} onClick={()=>setDraft(null)}>{labels.cancel}</Button><Button variant="contained" disabled={!valid||saving||!canManage} onClick={submit}>{labels.save}</Button></DialogActions></Dialog>
 </EntityDetailSection>;
}
