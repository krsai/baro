import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Chip,Dialog,DialogTitle,DialogContent,DialogActions,Paper,Stack,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export const COMPANY_CONNECTION_TEXT={
 ko:{find:'가입 회사 확인',title:'연결된 업체',select:'가입 회사 선택',none:'일치하는 가입 회사가 없습니다.',error:'회사 연결 정보를 확인하지 못했습니다.',help:'SaaS 가입 여부와 관계없이 같은 업체로 확인하면 연결하고 기존 코드를 사용합니다. 기본 식별 정보를 공유하며 업무 자료는 허용된 범위에서만 공유합니다.',incoming:'상대 회사에서 등록',outgoing:'우리 회사에서 등록',connected:'연결됨'},
 en:{find:'Find registered company',title:'Connected companies',select:'Select registered company',none:'No matching registered company.',error:'Unable to check company connections.',help:'Connect a partner to the same company and use its existing code, whether or not it uses SaaS. Basic identity is shared; business data is shared only within authorized scopes.',incoming:'Registered by counterpart',outgoing:'Registered by us',connected:'Connected'},
 vi:{find:'Tìm công ty đã đăng ký',title:'Công ty đã kết nối',select:'Chọn công ty đã đăng ký',none:'Không có công ty phù hợp.',error:'Không thể kiểm tra kết nối công ty.',help:'Kết nối đối tác với cùng công ty và dùng mã hiện có, dù có sử dụng SaaS hay không. Chia sẻ thông tin định danh cơ bản; dữ liệu nghiệp vụ chỉ được chia sẻ trong phạm vi được cho phép.',incoming:'Đối tác đã đăng ký',outgoing:'Chúng tôi đã đăng ký',connected:'Đã kết nối'},
};
const CONFIRM={
 ko:{title:'같은 업체인지 확인해 주세요',help:'입력한 사업자·세금 번호와 일치하는 업체가 있습니다. 이름·국가·번호·주소를 확인해 주세요.',same:'같은 업체입니다 · 연결',different:'다른 업체입니다 · 별도 등록',cancel:'닫기',find:'기존 업체 확인',selected:'기존 업체와 연결 예정',separate:'다른 업체로 별도 등록합니다.'},
 en:{title:'Is this the same company?',help:'An existing company has this business or tax number. Check its name, country, number and address.',same:'Same company · Connect',different:'Different company · Register separately',cancel:'Close',find:'Check existing company',selected:'Will connect to the existing company',separate:'Registering as a separate company.'},
 vi:{title:'Đây có phải cùng một công ty?',help:'Có công ty đã đăng ký số kinh doanh hoặc mã số thuế này. Hãy kiểm tra tên, quốc gia, số và địa chỉ.',same:'Cùng công ty · Kết nối',different:'Khác công ty · Đăng ký riêng',cancel:'Đóng',find:'Kiểm tra công ty đã có',selected:'Sẽ kết nối với công ty đã có',separate:'Đăng ký thành công ty riêng.'},
};
export function CompanyConnectionField({orgId,name,businessNumber,country,value,onChange,disabled,languageCode='ko',entityId}){
 const text=COMPANY_CONNECTION_TEXT[languageCode]||COMPANY_CONNECTION_TEXT.en;
 const confirm=CONFIRM[languageCode]||CONFIRM.en;
 const [options,setOptions]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[checked,setChecked]=useState(false),[linked,setLinked]=useState(null);
 const [review,setReview]=useState(false),[selected,setSelected]=useState(null);
 const requestKey=`${orgId}:${businessNumber}:${country}`,current=useRef(requestKey);current.current=requestKey;
 useEffect(()=>{setOptions([]);setSelected(null);setReview(false);setChecked(false);setError('');setLoading(false);onChange(undefined,linked||null);},[orgId,businessNumber,country]);
 useEffect(()=>{let alive=true;setLinked(null);if(entityId)requestJSON('/company-connections'+buildQueryString({orgId}),{skipCache:true}).then(rows=>{if(alive){const company=rows.find(row=>row.entityId===entityId)?.company||null;setLinked(company);if(company)onChange(undefined,company);}}).catch(()=>{if(alive)setError(text.error);});return()=>{alive=false;};},[orgId,entityId]);
 const find=async()=>{const key=requestKey;setLoading(true);setError('');try{const rows=(await requestJSON('/company-connections/candidates'+buildQueryString({orgId,name,businessNumber,country}),{skipCache:true})).filter(row=>row.sourceEntityId!==entityId);if(current.current===key){setOptions(rows);setChecked(true);setReview(rows.length>0);}}catch{if(current.current===key)setError(text.error);}finally{if(current.current===key)setLoading(false);}};
 useEffect(()=>{if(linked||value||disabled||!country||String(businessNumber||'').replace(/[^A-Za-z0-9]/g,'').length<3)return;const timer=setTimeout(find,600);return()=>clearTimeout(timer);},[orgId,name,businessNumber,country,linked,disabled,value]);
 const accept=row=>{setSelected(row);setReview(false);onChange({...('identityId'in row?{identityId:row.identityId}:'sourceEntityId'in row?{sourceEntityId:row.sourceEntityId}:{targetOrgId:row.id}),revision:row.revision},row);};
 const separate=()=>{setSelected(null);setReview(false);onChange({separate:true,businessNumber:String(businessNumber||'').toUpperCase().replace(/[^A-Z0-9]/g,''),country},null);};
 return <Stack spacing={1}>{linked?<Chip label={`${text.connected}: ${linked.name} (${linked.code})`}/>:<><Button onClick={find} disabled={disabled||loading||(!businessNumber&&String(name||'').trim().length<3)}>{confirm.find}</Button>{selected&&<Chip label={`${confirm.selected}: ${selected.name} (${selected.code})`}/>}{value?.separate&&<Typography variant="caption">{confirm.separate}</Typography>}{checked&&!options.length&&<Typography variant="caption">{text.none}</Typography>}</>}{error&&<Alert severity="error">{error}</Alert>}
  <Dialog open={review&&!disabled} onClose={()=>setReview(false)} fullWidth maxWidth="sm"><DialogTitle sx={{pb:1}}>{confirm.title}</DialogTitle><DialogContent><Stack spacing={2}><Typography>{confirm.help}</Typography>{options.map(row=><Paper variant="outlined" key={`${row.identityId?'identity':'source'}:${row.id}`} sx={{p:2.5,borderRadius:2,bgcolor:"grey.50"}}><Stack spacing={.5}><Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}><Typography variant="h6" sx={{overflowWrap:"anywhere"}}>{row.name}</Typography><Chip size="small" label={row.code}/></Stack>{[...new Set([row.nameKo,row.nameVi].filter(n=>n&&n!==row.name))].map(n=><Typography key={n} color="text.secondary">{n}</Typography>)}<Typography>{row.country||'—'} · {row.businessNumber||'—'}</Typography><Typography>{row.address||'—'}</Typography><Button variant="contained" fullWidth sx={{mt:2}} onClick={()=>accept(row)}>{confirm.same}</Button></Stack></Paper>)}</Stack></DialogContent><DialogActions><Button onClick={()=>setReview(false)}>{confirm.cancel}</Button><Button onClick={separate}>{confirm.different}</Button></DialogActions></Dialog>
 </Stack>;
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
