import Dialog from './AppDialog';
import ListPagination from './DashboardPagination';
import React,{useEffect,useState} from 'react';
import {Box,Button,CircularProgress,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import AppNotice from './AppNotice';
import DashboardAlertItem from './DashboardAlertItem';
import {inventoryBalanceText} from '../constants/inventoryBalanceAlerts';
import {materialItemName} from '../constants/materialItems';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../hooks/useWorkspaceRefreshOnEvent';
import useChangeDrivenEffect from '../hooks/useChangeDrivenEffect';
import {useRequestScopeContext} from '../context/RequestScopeContext';
const number=value=>{const [whole,fraction='']=String(value??'0').split('.');const decimals=fraction.replace(/0+$/,'');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimals?'.'+decimals:'');};
export default function InventoryBalanceAlerts({orgId,...props}){return <Alerts key={orgId} orgId={orgId} {...props}/>;}
function Alerts({orgId,languageCode='ko',onNavigate,canOpenHistory=false}){
 const t=inventoryBalanceText[languageCode]||inventoryBalanceText.en,{active}=useRequestScopeContext();
 const [data,setData]=useState(null),[page,setPage]=useState(0),[reload,setReload]=useState(0),[error,setError]=useState(false),[loading,setLoading]=useState(false),[selected,setSelected]=useState(null),[visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
 useEffect(()=>{const change=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements','inventory-stock','inventory-approvals'],isActive:active&&visible,isBlocked:Boolean(selected),onRefresh:()=>setReload(value=>value+1)});
 useChangeDrivenEffect(()=>{
  let live=true;const controller=new AbortController();setLoading(true);
  requestJSON('/inventory-entry/negative-stock'+buildQueryString({orgId,page}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(result=>{if(!live)return;if(page&&!result.rows.length){setPage(0);return;}setData(result);setError(false);}).catch(e=>{if(live&&e.name!=='AbortError'){if(e.status===403)setData(null);setError(true);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[orgId,page,reload],{active:active&&visible,blocked:Boolean(selected)});
 const name=row=>materialItemName(row.master,languageCode),owner=row=>materialItemName(row.attributes.owner,languageCode)||row.attributes.owner?.name||'',unit=row=>materialItemName(row.master.unit,languageCode);
 const details=row=>[owner(row),materialItemName(row.attributes.type,languageCode),row.attributes.color?.code,['length','width','height'].map(axis=>row.attributes.dimensions?.[axis]).filter(Boolean).join(' × ')].filter(Boolean).join(' / ');
 const close=()=>{setSelected(null);setReload(value=>value+1);};
 return <Stack spacing={1} data-testid="inventory-balance-alerts">
  {error&&<AppNotice severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}
  {loading&&!data&&<CircularProgress size={20}/>}
  {data?.rows.map(row=><DashboardAlertItem key={row.variantId} languageCode={languageCode} kind="negative-stock" title={[t.title,row.master.baseSnapshot?.code,name(row)].filter(Boolean).join(' · ')} detail={<>{details(row)} · {t.balance} <Box component="span" sx={{color:'error.main',fontWeight:600}}>{number(row.balance)} {unit(row)}</Box></>} onClick={()=>setSelected(row)}/>)}
  {data?.total>10&&<ListPagination label={t.title} languageCode={languageCode} onPrevious={()=>setPage(value=>value-1)} onNext={()=>setPage(value=>value+1)} previousDisabled={loading||page===0} nextDisabled={loading||(page+1)*10>=data.total}></ListPagination>}
  <Dialog open={Boolean(selected)} onClose={close} fullWidth maxWidth="sm"><DialogTitle>{t.title}</DialogTitle><DialogContent>{selected&&<Stack spacing={2} sx={{pt:1}}><Typography fontWeight={600}>{[selected.master.baseSnapshot?.code,name(selected)].filter(Boolean).join(' / ')}</Typography><Typography>{details(selected)}</Typography><Box component="dl" sx={{display:'grid',gridTemplateColumns:'auto 1fr',gap:1,m:0}}>{[[t.received,number(selected.received)],[t.issued,number(selected.issued)],[t.balance,number(selected.balance)]].map(([label,value])=><React.Fragment key={label}><Typography component="dt">{label}</Typography><Typography component="dd" sx={{m:0,color:label===t.balance?'error.main':undefined,fontVariantNumeric:'tabular-nums'}}>{value} {unit(selected)}</Typography></React.Fragment>)}</Box><Typography variant="caption" color="text.secondary">{t.approvedOnly}</Typography></Stack>}</DialogContent><DialogActions><Button onClick={close}>{t.close}</Button>{canOpenHistory&&<Button variant="contained" onClick={()=>{const id=selected.variantId;close();onNavigate('/inventory/movements'+buildQueryString({variantId:id}));}}>{t.history}</Button>}</DialogActions></Dialog>
 </Stack>;
}
