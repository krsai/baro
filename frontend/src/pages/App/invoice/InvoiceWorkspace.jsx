import React, { useEffect, useState } from 'react';
import {Box,Button,Typography,TextField,Stack} from '@mui/material';
import Alert from "../../../components/AppNotice";
import AppPageContainer from '../../../components/AppPageContainer';
import InvoicePartyPicker from '../../../components/InvoicePartyPicker';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceEditor from './InvoiceEditor';
import GeneralInvoiceEditor from './GeneralInvoiceEditor';
import {generalInvoiceText} from '../../../constants/generalInvoice';

import InvoiceList from './InvoiceList';
import {useLocation,useParams} from 'react-router-dom';

export default function InvoiceWorkspace({ view = 'list' } = {}) {
  const { activeOrgId } = useAuth();
  return <InvoiceMenuWorkspace key={activeOrgId || 'none'} activeOrgId={activeOrgId} view={view} />;
}

function InvoiceMenuWorkspace({ activeOrgId, view = 'list' }) {
  const { navigateToPath } = useAppActions();
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  const {invoiceId,sourceOrderId:routeOrderId}=useParams();
  const location=useLocation();
  const sourceOrderId=routeOrderId||new URLSearchParams(location.search).get('orderId');
  if (view === 'editor') {
    if(sourceOrderId&&!new URLSearchParams(location.search).has('revision'))return <InvoiceEditor key={activeOrgId+':'+sourceOrderId} orgId={activeOrgId} orderId={sourceOrderId} languageCode={languageCode} onClose={()=>navigateToPath('/order/'+encodeURIComponent(sourceOrderId))} onIssued={()=>navigateToPath('/invoices',{closeTabId:location.pathname,skipUnsavedChangesCheck:true})}/>;
    return <InvoiceCustomerWorkspace activeOrgId={activeOrgId} onBack={() => navigateToPath('/invoices',{closeTabId:'/invoices/new',skipUnsavedChangesCheck:true})} />;
  }
  if(view==='detail')return <InvoiceList key={invoiceId} orgId={activeOrgId} languageCode={languageCode} invoiceId={invoiceId}/>;
  const actions = (
    <Stack direction="row" gap={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button variant="contained" disabled={!activeOrgId} onClick={() => navigateToPath('/invoices/new')}>{t.newInvoice}</Button>
    </Stack>
  );
  return <AppPageContainer title={t.title} titleActions={actions}>
    <InvoiceList key={sourceOrderId||'all'} orgId={activeOrgId} languageCode={languageCode} sourceOrderId={sourceOrderId}/>
  </AppPageContainer>;
}

function InvoiceCustomerWorkspace({ activeOrgId, onBack }) {
  const documentKind='GENERAL';
  const location=useLocation(),revisionId=new URLSearchParams(location.search).get('revision');
  const {languageCode}=useLanguage(),t=invoiceMessages[languageCode]||invoiceMessages.en;
  const general=generalInvoiceText[languageCode]||generalInvoiceText.en;
  const [customers,setCustomers]=useState([]),[customer,setCustomer]=useState(null),[customersLoading,setCustomersLoading]=useState(false),[customersError,setCustomersError]=useState(false);
  const [reload,setReload]=useState(0);
  const [resumeKind,setResumeKind]=useState(null),[resumeError,setResumeError]=useState(false);
  useEffect(()=>{
    if(!revisionId)return;let alive=true;setResumeKind(null);setResumeError(false);
    requestJSON('/invoices/drafts/'+encodeURIComponent(revisionId)+buildQueryString({orgId:activeOrgId}),{skipCache:true}).then(row=>{if(alive)setResumeKind(row.content?.documentKind||'ORDER');}).catch(()=>{if(alive)setResumeError(true);});
    return()=>{alive=false;};
  },[activeOrgId,revisionId,reload]);
  useEffect(()=>{
    if(!activeOrgId||revisionId)return;
    let cancelled=false;setCustomersLoading(true);setCustomersError(false);
    requestJSON(`/invoices/customers${buildQueryString({orgId:activeOrgId,documentKind})}`,{skipCache:true})
      .then(data=>{if(!cancelled)setCustomers(data.rows);}).catch(()=>{if(!cancelled)setCustomersError(true);}).finally(()=>{if(!cancelled)setCustomersLoading(false);});
    return ()=>{cancelled=true;};
  },[activeOrgId,revisionId,reload,documentKind]);
  const renderSelection=({requestChange,disabled})=><Box sx={{display:'flex',alignItems:'flex-start',flexWrap:'wrap',gap:2}}>
    <TextField size="small" sx={{width:180}} label={general.type} value={general.general} slotProps={{input:{readOnly:true}}}/>
    <Box sx={{flex:1,minWidth:260}}><InvoicePartyPicker orgId={activeOrgId} languageCode={languageCode} options={customers} value={customer} disabled={disabled||customersLoading||customersError||!activeOrgId} onChange={value=>{if((value?.id??null)===(customer?.id??null))return;requestChange(()=>setCustomer(value));}}/></Box>
    {customersError&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.customersFailed}</Alert>}
  </Box>;
  if(revisionId&&!resumeKind)return <AppPageContainer title={t.title}>{resumeError?<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>:<Typography>{t.loading||'…'}</Typography>}</AppPageContainer>;
  const Editor=(revisionId?resumeKind:documentKind)==='GENERAL'?GeneralInvoiceEditor:InvoiceEditor;
  return <Editor key={activeOrgId+':'+documentKind} orgId={activeOrgId} buyerOrgId={customer?.id} draftId={revisionId} languageCode={languageCode} onClose={onBack} onIssued={onBack} renderSelection={revisionId?null:renderSelection}/>;
}
