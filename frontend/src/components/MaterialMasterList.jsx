import {createPortal} from 'react-dom';
import MaterialVariantRows,{materialVariantSearch} from './MaterialVariantRows';
import MaterialVariantEditor from './MaterialVariantEditor';
import {materialVariantManagementText,variantManagementError} from '../constants/materialVariantManagement';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import AddIcon from '@mui/icons-material/Add';
import useWorkspaceRefreshOnEvent from '../hooks/useWorkspaceRefreshOnEvent';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Box,Button,LinearProgress,Stack} from '@mui/material';
import AppNotice from './AppNotice';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText} from '../constants/materialItems';
export default function MaterialMasterList({keyword='',actionContainer}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),t=materialItemText[languageCode]||materialItemText.en;
 const [catalogue,setCatalogue]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[variants,setVariants]=useState([]);
 const [registerOpen,setRegisterOpen]=useState(false),[editor,setEditor]=useState(null),[deleting,setDeleting]=useState(false),[variantError,setVariantError]=useState('');
 const deletion=useRef(null),dialogs=usePageDialogs(),{showNotification}=useAppActions(),m=materialVariantManagementText[languageCode]||materialVariantManagementText.en;
 const sequence=useRef(0),scope=useRef(orgId);scope.current=orgId;
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');try{const [options,stockItems]=await Promise.all([requestJSON('/material-items/catalogue'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/material-items/variants'+buildQueryString({orgId}),{skipCache:true})]);if(token!==sequence.current)return;setCatalogue(options);setVariants(stockItems);}catch{if(token===sequence.current)setError(t.failed);}finally{if(token===sequence.current)setLoading(false);}},[orgId,t.failed]);
 useEffect(()=>{scope.current=orgId;setRegisterOpen(false);setEditor(null);setCatalogue(null);setVariants([]);load();return()=>{sequence.current++;scope.current=null;};},[load]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements','inventory-stock','accounting-codes'],isBlocked:registerOpen||Boolean(editor)||deleting||Boolean(deletion.current),onRefresh:load});
 const search=keyword.trim().toLocaleLowerCase();
 const rows=variants.map(row=>{const code=catalogue?.codes.find(code=>code.baseId===row.baseId);return {...row,base:code?.base||row.baseSnapshot||{},editable:Boolean(code)};}).filter(row=>[row.base.code,row.base.nameEn,row.base.nameKo,row.base.nameVi,materialVariantSearch(row)].join(' ').toLocaleLowerCase().includes(search));
 const changed=()=>emitWorkspaceDataChanged({orgId,topics:['inventory-movements','inventory-stock']});
 const remove=async row=>{if(deleting)return;if(!deletion.current&&!await dialogs.confirm(m.confirm,{title:m.remove}))return;deletion.current??=row;setDeleting(true);setVariantError('');try{await requestJSON('/material-items/variants/'+row.id+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({revision:row.revision})});if(scope.current!==orgId)return;deletion.current=null;showNotification(m.deleted,'success');changed();await load();}catch(e){if(scope.current!==orgId)return;if(e.status>=400&&e.status<500)deletion.current=null;setVariantError(variantManagementError(e,m));}finally{if(scope.current===orgId)setDeleting(false);}};
 const registrationAction=<Box sx={{display:'flex',justifyContent:'flex-end',gap:1}}><Button variant="contained" startIcon={<AddIcon/>} disabled={loading||!catalogue?.codes?.length||Boolean(error)} onClick={()=>setRegisterOpen(true)}>{m.add}</Button></Box>;
 return <Stack spacing={2}>
 {error&&<AppNotice severity="error" action={<Button onClick={load} disabled={loading}>{t.retry}</Button>}>{error}</AppNotice>}
 {variantError&&<AppNotice severity="error" action={deletion.current?<Button onClick={()=>remove(deletion.current)} disabled={deleting}>{t.retry}</Button>:undefined}>{variantError}</AppNotice>}
 {actionContainer===undefined?registrationAction:actionContainer?createPortal(registrationAction,actionContainer):null}
 {loading&&<LinearProgress/>}
 {!loading&&!error&&<MaterialVariantRows rows={rows} showCode languageCode={languageCode} onEdit={row=>setEditor(row)} onDelete={remove} disabled={deleting||Boolean(deletion.current)}/>}
 {registerOpen&&<MaterialVariantEditor orgId={orgId} codes={catalogue?.codes||[]} languageCode={languageCode} onClose={()=>setRegisterOpen(false)} onSaved={()=>{setRegisterOpen(false);showNotification(m.saved,'success');changed();load();}}/>}
 {editor&&<MaterialVariantEditor orgId={orgId} baseId={editor.baseId} row={editor} languageCode={languageCode} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);showNotification(m.saved,'success');changed();load();}}/>}
 </Stack>;
}
