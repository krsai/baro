import BankAccountEditorDialog from './BankAccountEditorDialog';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
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
const PENDING_COPY={ko:'입력한 계좌는 거래처 등록 시 함께 저장됩니다.',en:'These accounts will be saved when you register the partner.',vi:'Các tài khoản sẽ được lưu cùng khi đăng ký đối tác.'};
export default function BusinessAccounts({entityId,orgId,languageCode='ko',onAccountsChange,hideGuidance=false,pendingAccounts=[],onPendingAccountsChange,disabled=false}){
 const pending=!entityId&&typeof onPendingAccountsChange==='function';
 const {activeOrgId,activeOrgRole}=useAuth(),scope=orgId||activeOrgId||entityId,canManage=activeOrgRole==='ADMIN'||(Number(entityId)!==Number(scope)&&['ACCOUNTANT','OPERATOR'].includes(activeOrgRole)),labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,t=COPY[languageCode]||COPY.en,money=bankLedgerMessages[languageCode]||bankLedgerMessages.en;
 const {active}=useRequestScopeContext();
 const [ready,setReady]=useState(false);
 const loadText=LOAD_COPY[languageCode]||LOAD_COPY.en;
 const [data,setData]=useState({accounts:[],currencies:[]}),[savedOrder,setSavedOrder]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[reload,setReload]=useState(0);
 const callback=useRef(onAccountsChange);callback.current=onAccountsChange;const scopeRef=useRef('');scopeRef.current=`${scope}:${entityId}`;
 const query=buildQueryString({orgId:scope}),path=`/entities/${entityId}/bank-accounts`;
 const order=JSON.stringify(data.accounts.map(row=>row.id)),dirty=!pending&&!!savedOrder&&order!==savedOrder;useUnsavedChanges(dirty);
 useEffect(()=>{setDraft(null);setReady(false);setData({accounts:[],currencies:[]});setSavedOrder('');setSaving(false);if((!entityId&&!pending)||!active)return;let alive=true;setLoading(true);setError('');
  (pending?requestJSON('/bank-account-currencies'+query,{skipCache:true}).then(currencies=>({accounts:pendingAccounts,currencies})):requestJSON(`${path}${query}`,{skipCache:true})).then(result=>{if(alive){if(!Array.isArray(result?.accounts)||!Array.isArray(result?.currencies)||!result.currencies.length)throw new Error('CURRENCY_LIST_UNAVAILABLE');setData(result);setReady(true);setSavedOrder(JSON.stringify(result.accounts.map(row=>row.id)));if(!pending)callback.current?.(result.accounts);}}).catch(()=>{if(alive)setError(loadText.empty);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[entityId,scope,reload,active,pending]);
 const save=async(value,isOrder=false)=>{if(saving||disabled||!canManage)return;const token=scopeRef.current;setSaving(true);setError('');try{
  if(pending){const account={...value,id:value.id||crypto.randomUUID(),currency:data.currencies.find(row=>row.id===value.currencyId)},accounts=value.id?data.accounts.map(row=>row.id===value.id?account:row):[...data.accounts,account];setData(current=>({...current,accounts}));onPendingAccountsChange(accounts);setDraft(null);return;}
  await requestJSON(`${path}${isOrder?'/order':value.id?`/${encodeURIComponent(value.id)}`:''}${query}`,{method:isOrder||value.id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(token!==scopeRef.current)return;setDraft(null);setReload(n=>n+1);emitWorkspaceDataChanged({orgId:scope,topics:['business-partners'],source:'business-accounts'});
 }catch(e){if(token===scopeRef.current)setError(money.errors[e.message]||`${labels.error} ${e.message||''}`);}finally{if(token===scopeRef.current)setSaving(false);}};

 const edit=account=>{if(canManage&&!disabled)setDraft({...account});};
 const addBank=()=>edit({accountKind:'BANK',displayName:'',bankName:'',accountNumber:'',accountHolder:'',currencyId:draft?.currencyId||data.currencies.find(row=>row.code==='VND')?.id||data.currencies[0]?.id||''});
 return <EntityDetailSection title={labels.banks} actions={<Stack direction="row" spacing={1}>{dirty&&<Button onClick={()=>save({ids:data.accounts.map(row=>row.id),revision:data.revision},true)} disabled={saving||!canManage}>{t.order}</Button>}<Button disabled={(!entityId&&!pending)||!ready||loading||saving||disabled||dirty||!canManage||(pending&&data.accounts.length>=20)} onClick={addBank}>{labels.add}</Button></Stack>}>
  {!hideGuidance&&<Typography variant="caption" color="text.secondary" sx={{display:'block',mb:2}}>{canManage?t.help:t.readOnly}</Typography>}
  {error&&<Alert severity="error" action={!ready&&<Button color="inherit" onClick={()=>setReload(n=>n+1)}>{loadText.retry}</Button>}>{error}</Alert>}
  {!entityId&&!pending?(!hideGuidance&&<Typography>{labels.firstSave}</Typography>):loading?<CircularProgress size={20}/>:<DragDropContext onDragEnd={({source,destination})=>{if(!destination||source.index===destination.index||saving||!canManage)return;setData(current=>{const accounts=[...current.accounts];accounts.splice(destination.index,0,accounts.splice(source.index,1)[0]);return {...current,accounts};});}}><TableContainer><Table size="small" sx={{minWidth:650}}><TableHead><TableRow>{['',labels.currency,t.kind,t.name,labels.bank,labels.number,labels.holder,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><Droppable droppableId="business-accounts">{provided=><TableBody ref={provided.innerRef} {...provided.droppableProps}>
   {data.accounts.map((account,index)=><Draggable key={account.id} draggableId={account.id} index={index} isDragDisabled={pending||saving||disabled||!canManage}>{drag=><TableRow ref={drag.innerRef} {...drag.draggableProps} data-account-id={account.id}><TableCell {...drag.dragHandleProps} aria-label={t.move}><DragIndicator fontSize="small"/></TableCell><TableCell>{account.currency.code}</TableCell><TableCell>{t[account.accountKind||'BANK']}</TableCell><TableCell>{account.displayName||'—'}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.bankName}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountNumber}</TableCell><TableCell>{account.accountKind==='CASH'?'—':account.accountHolder}</TableCell><TableCell><Button aria-label={labels.edit} disabled={saving||disabled||dirty||!canManage} onClick={()=>edit(account)} sx={{minWidth:32,p:.5}}><EditOutlined fontSize="small"/></Button></TableCell></TableRow>}</Draggable>)}{provided.placeholder}
   {!data.accounts.length&&<TableRow><TableCell colSpan={8}>{labels.empty}</TableCell></TableRow>}
  </TableBody>}</Droppable></Table></TableContainer></DragDropContext>}
  <BankAccountEditorDialog key={draft?.id||'new'+(!!draft)} open={!!draft} title={draft?.id?labels.edit:labels.add} value={draft} onChange={setDraft} onSave={save} onClose={()=>setDraft(null)} currencies={data.currencies.map(row=>({value:row.id,label:row.code}))} busy={saving} disabled={disabled||!canManage} error={error} languageCode={languageCode} errorAction={!ready&&<Button color="inherit" onClick={()=>setReload(n=>n+1)}>{loadText.retry}</Button>}/>
 </EntityDetailSection>;
}
