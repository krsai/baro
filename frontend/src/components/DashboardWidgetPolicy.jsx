import React,{useEffect,useRef,useState} from 'react';
import {Button,Checkbox,CircularProgress,DialogActions,DialogContent,DialogTitle,FormControlLabel,Stack,Typography} from '@mui/material';
import AppDialog from './AppDialog';
import AppNotice from './AppNotice';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged,subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {usePageDialogs} from './PageDialogProvider';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import useChangeDrivenEffect from '../hooks/useChangeDrivenEffect';

export const widgetPolicyText={
 ko:{title:'위젯 사용 설정',notifications:'알림','suspected-errors':'오류 의심','work-requests':'업무 요청',approvals:'결재 현황',ADMIN:'관리자',ACCOUNTANT:'회계',OPERATOR:'운영',WORKER:'작업자',save:'저장',close:'닫기',retry:'다시 불러오기',failed:'위젯 사용 설정을 불러오거나 저장하지 못했습니다.',changed:'다른 관리자가 변경했습니다. 최신 설정을 불러와 주세요.',discard:'저장하지 않은 위젯 사용 설정을 버리시겠습니까?',saved:'위젯 사용 설정을 저장했습니다.'},
 en:{title:'Widget access',notifications:'Notifications','suspected-errors':'Suspected errors','work-requests':'Work requests',approvals:'Approvals',ADMIN:'Administrator',ACCOUNTANT:'Accountant',OPERATOR:'Operator',WORKER:'Worker',save:'Save',close:'Close',retry:'Reload',failed:'Could not load or save widget access.',changed:'Another administrator changed the settings. Reload the latest settings.',discard:'Discard unsaved widget access changes?',saved:'Widget access saved.'},
 vi:{title:'Quyền sử dụng tiện ích',notifications:'Thông báo','suspected-errors':'Nghi ngờ lỗi','work-requests':'Yêu cầu công việc',approvals:'Phê duyệt',ADMIN:'Quản trị viên',ACCOUNTANT:'Kế toán',OPERATOR:'Vận hành',WORKER:'Công nhân',save:'Lưu',close:'Đóng',retry:'Tải lại',failed:'Không thể tải hoặc lưu quyền sử dụng tiện ích.',changed:'Quản trị viên khác đã thay đổi cài đặt. Hãy tải lại.',discard:'Bỏ thay đổi quyền sử dụng tiện ích chưa lưu?',saved:'Đã lưu quyền sử dụng tiện ích.'}
};
export function useDashboardWidgetPolicy(orgId,employeeId,enabled,blocked){
 const {active}=useRequestScopeContext(),scope=String(orgId)+':'+String(employeeId);
 const [result,setResult]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const [held,setHeld]=useState(()=>document.visibilityState==='hidden'||!!document.querySelector('[role="dialog"]'));
 const pending=useRef(null);
 useEffect(()=>{
  const check=()=>setHeld(document.visibilityState==='hidden'||!!document.querySelector('[role="dialog"]'));
  const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',check);check();
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',check);};
 },[]);
 useEffect(()=>{if(!held&&!blocked&&active&&pending.current){if(pending.current.scope===scope)setResult(pending.current);pending.current=null;}},[held,blocked,active,scope]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.includes('accounting-alerts'))setReload(n=>n+1);}),[orgId]);
 useChangeDrivenEffect(()=>{if(!enabled)return;let live=true;const controller=new AbortController();
  requestJSON('/dashboard/widget-policy'+buildQueryString({orgId}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(value=>{if(live){const next={scope,value};if(document.visibilityState==='hidden'||document.querySelector('[role="dialog"]'))pending.current=next;else setResult(next);setError(false);}}).catch(e=>{if(live&&e.name!=='AbortError')setError(true);});
  return()=>{live=false;controller.abort();};
 },[enabled,scope,orgId,reload],{active,blocked:blocked||held});
 return {value:result?.scope===scope?result.value:null,error,retry:()=>setReload(n=>n+1)};
}
export default function DashboardWidgetPolicy({orgId,languageCode,onClose,onSaved}){
 const t=widgetPolicyText[languageCode]||widgetPolicyText.en,dialogs=usePageDialogs();
 const [loaded,setLoaded]=useState(null),[roles,setRoles]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const saving=useRef(false),alive=useRef(true),dirty=!!loaded&&JSON.stringify(roles)!==JSON.stringify(loaded.roles);
 useUnsavedChanges(dirty);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let live=true;const controller=new AbortController();setError(null);setLoaded(null);
  requestJSON('/dashboard/widget-policy'+buildQueryString({orgId}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(value=>{if(live){setLoaded(value);setRoles(value.roles);}}).catch(e=>{if(live&&e.name!=='AbortError')setError('load');});return()=>{live=false;controller.abort();};
 },[orgId,reload]);
 const close=async()=>{if(!saving.current&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'})))onClose();};
 const refresh=async()=>{if(!saving.current&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'})))setReload(n=>n+1);};
 const save=async()=>{if(saving.current||!loaded)return;saving.current=true;setBusy(true);setError(null);
  try{await requestJSON('/dashboard/widget-policy'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({revision:loaded.revision,roles})});if(!alive.current)return;emitWorkspaceDataChanged({orgId,source:'dashboard-widget-policy',topics:['accounting-alerts']});onSaved?.(t.saved);onClose();}
  catch(e){if(alive.current)setError(e.status===409?'changed':'save');}finally{saving.current=false;if(alive.current)setBusy(false);}
 };
 return <AppDialog open onClose={close} fullWidth maxWidth="md"><DialogTitle>{t.title}</DialogTitle><DialogContent><Stack spacing={2}>
  {error&&<AppNotice severity="error" action={<Button disabled={busy} onClick={error==='save'?save:refresh}>{error==='save'?t.save:t.retry}</Button>}>{error==='changed'?t.changed:t.failed}</AppNotice>}
  {!loaded&&!error&&<CircularProgress size={22}/>}
  {loaded&&Object.keys(roles).map(id=><Stack key={id} spacing={.5}><Typography fontWeight={600}>{t[id]}</Typography><Stack direction="row" useFlexGap flexWrap="wrap" role="group" aria-label={t[id]}>{['ADMIN','ACCOUNTANT','OPERATOR','WORKER'].map(role=><FormControlLabel key={role} label={t[role]} control={<Checkbox disabled={busy||error==='save'} checked={roles[id].includes(role)} onChange={e=>setRoles(current=>({...current,[id]:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'].filter(item=>item===role?e.target.checked:current[id].includes(item))}))}/>}/>)}</Stack></Stack>)}
 </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={close}>{t.close}</Button><Button variant="contained" disabled={!dirty||busy||!!error} onClick={save}>{busy?<CircularProgress size={18}/>:t.save}</Button></DialogActions></AppDialog>;
}
