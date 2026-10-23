import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableHead,TableRow,TableContainer,TextField,Typography} from '@mui/material';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {serviceName} from './OutsourcingServiceDialog';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export const EXPENSE_CODE_LINK_TEXT={
 ko:{title:'비용 코드별 연결 설정',help:'이 업체의 기본 코드별로 입력할 업무 대상을 설정합니다. 세금 구분 E·V·Z에 공통 적용됩니다. 공정을 선택하면 비용 내역에서 스타일의 공정 입력이 필수입니다. 미설정 코드는 연결 없음이며 기존 내역은 변경하지 않습니다.',code:'기본 코드',name:'코드명',target:'연결 대상',none:'연결 없음',process:'스타일 공정 (필수)',save:'저장',saved:'설정을 저장했습니다.',error:'설정을 불러오거나 저장하지 못했습니다.',retry:'다시 불러오기',loading:'불러오는 중...',empty:'등록된 비용 기본 코드가 없습니다.'},
 en:{title:'Expense code link settings',help:'Set the required business reference for each base code in this company. The same setting applies to E, V and Z variants. Process requires a style process on each expense line. Unconfigured codes require no link. Existing entries are preserved.',code:'Base code',name:'Code name',target:'Link target',none:'No link',process:'Style process (required)',save:'Save',saved:'Settings saved.',error:'Could not load or save settings.',retry:'Reload',loading:'Loading...',empty:'No expense base codes registered.'},
 vi:{title:'Liên kết theo mã chi phí',help:'Thiết lập đối tượng liên kết cho từng mã gốc của công ty. Áp dụng chung cho E, V và Z. Khi chọn công đoạn, mỗi dòng chi phí phải chọn công đoạn của mẫu. Mã chưa cài đặt không yêu cầu liên kết. Giữ nguyên các nội dung đã lưu.',code:'Mã gốc',name:'Tên mã',target:'Đối tượng liên kết',none:'Không liên kết',process:'Công đoạn mẫu (bắt buộc)',save:'Lưu',saved:'Đã lưu cài đặt.',error:'Không thể tải hoặc lưu cài đặt.',retry:'Tải lại',loading:'Đang tải...',empty:'Chưa có mã chi phí gốc.'},
};

export default function ExpenseCodeLinkSettings(){
 const {activeOrgId,activeOrgRole}=useAuth(),{languageCode}=useLanguage();
 const text=EXPENSE_CODE_LINK_TEXT[languageCode]||EXPENSE_CODE_LINK_TEXT.en,scope=useRef(activeOrgId);scope.current=activeOrgId;
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(false),[saved,setSaved]=useState(false),[reload,setReload]=useState(0);
 const canEdit=activeOrgRole==='ADMIN';
 useEffect(()=>{let alive=true;setRows([]);setLoading(true);setSaving(false);setError(false);setSaved(false);
  requestJSON(`/app-settings/expense-code-links${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
   .then(data=>{if(alive)setRows(data.map(row=>({...row,original:row.target})));})
   .catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[activeOrgId,reload]);
 const save=async row=>{const orgId=activeOrgId;setSaving(true);setError(false);setSaved(false);
  try{await requestJSON(`/app-settings/expense-code-links${buildQueryString({orgId})}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseId:row.id,target:row.target})});
   emitWorkspaceDataChanged({orgId,topics:['expense-settings'],source:'expense-code-link-policy'});
   if(scope.current===orgId){setRows(previous=>previous.map(item=>item.id===row.id?{...item,original:row.target}:item));setSaved(true);}
  }catch{if(scope.current===orgId)setError(true);}finally{if(scope.current===orgId)setSaving(false);}
 };
 return <Paper variant="outlined" sx={{p:'var(--ui-panel-padding, 16px)',maxWidth:1000,minWidth:0}}><Stack spacing={2} sx={{minWidth:0}}>
  <Typography variant="h6">{text.title}</Typography><Typography variant="body2" color="text.secondary">{text.help}</Typography>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{text.retry}</Button>}>{text.error}</Alert>}
  {saved&&<Alert severity="success">{text.saved}</Alert>}
  <TableContainer><Table size="small" sx={{minWidth:550}}><TableHead><TableRow>{[text.code,text.name,text.target,''].map((label,i)=><TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
   {rows.map(row=><TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{serviceName(row,languageCode)}</TableCell><TableCell>
    <TextField select size="small" fullWidth label={text.target} value={row.target} disabled={!canEdit||saving} onChange={event=>setRows(previous=>previous.map(item=>item.id===row.id?{...item,target:event.target.value}:item))}>
     <MenuItem value="NONE">{text.none}</MenuItem><MenuItem value="PROCESS">{text.process}</MenuItem>
    </TextField></TableCell><TableCell>{canEdit&&<Button disabled={saving||row.original===row.target} onClick={()=>save(row)}>{text.save}</Button>}</TableCell></TableRow>)}
   {!rows.length&&<TableRow><TableCell colSpan={4}>{loading?text.loading:text.empty}</TableCell></TableRow>}
  </TableBody></Table></TableContainer>
 </Stack></Paper>;
}
