import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { requestJSON, buildQueryString } from '../utils/apiClient';
import { serviceName } from './OutsourcingServiceDialog';
import { emitWorkspaceDataChanged } from '../utils/workspaceDataEvents';

const TEXT = {
  ko:{title:'세부 업종별 생산 연결',help:'이 업체의 신규 비용 신청에 적용합니다. 필수로 지정하면 주문·스타일 공정·배정 연결과 생산 실적 기록이 필요합니다. 비용만 기록하면 주문·스타일은 선택 사항이며 공정 연결은 하지 않습니다. 기존 실적은 변경하지 않습니다.',industry:'세부 업종',mode:'공정 연결',default:'코드 기본값 유지',required:'연결 필수 · 생산 실적 기록',cost:'연결 안 함 · 비용만 기록',save:'저장',saved:'설정을 저장했습니다.',error:'설정을 불러오거나 저장하지 못했습니다.',retry:'다시 불러오기',loading:'불러오는 중...',empty:'등록된 외주 세부 업종이 없습니다.'},
  en:{title:'Production links by industry',help:'Applies to new payment requests in this company. Required links record production against an order, style process and assignment. Cost-only entries may select an order and style without a process. Existing production is preserved.',industry:'Industry',mode:'Process link',default:'Keep code default',required:'Required · record production',cost:'No link · cost only',save:'Save',saved:'Settings saved.',error:'Could not load or save settings.',retry:'Reload',loading:'Loading...',empty:'No outsourcing industries registered.'},
  vi:{title:'Liên kết sản xuất theo ngành',help:'Áp dụng cho đề nghị thanh toán mới của công ty này. Chế độ bắt buộc cần liên kết đơn hàng, công đoạn mẫu và phân công để ghi sản lượng. Chế độ chỉ ghi chi phí cho phép chọn đơn hàng và mẫu, không liên kết công đoạn. Giữ nguyên sản lượng đã ghi.',industry:'Ngành chi tiết',mode:'Liên kết công đoạn',default:'Giữ mặc định của mã',required:'Bắt buộc · ghi sản lượng',cost:'Không liên kết · chỉ chi phí',save:'Lưu',saved:'Đã lưu cài đặt.',error:'Không thể tải hoặc lưu cài đặt.',retry:'Tải lại',loading:'Đang tải...',empty:'Chưa có ngành gia công.'},
};
export default function IndustryProductionSettings() {
  const {activeOrgId,activeOrgRole} = useAuth(), {languageCode} = useLanguage();
  const text = TEXT[languageCode] || TEXT.en, scope = useRef(activeOrgId);scope.current=activeOrgId;
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(false),[saved,setSaved]=useState(false),[reload,setReload]=useState(0);
  const canEdit=activeOrgRole==='ADMIN';
  useEffect(()=>{let alive=true;setRows([]);setLoading(true);setSaving(false);setError(false);setSaved(false);
    requestJSON(`/app-settings/industry-production${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
      .then(data=>{if(alive)setRows(data.map(row=>({...row,original:row.productionLinkRequired})));})
      .catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
  },[activeOrgId,reload]);
  const save=async row=>{const orgId=activeOrgId;setSaving(true);setError(false);setSaved(false);
    try{await requestJSON(`/app-settings/industry-production${buildQueryString({orgId})}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemIndustryId:row.id,productionLinkRequired:row.productionLinkRequired})});
      emitWorkspaceDataChanged({orgId,topics:['expense-settings'],source:'industry-production-policy'});
      if(scope.current===orgId){setRows(previous=>previous.map(item=>item.id===row.id?{...item,original:row.productionLinkRequired}:item));setSaved(true);}
    }catch{if(scope.current===orgId)setError(true);}finally{if(scope.current===orgId)setSaving(false);}
  };
  return <Paper variant="outlined" sx={{p:'var(--ui-panel-padding, 16px)',maxWidth:1000,minWidth:0}}><Stack spacing={2} sx={{minWidth:0}}>
    <Typography variant="h6">{text.title}</Typography><Typography variant="body2" color="text.secondary">{text.help}</Typography>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{text.retry}</Button>}>{text.error}</Alert>}
    {saved&&<Alert severity="success">{text.saved}</Alert>}
    <TableContainer><Table size="small" sx={{minWidth:500}}><TableHead><TableRow><TableCell>{text.industry}</TableCell><TableCell>{text.mode}</TableCell><TableCell /></TableRow></TableHead><TableBody>
      {rows.map(row=><TableRow key={row.id}><TableCell>{serviceName(row,languageCode)}</TableCell><TableCell>
        <TextField select size="small" fullWidth label={text.mode} value={row.productionLinkRequired==null?'default':String(row.productionLinkRequired)} disabled={!canEdit||saving} onChange={event=>setRows(previous=>previous.map(item=>item.id===row.id?{...item,productionLinkRequired:event.target.value==='default'?null:event.target.value==='true'}:item))}>
          <MenuItem value="default">{text.default}</MenuItem><MenuItem value="true">{text.required}</MenuItem><MenuItem value="false">{text.cost}</MenuItem>
        </TextField></TableCell><TableCell>{canEdit&&<Button disabled={saving||row.original===row.productionLinkRequired} onClick={()=>save(row)}>{text.save}</Button>}</TableCell></TableRow>)}
      {!rows.length&&<TableRow><TableCell colSpan={3}>{loading?text.loading:text.empty}</TableCell></TableRow>}
    </TableBody></Table></TableContainer>
  </Stack></Paper>;
}
