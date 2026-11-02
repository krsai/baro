import React,{useEffect,useRef,useState} from 'react';
import {Alert,Autocomplete,Button,Chip,Stack,TextField,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export const COMPANY_CONNECTION_TEXT={
 ko:{find:'가입 회사 확인',title:'연결된 SaaS 회사',select:'가입 회사 선택',none:'일치하는 가입 회사가 없습니다.',error:'회사 연결 정보를 확인하지 못했습니다.',help:'거래처가 SaaS를 이용하면 같은 가입 회사와 연결하고 해당 회사의 공식 코드를 사용합니다. 기본 식별 정보를 공유하며 업무 자료는 허용된 범위에서만 공유합니다.',incoming:'상대 회사에서 등록',outgoing:'우리 회사에서 등록',connected:'연결됨'},
 en:{find:'Find registered company',title:'Connected SaaS companies',select:'Select registered company',none:'No matching registered company.',error:'Unable to check company connections.',help:'Connect a partner to the same registered SaaS company and use its official code. Basic identity is shared; business data is shared only within authorized scopes.',incoming:'Registered by counterpart',outgoing:'Registered by us',connected:'Connected'},
 vi:{find:'Tìm công ty đã đăng ký',title:'Công ty SaaS đã kết nối',select:'Chọn công ty đã đăng ký',none:'Không có công ty phù hợp.',error:'Không thể kiểm tra kết nối công ty.',help:'Kết nối đối tác với cùng công ty đã đăng ký SaaS và dùng mã chính thức. Chia sẻ thông tin định danh cơ bản; dữ liệu nghiệp vụ chỉ được chia sẻ trong phạm vi được cho phép.',incoming:'Đối tác đã đăng ký',outgoing:'Chúng tôi đã đăng ký',connected:'Đã kết nối'},
};
export function CompanyConnectionField({orgId,name,businessNumber,country,value,onChange,disabled,languageCode='ko',entityId}){
 const text=COMPANY_CONNECTION_TEXT[languageCode]||COMPANY_CONNECTION_TEXT.en;
 const [options,setOptions]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[checked,setChecked]=useState(false),[linked,setLinked]=useState(null);
 const requestKey=`${orgId}:${name}:${businessNumber}:${country}`,current=useRef(requestKey);current.current=requestKey;
 useEffect(()=>{setOptions([]);setChecked(false);setError('');setLoading(false);onChange(undefined,entityId?undefined:null);},[orgId,name,businessNumber,country]);
 useEffect(()=>{let alive=true;setLinked(null);if(entityId)requestJSON('/company-connections'+buildQueryString({orgId}),{skipCache:true}).then(rows=>{if(alive){const company=rows.find(row=>row.entityId===entityId)?.company||null;setLinked(company);if(company)onChange(undefined,company);}}).catch(()=>{if(alive)setError(text.error);});return()=>{alive=false;};},[orgId,entityId]);
 const find=async()=>{const key=requestKey;setLoading(true);setError('');try{const rows=await requestJSON('/company-connections/candidates'+buildQueryString({orgId,name,businessNumber,country}),{skipCache:true});if(current.current===key){setOptions(rows);setChecked(true);}}catch{if(current.current===key)setError(text.error);}finally{if(current.current===key)setLoading(false);}};
 return <Stack spacing={1}><Typography variant="caption" color="text.secondary">{text.help}</Typography>{linked?<Chip label={`${text.connected}: ${linked.name} (${linked.code})`}/>:<><Button onClick={find} disabled={disabled||loading||!businessNumber&&String(name||'').trim().length<3}>{text.find}</Button>{checked&&<Autocomplete options={options} value={options.find(row=>row.id===value?.targetOrgId)||null} disabled={disabled||loading} getOptionLabel={row=>`${row.name} (${row.code})`} isOptionEqualToValue={(a,b)=>a.id===b.id} noOptionsText={text.none} onChange={(_,row)=>onChange(row?{targetOrgId:row.id,revision:row.revision}:undefined,row||null)} renderInput={params=><TextField {...params} label={text.select}/>}/>}</>}{error&&<Alert severity="error">{error}</Alert>}</Stack>;
}
export default function CompanyConnections({orgId,languageCode='ko'}){
 const text=COMPANY_CONNECTION_TEXT[languageCode]||COMPANY_CONNECTION_TEXT.en;
 const [rows,setRows]=useState([]),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.includes('business-partners'))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{let alive=true;setRows([]);setError(false);requestJSON('/company-connections'+buildQueryString({orgId}),{skipCache:true}).then(data=>{if(alive)setRows(data);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[orgId,reload]);
 if(error)return <Alert severity="error">{text.error}</Alert>;
 if(!rows.length)return null;
 const unique=rows.filter((row,index)=>rows.findIndex(other=>other.company.id===row.company.id)===index);
 return <Stack spacing={1} sx={{mb:2}}><Typography variant="subtitle2">{text.title}</Typography><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{unique.map(row=><Chip key={row.company.id} label={`${row.company.name} (${row.company.code}) · ${row.direction==='INCOMING'?text.incoming:text.outgoing}`}/>)}</Stack></Stack>;
}
