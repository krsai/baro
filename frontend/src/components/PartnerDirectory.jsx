import React,{useMemo,useState} from 'react';
import {Button,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import AppPageContainer from './AppPageContainer';
import PartnerListPanel from './PartnerListPanel';
import SearchInput from './SearchInput';
import TableStatusRow from './TableStatusRow';
import StatusLabel from './StatusLabel';
import NotificationIndicator from './NotificationIndicator';
import {getStaticOptionLabel} from '../constants/staticOptionRegistry';

export const PARTNER_DIRECTORY_TEXT={
 ko:{add:'거래처 등록',search:'거래처명·코드·담당자·연락처·이메일 검색',code:'코드',name:'거래처명',country:'국가',contact:'담당자',phone:'연락처',email:'이메일',active:'사용 중',inactive:'사용 중지',status:'상태',registered:'등록일',actions:'작업',detail:'상세'},
 en:{add:'Add partner',search:'Search name, code, contact, phone or email',code:'Code',name:'Partner name',country:'Country',contact:'Contact person',phone:'Phone',email:'Email',active:'Active',inactive:'Inactive',status:'Status',registered:'Registered',actions:'Actions',detail:'Details'},
 vi:{add:'Thêm đối tác',search:'Tìm tên, mã, người liên hệ, điện thoại hoặc email',code:'Mã',name:'Tên đối tác',country:'Quốc gia',contact:'Người liên hệ',phone:'Điện thoại',email:'Email',active:'Đang sử dụng',inactive:'Ngừng sử dụng',status:'Trạng thái',registered:'Ngày đăng ký',actions:'Thao tác',detail:'Chi tiết'},
};
const registeredDate=(value,languageCode)=>{
 if(!value)return '-';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '-';
 return new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',vi:'vi-VN'}[languageCode]||'en-GB',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};

// Adapters keep customer relationship IDs and organization IDs distinct. This
// component only renders shared attributes and calls the owning role's actions.
export default function PartnerDirectory({embedded=false,title,rows,loading,error,onRetry,onAdd,canAdd=true,onOpen,canOpen=true,renderActions,languageCode='ko',children}){
 const Container=embedded?PartnerListPanel:AppPageContainer,labels=PARTNER_DIRECTORY_TEXT[languageCode]||PARTNER_DIRECTORY_TEXT.en;
 const [search,setSearch]=useState('');
 const filtered=useMemo(()=>{const term=search.trim().toLocaleLowerCase();return term?rows.filter(row=>[row.code,row.name,row.subtitle,row.contactName,row.phone,row.email,row.searchText,getStaticOptionLabel('country',row.country,row.country||'',languageCode)].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)):rows;},[rows,search,languageCode]);
 return <Container title={title} titleActions={<Button variant="contained" disabled={!canAdd} onClick={onAdd}>{labels.add}</Button>} toolbar={<SearchInput value={search} onChange={event=>setSearch(event.target.value)} placeholder={labels.search}/>}>
  <Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer>
   <Table size="small" sx={{minWidth:1040,tableLayout:'fixed'}} data-testid="partner-directory">
    <colgroup>{[75,190,80,100,125,150,95,110,220].map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
    <TableHead><TableRow>{['code','name','country','contact','phone','email','status','registered','actions'].map(key=><TableCell key={key} align={key==='actions'?'right':'left'}>{labels[key]}</TableCell>)}</TableRow></TableHead>
    <TableBody>
     {loading?<TableStatusRow colSpan={9} state="loading"/>:error||!filtered.length?<TableStatusRow colSpan={9} state={error?'error':'empty'} onRetry={onRetry}/>:filtered.map(row=><TableRow key={row.id} hover onDoubleClick={()=>canOpen&&onOpen(row.source)} sx={{cursor:canOpen?'pointer':'default','& td':{py:1,overflowWrap:'anywhere'}}}>
      <TableCell>{row.code||'-'}</TableCell>
      <TableCell>
       <Stack direction="row" alignItems="center" spacing={.75}>
        <Button variant="text" disabled={!canOpen} onClick={()=>onOpen(row.source)} sx={{p:0,minWidth:0,justifyContent:'flex-start',textAlign:'left',textTransform:'none'}}>{row.name||'-'}</Button>
        {row.attentionLabel && <NotificationIndicator label={row.attentionLabel} />}
       </Stack>
       {row.subtitle && <Typography variant="caption" color="text.secondary">{row.subtitle}</Typography>}
      </TableCell>
      <TableCell>{row.country?getStaticOptionLabel('country',row.country,row.country,languageCode):'-'}</TableCell><TableCell>{row.contactName||'-'}</TableCell><TableCell>{row.phone||'-'}</TableCell><TableCell>{row.email||'-'}</TableCell>
      <TableCell><StatusLabel tone={row.isActive===false?'gray':'green'} label={row.isActive===false?labels.inactive:labels.active}/></TableCell><TableCell>{registeredDate(row.registeredAt,languageCode)}</TableCell>
      <TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center" onDoubleClick={event=>event.stopPropagation()}><Button variant="outlined" disabled={!canOpen} onClick={()=>onOpen(row.source)}>{labels.detail}</Button>{renderActions?.(row.source)}</Stack></TableCell>
     </TableRow>)}
    </TableBody>
   </Table>
  </TableContainer></Paper>{children}
 </Container>;
}
