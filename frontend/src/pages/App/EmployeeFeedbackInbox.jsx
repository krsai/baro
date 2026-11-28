import React,{useEffect,useRef,useState} from 'react';
import {Button,Chip,Paper,Stack,Typography} from '@mui/material';
import dayjs from 'dayjs';
import AppPageContainer from '../../components/AppPageContainer';
import PageSectionHeader from '../../components/PageSectionHeader';
import ListDetailLayout from '../../components/ListDetailLayout';
import DialogRecordList from '../../components/DialogRecordList';
import ListPagination from '../../components/ListPagination';
import QueryFeedback from '../../components/QueryFeedback';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {buildQueryString,requestJSON} from '../../utils/apiClient';
import {employeeFeedbackText} from '../../constants/employeeFeedback';
import {feedbackAutomationText} from '../../constants/feedbackAutomation';

export default function EmployeeFeedbackInbox(props){
 const auth=useAuth();
 return <FeedbackInboxBody key={`${auth.activeOrgId}:${auth.activeProfile?.employeeId||''}:${auth.user?.id||''}:${Boolean(props.adminView)}`} {...props}/>;
}
function FeedbackInboxBody({adminView=false,embedded=false}){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions();
 const t={...(employeeFeedbackText[languageCode]||employeeFeedbackText.en),...(feedbackAutomationText[languageCode]||feedbackAutomationText.en)};
 const [page,setPage]=useState(0),[data,setData]=useState(null),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0),[reading,setReading]=useState(false);
 const scope=useRef(activeOrgId),readLock=useRef(false);scope.current=activeOrgId;
 useEffect(()=>{scope.current=activeOrgId;return ()=>{scope.current=null;};},[activeOrgId]);
 useEffect(()=>{setPage(0);setData(null);setSelected(null);setReading(false);readLock.current=false;},[activeOrgId,adminView]);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setError(false);
  requestJSON(`/employee-feedback/${adminView?'sent':'inbox'}`+buildQueryString({orgId:activeOrgId,page}),{signal:abort.signal,skipCache:true,forceRefresh:true}).then(result=>{if(!abort.signal.aborted){setData(result);setSelected(current=>result.rows.find(row=>row.id===current?.id)||null);}}).catch(()=>{if(!abort.signal.aborted)setError(true);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[activeOrgId,adminView,page,retry]);
 const read=async()=>{
  if(!selected||readLock.current||selected.readAt||adminView)return;
  const orgId=activeOrgId,id=selected.id;readLock.current=true;setReading(true);
  try{const receipt=await requestJSON(`/employee-feedback/inbox/${id}/read`+buildQueryString({orgId}),{method:'POST'});if(scope.current!==orgId)return;setSelected(current=>current?.id===id?{...current,...receipt}:current);setData(current=>({...current,rows:current.rows.map(row=>row.id===id?{...row,...receipt}:row)}));}
  catch{if(scope.current===orgId)showNotification(t.error,'error');}
  finally{if(scope.current===orgId){readLock.current=false;setReading(false);}}
 };
 const format=value=>value?dayjs(value).format('YYYY-MM-DD HH:mm'):'—';
 const refresh=<Button disabled={loading||reading} onClick={()=>setRetry(value=>value+1)}>{t.refresh}</Button>;
 const body=<Stack spacing={2}>
  {embedded&&refresh}
  <QueryFeedback error={error} onRetry={()=>setRetry(value=>value+1)}/>
  <ListDetailLayout listWidth="minmax(0,1fr)" detailWidth="minmax(0,1fr)" list={<>
   <DialogRecordList rows={data?.rows||[]} columns={[{key:'subject',label:t.subject,value:row=>row.subject},{key:'kind',label:t.kind,value:row=>t[row.kind]},...(adminView?[{key:'employee',label:t.employee,value:row=>row.employeeName}]:[]),{key:'read',label:t.read,value:row=>row.readAt?t.read:t.unread}]} selectedKey={selected?.id} onPreview={()=>{}} onSelect={setSelected} disabled={reading} loading={loading} error={error} loaded={Boolean(data)} onRetry={()=>setRetry(value=>value+1)} languageCode={languageCode}/>
   <ListPagination languageCode={languageCode} previousDisabled={loading||reading||page===0} nextDisabled={loading||reading||error||!data?.hasMore} onPrevious={()=>{setSelected(null);setPage(value=>value-1);}} onNext={()=>{setSelected(null);setPage(value=>value+1);}}/>
  </>} detail={selected&&<Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
   <Stack direction="row" spacing={1}><Chip label={t[selected.kind]}/><Chip label={selected.readAt?t.read:t.unread}/></Stack>
   <Typography variant="h6">{selected.subject}</Typography>
   {adminView&&<Typography>{selected.employeeName}</Typography>}
   <Typography variant="body2">{t.sentAt}: {format(selected.createdAt)}</Typography>
   <Typography variant="body2">{t.period}: {selected.periodStartDate} ~ {selected.periodEndDate}</Typography>
   <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{selected.message}</Typography>
   {selected.basis?.deadline&&<Typography variant="body2">{t.deadline}: {new Intl.DateTimeFormat('sv-SE',{timeZone:selected.basis.timeZone||'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(selected.basis.deadline))} ({selected.basis.timeZone})</Typography>}
   {!adminView&&!selected.readAt&&<Button variant="outlined" disabled={reading||error||loading} onClick={read}>{t.markRead}</Button>}
  </Stack></Paper>}/>
 </Stack>;
 return embedded?body:<AppPageContainer header={<PageSectionHeader title={t.inbox} titleComponent="h1" actions={refresh}/>}>{body}</AppPageContainer>;
}
