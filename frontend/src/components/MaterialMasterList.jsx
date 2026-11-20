import {createPortal} from 'react-dom';
import MaterialVariantRows,{materialVariantSearch} from './MaterialVariantRows';
import MaterialVariantEditor from './MaterialVariantEditor';
import ExpenseLookupField from './ExpenseLookupField';
import {materialVariantManagementText,variantManagementError} from '../constants/materialVariantManagement';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import AddIcon from '@mui/icons-material/Add';
import useWorkspaceRefreshOnEvent from '../hooks/useWorkspaceRefreshOnEvent';
import React,{useCallback,useEffect,useId,useRef,useState} from 'react';
import {Box,Button,Dialog,DialogContent,DialogTitle,LinearProgress,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import AppNotice from './AppNotice';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText,materialItemName} from '../constants/materialItems';
export default function MaterialMasterList({keyword='',actionContainer}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),t=materialItemText[languageCode]||materialItemText.en;
 const [catalogue,setCatalogue]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [variants,setVariants]=useState([]),[selectedBaseId,setSelectedBaseId]=useState(null);
 const [registerOpen,setRegisterOpen]=useState(false);
 const [editor,setEditor]=useState(null),[deleting,setDeleting]=useState(false),[variantError,setVariantError]=useState('');
 const deletion=useRef(null),dialogs=usePageDialogs(),{showNotification}=useAppActions(),m=materialVariantManagementText[languageCode]||materialVariantManagementText.en;
 const detailTitleId=useId();
 const sequence=useRef(0),scope=useRef(orgId);scope.current=orgId;
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');setVariants([]);setCatalogue(null);try{const [options,stockItems]=await Promise.all([requestJSON('/material-items/catalogue'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/material-items/variants'+buildQueryString({orgId}),{skipCache:true})]);if(token!==sequence.current)return;setCatalogue(options);setVariants(stockItems);}catch{if(token===sequence.current)setError(t.failed);}finally{if(token===sequence.current)setLoading(false);}},[orgId,t.failed]);
 useEffect(()=>{scope.current=orgId;load();return()=>{sequence.current++;scope.current=null;};},[load]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements','inventory-stock','accounting-codes'],isBlocked:registerOpen||selectedBaseId!==null,onRefresh:load});
 const search=keyword.trim().toLocaleLowerCase();
 const grouped=new Map();for(const item of variants){if(!grouped.has(item.baseId))grouped.set(item.baseId,[]);grouped.get(item.baseId).push(item);}
 const matchesCode=row=>[row.base.code,row.base.nameEn,row.base.nameKo,row.base.nameVi].join(' ').toLocaleLowerCase().includes(search);
 const visibleCodes=(catalogue?.codes||[]).filter(row=>matchesCode(row)||(grouped.get(row.baseId)||[]).some(item=>materialVariantSearch(item).includes(search)));
 const selectedCode=catalogue?.codes.find(row=>row.baseId===selectedBaseId);
 const changed=()=>emitWorkspaceDataChanged({orgId,topics:['inventory-movements','inventory-stock']});
 const remove=async row=>{if(deleting)return;if(!deletion.current&&!await dialogs.confirm(m.confirm,{title:m.remove}))return;deletion.current??=row;setDeleting(true);setVariantError('');try{await requestJSON('/material-items/variants/'+row.id+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({revision:row.revision})});if(scope.current!==orgId)return;deletion.current=null;showNotification(m.deleted,'success');changed();await load();}catch(e){if(scope.current!==orgId)return;if(e.status>=400&&e.status<500)deletion.current=null;setVariantError(variantManagementError(e,m));}finally{if(scope.current===orgId)setDeleting(false);}};
 const closeDetails=()=>{if(!deleting&&!deletion.current&&!editor){setSelectedBaseId(null);setVariantError('');}};
 const registrationAction=<Box sx={{display:'flex',justifyContent:'flex-end'}}><Button variant="contained" startIcon={<AddIcon/>} disabled={loading||!catalogue||Boolean(error)} onClick={()=>{setRegisterOpen(true);}}>{t.registerMaster}</Button></Box>;
 return <Stack spacing={2}>{error&&selectedBaseId===null&&<AppNotice severity="error" action={<Button onClick={load} disabled={loading}>{t.retry}</Button>}>{error}</AppNotice>}
 {actionContainer===undefined?registrationAction:actionContainer?createPortal(registrationAction,actionContainer):null}
 {registerOpen&&<MaterialVariantEditor orgId={orgId} codes={catalogue?.codes||[]} languageCode={languageCode} onClose={()=>setRegisterOpen(false)} onSaved={()=>{setRegisterOpen(false);showNotification(m.saved,'success');changed();load();}}/>}
 <TableContainer><Table size="small" data-table-layout="fixed" sx={{width:'100%',tableLayout:'fixed',minWidth:620}}><colgroup><col style={{width:'14%'}}/><col/><col style={{width:'16%'}}/><col style={{width:'12%'}}/><col style={{width:176}}/></colgroup><TableHead><TableRow>{[t.code,t.name,t.unit,t.items,t.actions].map((label,index)=><TableCell key={label} align={index===3?'center':index===4?'right':'left'} sx={index===4?{position:'sticky',right:0,bgcolor:'background.paper',width:176}:undefined}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
  {visibleCodes.map(row=><TableRow key={row.baseId}><TableCell>{row.base.code}</TableCell><TableCell>{materialItemName(row.base,languageCode)}</TableCell><TableCell>{materialItemName(catalogue.units.find(unit=>unit.id===row.base.materialUnitId),languageCode)||'\u2014'}</TableCell><TableCell align="center">{(grouped.get(row.baseId)||[]).length}</TableCell><TableCell align="right" data-table-actions sx={{position:'sticky',right:0,bgcolor:'background.paper',whiteSpace:'nowrap'}}><Button size="small" aria-haspopup="dialog" aria-label={t.viewItems+' \u00b7 '+row.base.code+' \u00b7 '+materialItemName(row.base,languageCode)} onClick={()=>setSelectedBaseId(row.baseId)}>{t.viewItems}</Button></TableCell></TableRow>)}
  {!loading&&!error&&!visibleCodes.length&&<TableRow><TableCell colSpan={5}>{t.empty}</TableCell></TableRow>}
 </TableBody></Table></TableContainer>
 <Dialog open={selectedBaseId!==null} onClose={closeDetails} fullWidth maxWidth="md" aria-labelledby={detailTitleId}>
  <DialogTitle id={detailTitleId} sx={{display:'flex',alignItems:'center',gap:1}}><Box component="span" sx={{flex:1,minWidth:0,overflowWrap:'anywhere'}}>{[selectedCode?.base.code,materialItemName(selectedCode?.base,languageCode),t.items].filter(Boolean).join(' \u00b7 ')}</Box><Button variant="contained" sx={{flexShrink:0,whiteSpace:'nowrap'}} startIcon={<AddIcon/>} disabled={loading||deleting||Boolean(deletion.current)||!selectedCode?.base.materialUnitId} onClick={()=>setEditor({row:null})}>{m.add}</Button></DialogTitle>
  <DialogContent><Stack spacing={2} sx={{pt:2}}>{variantError&&<AppNotice severity="error" action={deletion.current?<Button onClick={()=>remove(deletion.current)} disabled={deleting}>{t.retry}</Button>:undefined}>{variantError}</AppNotice>}{loading&&<LinearProgress/>}{error&&<AppNotice severity="error" action={<Button onClick={load}>{t.retry}</Button>}>{error}</AppNotice>}{!loading&&!error&&<MaterialVariantRows rows={grouped.get(selectedBaseId)||[]} languageCode={languageCode} onEdit={row=>setEditor({row})} onDelete={remove} disabled={deleting||Boolean(deletion.current)}/>}</Stack></DialogContent>
 </Dialog>
 {editor&&<MaterialVariantEditor orgId={orgId} baseId={selectedBaseId} row={editor.row} languageCode={languageCode} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);showNotification(m.saved,'success');changed();load();}}/>}
 </Stack>;
}
