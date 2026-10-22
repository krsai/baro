import React,{useEffect,useState} from 'react';
import {MenuItem,TextField} from '@mui/material';
import {useAuth} from '../context/AuthContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {INDUSTRY_TREE_TEXT} from '../constants/industryHierarchy';
import {serviceName} from './OutsourcingServiceDialog';

export default function CustomerIndustryField({value,selected,languageCode,disabled,onChange}) {
 const {activeOrgId}=useAuth(),text=INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en;
 const [state,setState]=useState({orgId:null,rows:[],loading:true,error:false});
 useEffect(()=>{let alive=true;setState({orgId:activeOrgId,rows:[],loading:true,error:false});
  requestJSON(`/customer-industries${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
   .then(rows=>{if(alive)setState({orgId:activeOrgId,rows,loading:false,error:false});})
   .catch(()=>{if(alive)setState({orgId:activeOrgId,rows:[],loading:false,error:true});});
  return()=>{alive=false;};
 },[activeOrgId]);
 const rows=state.orgId===activeOrgId?state.rows:[];
 const options=selected&&!rows.some(row=>row.id===selected.id)?[...rows,selected]:rows;
 const errorText={ko:'SYSTEM 업종을 불러오지 못했습니다.',en:'Could not load SYSTEM industries.',vi:'Không thể tải ngành từ SYSTEM.'}[languageCode]||'Could not load SYSTEM industries.';
 return <TextField fullWidth size="small" select label={text.industry} value={value||''} disabled={disabled||state.loading} error={state.error}
  helperText={state.error?errorText:!state.loading&&!options.length?text.empty:undefined}
  onChange={event=>onChange({target:{name:'systemIndustryId',value:event.target.value||null}})}>
  <MenuItem value="">—</MenuItem>{options.map(row=><MenuItem key={row.id} value={row.id} disabled={!row.isActive}>{serviceName(row,languageCode)}</MenuItem>)}
 </TextField>;
}
