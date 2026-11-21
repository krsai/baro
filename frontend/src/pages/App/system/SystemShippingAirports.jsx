import TableStatusRow from '../../../components/TableStatusRow';
import SearchPanel from '../../../components/SearchPanel';
import SearchInput from '../../../components/SearchInput';
import useChangeDrivenEffect from '../../../hooks/useChangeDrivenEffect';
﻿import React,{useEffect,useState} from 'react';
import {Button,LinearProgress,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppNotice from '../../../components/AppNotice';
import AppPageContainer from '../../../components/AppPageContainer';
import {useLanguage} from '../../../context/LanguageContext';
import {useRequestScopeContext} from '../../../context/RequestScopeContext';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
const text={
 ko:{title:'공항 목록',search:'공항명·IATA·ICAO·국가 검색',code:'IATA',icao:'ICAO',name:'공항명',city:'도시',country:'국가',retry:'다시 시도',failed:'공항 목록을 불러오지 못했습니다.',empty:'조회된 공항이 없습니다.',total:'검색 결과 {count}건'},
 en:{title:'Airports',search:'Search airport, IATA, ICAO or country',code:'IATA',icao:'ICAO',name:'Airport name',city:'City',country:'Country',retry:'Retry',failed:'Could not load airports.',empty:'No airports found.',total:'{count} results'},
 vi:{title:'Danh sách sân bay',search:'Tìm sân bay, IATA, ICAO hoặc quốc gia',code:'IATA',icao:'ICAO',name:'Tên sân bay',city:'Thành phố',country:'Quốc gia',retry:'Thử lại',failed:'Không thể tải danh sách sân bay.',empty:'Không tìm thấy sân bay.',total:'{count} kết quả'}
};
export default function SystemShippingAirports({embedded=false}){
 const {languageCode}=useLanguage(),t=text[languageCode]||text.en,{active}=useRequestScopeContext();
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useChangeDrivenEffect(()=>{if(!active)return;let live=true;setLoading(true);setError(false);const timer=setTimeout(()=>requestJSON('/system/shipping-airports'+buildQueryString({q:query}),{skipCache:true}).then(value=>{if(live)setRows(value.rows);}).catch(()=>{if(live)setError(true);}).finally(()=>{if(live)setLoading(false);}),180);return()=>{live=false;clearTimeout(timer);};},[query,reload],{active:active});
 const Container=embedded?React.Fragment:AppPageContainer;
 return <Container {...(embedded?{}:{title:t.title})}><Stack spacing={2}>
 <SearchPanel onReset={()=>setQuery('')} search={<SearchInput size="small" placeholder={t.search} inputProps={{'aria-label':t.search}} value={query} slotProps={{htmlInput:{maxLength:160}}} onChange={e=>setQuery(e.target.value)}/>}/>
 {error&&<AppNotice severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}
 {loading&&<LinearProgress/>}
 <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{['code','icao','name','city','country'].map(key=><TableCell key={key}>{t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{row.icao}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.city}</TableCell><TableCell>{row.country}</TableCell></TableRow>)}{!loading&&!error&&!rows.length&&<TableStatusRow colSpan={5} languageCode={languageCode} state="empty"/>}</TableBody></Table></TableContainer>{!error&&<Typography variant="caption" component="div" sx={{p:1}}>{t.total.replace('{count}',String(rows.length))}</Typography>}</Paper>
 </Stack></Container>;
}
