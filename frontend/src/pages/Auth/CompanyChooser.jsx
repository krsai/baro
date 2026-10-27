import React,{useRef,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import {useAuth} from '../../context/AuthContext';
import {requestJSON} from '../../utils/apiClient';
import {findLoginWorkspace,readLoginCompany} from '../../utils/loginCompanySelection.mjs';
const copy={
 ko:{choose:'로그인할 업체 선택',hint:'접근 권한이 있는 업체만 표시됩니다.',add:'물류 회사 등록',name:'회사명 (영어 대표명)',nameKo:'회사명 (한국어)',code:'회사 코드',create:'등록',cancel:'취소',failed:'회사 등록에 실패했습니다.',uncertain:'등록 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하세요.',retry:'다시 시도'},
 en:{choose:'Choose a company',hint:'Only companies you can access are shown.',add:'Register a logistics company',name:'Company name (English)',nameKo:'Company name (Korean)',code:'Company code',create:'Register',cancel:'Cancel',failed:'Unable to register company.',uncertain:'The result is unknown. Retry the same request.',retry:'Retry'},
 vi:{choose:'Chọn công ty đăng nhập',hint:'Chỉ hiển thị công ty bạn được phép truy cập.',add:'Đăng ký công ty logistics',name:'Tên công ty (tiếng Anh)',nameKo:'Tên công ty (tiếng Hàn)',code:'Mã công ty',create:'Đăng ký',cancel:'Hủy',failed:'Không thể đăng ký công ty.',uncertain:'Chưa xác nhận kết quả. Hãy thử lại với cùng nội dung.',retry:'Thử lại'},
};
export default function CompanyChooser({languageCode,managementOnly=false}){
 const {workspaces,selectWorkspace,canCreateCompany,reloadWorkspaces,loading}=useAuth(),t=copy[languageCode]||copy.en;
 const [open,setOpen]=useState(false),[form,setForm]=useState({name:'DEXS LOGIS',nameKo:'덱스로지스',nameVi:'',code:'DEXS'}),[saving,setSaving]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const key=useRef(crypto.randomUUID()),busy=useRef(false);
 const submit=async()=>{
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{await requestJSON('/auth/workspaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,clientKey:key.current})});setUncertain(false);setOpen(false);reloadWorkspaces();}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?t.uncertain:`${t.failed} ${e.message}`);}
  finally{busy.current=false;setSaving(false);}
 };
 return <Stack spacing={1.5}>
  {readLoginCompany()&&!findLoginWorkspace(workspaces,readLoginCompany())&&<Alert severity="warning">{languageCode==='ko'?'선택한 회사에 접근 권한이 없거나 아직 등록되지 않았습니다.':languageCode==='vi'?'Bạn chưa có quyền truy cập công ty đã chọn hoặc công ty chưa được đăng ký.':'The selected company is unavailable or you do not have access.'}</Alert>}
  {!managementOnly&&<><Typography variant="h6">{t.choose}</Typography><Typography variant="body2">{t.hint}</Typography>
  {workspaces.map(workspace=><Button key={workspace.key} variant="outlined" disabled={loading} onClick={()=>selectWorkspace(workspace.key)} sx={{justifyContent:'flex-start',height:'auto',minHeight:48,textTransform:'none'}}>{languageCode==='ko'?workspace.nameKo||workspace.name:languageCode==='vi'?workspace.nameVi||workspace.name:workspace.name}</Button>)}</>}
  {canCreateCompany&&<Button onClick={()=>{key.current=crypto.randomUUID();setError('');setUncertain(false);setOpen(true);}}>{t.add}</Button>}
  <Dialog open={open} onClose={()=>{if(!saving&&!uncertain)setOpen(false);}} fullWidth maxWidth="sm">
   <DialogTitle>{t.add}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
    {['name','nameKo','nameVi','code'].map(field=><TextField key={field} label={field==='nameVi'?(languageCode==='ko'?'회사명 (베트남어)':languageCode==='vi'?'Tên công ty (tiếng Việt)':'Company name (Vietnamese)'):t[field]} value={form[field]} disabled={saving||uncertain} required={field==='code'} inputProps={{maxLength:field==='code'?40:160}} onChange={e=>{setForm(previous=>({...previous,[field]:e.target.value}));key.current=crypto.randomUUID();}}/>)}
    {error&&<Alert severity="error">{error}</Alert>}
   </Stack></DialogContent><DialogActions><Button disabled={saving||uncertain} onClick={()=>setOpen(false)}>{t.cancel}</Button><Button variant="contained" disabled={saving||![form.name,form.nameKo,form.nameVi].some(value=>value.trim())||!form.code.trim()} onClick={submit}>{uncertain?t.retry:t.create}</Button></DialogActions>
  </Dialog>
 </Stack>;
}
