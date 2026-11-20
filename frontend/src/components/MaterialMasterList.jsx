import MaterialVariantRows,{materialVariantSearch} from './MaterialVariantRows';
import useWorkspaceRefreshOnEvent from '../hooks/useWorkspaceRefreshOnEvent';
import CloseIcon from '@mui/icons-material/Close';
import React,{useCallback,useEffect,useId,useRef,useState} from 'react';
import {Box,Button,Dialog,DialogContent,DialogTitle,IconButton,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import AppNotice from './AppNotice';
import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText,materialItemName} from '../constants/materialItems';
export default function MaterialMasterList({keyword=''}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),t=materialItemText[languageCode]||materialItemText.en;
 const [catalogue,setCatalogue]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [variants,setVariants]=useState([]),[selectedBaseId,setSelectedBaseId]=useState(null);
 const detailTitleId=useId();
 const sequence=useRef(0),scope=useRef(orgId);scope.current=orgId;
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');setVariants([]);setCatalogue(null);try{const [options,stockItems]=await Promise.all([requestJSON('/material-items/catalogue'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/material-items/variants'+buildQueryString({orgId}),{skipCache:true})]);if(token!==sequence.current)return;setCatalogue(options);setVariants(stockItems);}catch{if(token===sequence.current)setError(t.failed);}finally{if(token===sequence.current)setLoading(false);}},[orgId,t.failed]);
 useEffect(()=>{scope.current=orgId;load();return()=>{sequence.current++;scope.current=null;};},[load]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements','inventory-stock','accounting-codes'],isBlocked:selectedBaseId!==null,onRefresh:load});
 const search=keyword.trim().toLocaleLowerCase();
 const grouped=new Map();for(const item of variants){if(!grouped.has(item.baseId))grouped.set(item.baseId,[]);grouped.get(item.baseId).push(item);}
 const matchesCode=row=>[row.base.code,row.base.nameEn,row.base.nameKo,row.base.nameVi].join(' ').toLocaleLowerCase().includes(search);
 const visibleCodes=(catalogue?.codes||[]).filter(row=>matchesCode(row)||(grouped.get(row.baseId)||[]).some(item=>materialVariantSearch(item).includes(search)));
 const selectedCode=catalogue?.codes.find(row=>row.baseId===selectedBaseId);
 return <Stack spacing={2}>{error&&<AppNotice severity="error" action={<Button onClick={load} disabled={loading}>{t.retry}</Button>}>{error}</AppNotice>}
 <TableContainer><Table size="small" data-table-layout="fixed" sx={{width:'100%',tableLayout:'fixed',minWidth:620}}><colgroup><col style={{width:'14%'}}/><col/><col style={{width:'16%'}}/><col style={{width:'12%'}}/><col style={{width:176}}/></colgroup><TableHead><TableRow>{[t.code,t.name,t.unit,t.items,t.actions].map((label,index)=><TableCell key={label} align={index===3?'center':index===4?'right':'left'} sx={index===4?{position:'sticky',right:0,bgcolor:'background.paper',width:176}:undefined}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
  {visibleCodes.map(row=><TableRow key={row.baseId}><TableCell>{row.base.code}</TableCell><TableCell>{materialItemName(row.base,languageCode)}</TableCell><TableCell>{materialItemName(catalogue.units.find(unit=>unit.id===row.base.materialUnitId),languageCode)||'\u2014'}</TableCell><TableCell align="center">{(grouped.get(row.baseId)||[]).length}</TableCell><TableCell align="right" data-table-actions sx={{position:'sticky',right:0,bgcolor:'background.paper',whiteSpace:'nowrap'}}><Button size="small" aria-haspopup="dialog" aria-label={t.viewItems+' \u00b7 '+row.base.code+' \u00b7 '+materialItemName(row.base,languageCode)} onClick={()=>setSelectedBaseId(row.baseId)}>{t.viewItems}</Button></TableCell></TableRow>)}
  {!loading&&!error&&!visibleCodes.length&&<TableRow><TableCell colSpan={5}>{t.empty}</TableCell></TableRow>}
 </TableBody></Table></TableContainer>
 <Dialog open={selectedBaseId!==null} onClose={()=>setSelectedBaseId(null)} fullWidth maxWidth="md" aria-labelledby={detailTitleId}>
  <DialogTitle id={detailTitleId} sx={{display:'flex',alignItems:'center',gap:1}}><Box component="span" sx={{flex:1}}>{[selectedCode?.base.code,materialItemName(selectedCode?.base,languageCode),t.items].filter(Boolean).join(' \u00b7 ')}</Box><IconButton aria-label={t.close} onClick={()=>setSelectedBaseId(null)}><CloseIcon/></IconButton></DialogTitle>
  <DialogContent><MaterialVariantRows rows={grouped.get(selectedBaseId)||[]} languageCode={languageCode}/></DialogContent>
 </Dialog>
 </Stack>;
}
