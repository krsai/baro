import {accountingPendingText} from '../utils/approvalCard';
import DashboardAlertItem from './DashboardAlertItem';
import React,{useEffect,useRef,useState} from 'react';
import DashboardDocumentDialog from './DashboardDocumentDialog';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import {accountingAlertText} from '../constants/accountingAlerts';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged,subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {useRequestScopeContext} from '../context/RequestScopeContext';

export default function AccountingAlerts({orgId,languageCode='ko',onNavigate,settings={},showEmpty=false}){
 const text=accountingAlertText[languageCode]||accountingAlertText.en,{active}=useRequestScopeContext();
 const pendingText=(accountingPendingText[languageCode]||accountingPendingText.en).pending;
 const kinds=[...(settings['accounting-direction']===false?[]:['DIRECTION']),...(settings['accounting-partner']===false?[]:['PARTNER_INDUSTRY'])].join(',');
 const [selected,setSelected]=useState(null),[review,setReview]=useState(null),[reviewError,setReviewError]=useState(null);
 const [data,setData]=useState(null),[page,setPage]=useState(0),[reload,setReload]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const acknowledging=useRef(false),detailOpen=Boolean(selected||review);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.some(topic=>['change-approvals','bank-ledger','expense-requests','accounting-alerts','transaction-codes','partner-classifications','business-partners'].includes(topic)))setReload(value=>value+1);}),[orgId]);
 useEffect(()=>{
  if(!active||!kinds||detailOpen)return;
  let live=true,pending=false,timer,lastAttempt=0;const controller=new AbortController();
  const load=async()=>{
   if(!live||pending||document.visibilityState==='hidden')return;
   pending=true;lastAttempt=Date.now();setLoading(true);clearTimeout(timer);
   try{
    const result=await requestJSON('/dashboard/accounting-alerts'+buildQueryString({orgId,page,kinds}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal});
    if(live){if(page&&!result.rows.length&&page*10>=result.total)setPage(0);else setData(result);setError('');timer=setTimeout(load,30000);}
   }catch(error){if(live&&error.name!=='AbortError')setError(text.failed);}
   finally{pending=false;if(live)setLoading(false);}
  };
  void load();const focus=()=>{if(Date.now()-lastAttempt>=30000)void load();};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{live=false;controller.abort();clearTimeout(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[orgId,page,reload,active,kinds,text.failed,detailOpen]);
 const openReview=row=>{if(acknowledging.current||row.pendingOperation)return;setReviewError(null);setReview(row);};
 const closeReview=()=>{if(!acknowledging.current){setReview(null);setReviewError(null);}};
 const acknowledge=async row=>{
  if(!row||acknowledging.current||row.pendingOperation||reviewError?.stale||review?.signature!==row.signature)return;
  acknowledging.current=true;setBusy(true);setReviewError(null);
  try{
   await requestJSON('/dashboard/accounting-alerts/acknowledge'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({signature:row.signature})});
   setData(current=>current?{...current,rows:current.rows.filter(item=>item.signature!==row.signature),total:Math.max(0,current.total-1)}:current);
   setReview(null);
   emitWorkspaceDataChanged({orgId,source:'accounting-alerts',topics:['accounting-alerts']});
  }catch(error){
   setReviewError({stale:error.status===409,pending:error.message==='ACCOUNTING_ALERT_PENDING'});
   if(error.status===409)setReload(value=>value+1);
  }finally{acknowledging.current=false;setBusy(false);}
 };
 if(!kinds)return null;
 return <Stack spacing={1} data-testid="accounting-alerts">
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{text.retry}</Button>}>{error}</Alert>}
  {loading&&!data&&<CircularProgress size={20}/>}
  {showEmpty&&data?.total===0&&!error&&<Typography color="text.secondary">{text.empty}</Typography>}
  {data?.rows.map(row=><Box key={row.signature} data-accounting-alert={row.kind} sx={{position:'relative'}}>
   <DashboardAlertItem languageCode={languageCode} showConfirm={false} title={text[row.kind]} detail={[row.date,row.reference,row.partyName,row.code,row.description,row.kind==='DIRECTION'?text.expected+': '+text[row.expectedDirection]+' · '+text.actual+': '+text[row.actualDirection]:null].filter(Boolean).join(' · ')} onClick={row.pendingOperation?undefined:()=>setSelected(row)} actions={<Button size="small" disabled={busy||Boolean(row.pendingOperation)} onClick={()=>openReview(row)}>{row.pendingOperation?pendingText:text.confirm}</Button>}/>
  </Box>)}
  {!!data?.total&&data.total>10&&<Stack direction="row" justifyContent="flex-end" spacing={1}><Button disabled={!page||loading||busy} onClick={()=>setPage(value=>value-1)}>{text.previous}</Button><Button disabled={(page+1)*10>=data.total||loading||busy} onClick={()=>setPage(value=>value+1)}>{text.next}</Button></Stack>}
  <Dialog open={Boolean(review)} onClose={closeReview} fullWidth maxWidth="sm" aria-labelledby="accounting-alert-review-title">
   <DialogTitle id="accounting-alert-review-title">{text.review}</DialogTitle>
   <DialogContent><Stack spacing={2}>
    <Alert severity="warning">{text[review?.kind]}</Alert>
    {reviewError&&<Alert severity="error" action={reviewError.stale?<Button disabled={busy} onClick={()=>{closeReview();setReload(value=>value+1);}}>{text.refreshAlert}</Button>:undefined}>{reviewError.pending?pendingText:reviewError.stale?text.stale:text.failed}</Alert>}
    <Box component="dl" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'auto 1fr'},gap:1.25,m:0}}>
     {[[text.date,review?.date],[text.party,review?.partyName],[text.reference,review?.reference],[text.code,review?.code],[text.description,review?.description],...(review?.kind==='DIRECTION'?[[text.expected,text[review.expectedDirection]],[text.actual,text[review.actualDirection]]]:[])].filter(([,value])=>value).map(([label,value])=><React.Fragment key={label}><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,overflowWrap:'anywhere'}}>{value}</Typography></React.Fragment>)}
    </Box>
    <Typography variant="body2" color="text.secondary">{text.personalNote}</Typography>
   </Stack></DialogContent>
   <DialogActions><Button disabled={busy} onClick={()=>setSelected(review)}>{text.openSource}</Button><Button variant="contained" disabled={busy||Boolean(reviewError?.stale)} onClick={()=>acknowledge(review)}>{busy?<CircularProgress size={18} color="inherit"/>:text.confirm}</Button></DialogActions>
  </Dialog>
  {selected&&<React.Suspense fallback={<CircularProgress size={20}/>}><DashboardDocumentDialog key={orgId} row={selected} languageCode={languageCode} onClose={()=>setSelected(null)} onNavigate={(...args)=>{closeReview();onNavigate(...args);}}/></React.Suspense>}
 </Stack>;
}
