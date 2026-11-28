import {TableActionsCell,TableActionsHeader} from '../../../components/TableActions';
import {RecordInteractionScope, RecordRow, RecordOpenButton, RecordText} from '../../../components/RecordInteraction';
import Dialog from '../../../components/AppDialog';
import TableStatusRow from '../../../components/TableStatusRow';
import {dialogTitle} from '../../../constants/dialogTitles';

import React,{useEffect,useState} from 'react';
import {Button, DialogActions, DialogContent, DialogTitle, Stack, TextField, Paper, Table, TableHead, TableRow, TableCell} from '@mui/material';
import Alert from "../../../components/AppNotice";
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
const COPY={ko:{title:'사업장',add:'사업장 등록',name:'사업장명',code:'사업장 코드',start:'관리 시작일',address:'주소',save:'저장',cancel:'취소',empty:'등록된 사업장이 없습니다.',error:'사업장 정보를 처리하지 못했습니다.'},en:{title:'Workplaces',add:'Add workplace',name:'Workplace name',code:'Workplace code',start:'Management start date',address:'Address',save:'Save',cancel:'Cancel',empty:'No workplaces registered.',error:'Unable to process workplace information.'},vi:{title:'Nơi làm việc',add:'Thêm nơi làm việc',name:'Tên nơi làm việc',code:'Mã nơi làm việc',start:'Ngày bắt đầu quản lý',address:'Địa chỉ',save:'Lưu',cancel:'Hủy',empty:'Chưa có nơi làm việc.',error:'Không thể xử lý thông tin nơi làm việc.'}};
export default function WorkplaceBoard(){
 const {activeOrgId,activeOrgRole}=useAuth(),{languageCode}=useLanguage(),t=COPY[languageCode]||COPY.en;
 const [result,setResult]=useState({orgId:null,rows:[]}),[form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const rows=result.orgId===activeOrgId?result.rows:[],canEdit=activeOrgRole==='ADMIN';
 useEffect(()=>{setForm(null);setError('');},[activeOrgId]);
 useEffect(()=>{let alive=true;if(activeOrgId)requestJSON('/factories'+buildQueryString({orgId:activeOrgId}),{skipCache:true}).then(rows=>{if(alive)setResult({orgId:activeOrgId,rows});}).catch(()=>{if(alive)setError(t.error);});return()=>{alive=false;};},[activeOrgId,revision]);
 const save=async()=>{if(busy||!canEdit)return;setBusy(true);setError('');try{
  await requestJSON('/factories'+(form.id?'/'+form.id:'')+buildQueryString({orgId:activeOrgId}),{method:form.id?'PUT':'POST',body:JSON.stringify({name:form.name,factoryCode:form.factoryCode||null,managementStartDate:form.managementStartDate,address:form.address})});
  setForm(null);setRevision(n=>n+1);emitWorkspaceDataChanged({orgId:activeOrgId,topics:['production-allowance-settings'],source:'workplaces'});
 }catch(e){setError(e.message||t.error);}finally{setBusy(false);}};
 return <Stack spacing={2}>{error&&<Alert severity="error">{error}</Alert>}{canEdit&&<Button sx={{alignSelf:'flex-start'}} variant="contained" onClick={()=>setForm({name:'',factoryCode:'',managementStartDate:'',address:''})}>{t.add}</Button>}
 <Paper variant="outlined" sx={{overflowX:'auto'}}><Table data-table-kind="records"><TableHead><TableRow>{['name','code','start','address'].map(key=><TableCell key={key}>{t[key]}</TableCell>)}<TableActionsHeader languageCode={languageCode}/></TableRow></TableHead><RecordInteractionScope>{!rows.length&&<TableStatusRow colSpan={(4)+1} languageCode={languageCode} state="empty"/>}{rows.map(row=><RecordRow key={row.id} hover  recordKey={row.id} onOpen={()=>canEdit&&setForm({...row})} disabled={!canEdit}  sx={{cursor:canEdit?'pointer':undefined}}>{['name','factoryCode','managementStartDate','address'].map(key=><TableCell key={key}>{key==='name'?<RecordText  >{row[key]||'—'}</RecordText>:row[key]||'—'}</TableCell>)}<TableActionsCell languageCode={languageCode}/></RecordRow>)}</RecordInteractionScope></Table></Paper>
 <Dialog open={Boolean(form)} onClose={()=>!busy&&setForm(null)} fullWidth maxWidth="sm"><DialogTitle>{dialogTitle(form?.id?'workplaceEdit':'workplaceCreate',languageCode)}</DialogTitle><DialogContent><Stack spacing={2}>{[['name','name'],['factoryCode','code'],['managementStartDate','start'],['address','address']].map(([key,label])=><TextField key={key} label={t[label]} value={form?.[key]||''} required={['name','factoryCode','managementStartDate'].includes(key)} type={key==='managementStartDate'?'date':'text'} InputLabelProps={key==='managementStartDate'?{shrink:true}:undefined} disabled={busy} onChange={e=>setForm(previous=>({...previous,[key]:e.target.value}))}/>)}</Stack></DialogContent><DialogActions><Button variant="contained" disabled={busy||!form?.name?.trim()||!(/^[A-Z]{2,3}$/).test(form?.factoryCode||'')||!form?.managementStartDate} onClick={save}>{t.save}</Button></DialogActions></Dialog>
 </Stack>;
}
