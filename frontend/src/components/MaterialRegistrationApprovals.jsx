import Dialog from './AppDialog';
import {changeApprovalText} from '../constants/changeApprovals';
import {materialItemName} from '../constants/materialItems';
import React,{useEffect,useState} from 'react';
import {Button,DialogTitle,DialogContent,DialogActions,Stack,Table,TableHead,TableBody,TableRow,TableCell,TextField,Typography,TableContainer} from '@mui/material';
import AppNotice from './AppNotice';
import MaterialItemPicker from './MaterialItemPicker';
import {materialRegistrationText} from '../constants/materialRegistration';
import {requestJSON,buildQueryString} from '../utils/apiClient';
export default function MaterialRegistrationApprovals({orgId,languageCode,onClose,onChanged}){
 const t=materialRegistrationText[languageCode]||materialRegistrationText.en;
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState(null),[typeText,setTypeText]=useState(''),[reason,setReason]=useState(''),[existing,setExisting]=useState(null);
 useEffect(()=>{let live=true;setBusy(true);setError('');requestJSON('/material-items/registration-requests'+buildQueryString({orgId}),{skipCache:true}).then(data=>{if(live)setRows(data);}).catch(()=>{if(live)setError(t.failed);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[orgId,reload]);
 const review=row=>{setSelected(row);setTypeText(row.payload.typeText||'');setReason('');setExisting(null);setError('');};
 const decide=async action=>{if(busy)return;setBusy(true);setError('');try{await requestJSON('/material-items/registration-requests/'+selected.id+'/decision'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({revision:selected.revision,action,typeText,reason,variantId:existing?.variantId,variantRevision:existing?.variantRevision??existing?.data?.variantRevision})});setSelected(null);setReload(n=>n+1);onChanged();}catch{setError(t.failed);}finally{setBusy(false);}};
 const next=selected?.steps?.find(s=>!s.decision),final=Boolean(next)&&!selected.steps.some(s=>s.position>next.position);
 return <Dialog open fullWidth maxWidth="md" onClose={busy?undefined:onClose}><DialogTitle>{t.requests}</DialogTitle><DialogContent><Stack spacing={2}>
 {error&&<AppNotice severity="error" action={<Button onClick={()=>{setSelected(null);setReload(n=>n+1);}} disabled={busy}>{t.retry}</Button>}>{error}</AppNotice>}
 {!selected?<TableContainer><Table size="small" sx={{minWidth:600,'& th:last-child, & td:last-child':{position:'sticky',right:0,bgcolor:'background.paper',width:88}}}><TableHead><TableRow><TableCell>{t.drafter}</TableCell><TableCell>{t.name}</TableCell><TableCell>{t.status}</TableCell><TableCell/></TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell>{row.drafterName}</TableCell><TableCell>{row.payload.typeText}{row.status==='APPROVED'&&<Typography variant="body2">{materialItemName(row.steps?.at(-1)?.decision?.variantSnapshot?.type,languageCode)}</Typography>}</TableCell><TableCell>{t[row.status]}</TableCell><TableCell><Button onClick={()=>review(row)} disabled={busy}>{t.review}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>:<>
 <Typography>{selected.drafterName} / {selected.payload.snapshot?.owner?.name}</Typography>
 <TextField label={t.name} value={typeText} onChange={e=>setTypeText(e.target.value)} disabled={busy||!selected.canDecide||!final} inputProps={{maxLength:100}}/>
 <Typography variant="subtitle2">{t.similar}</Typography><MaterialItemPicker orgId={orgId} baseId={selected.baseId} context="MATERIAL" selectVariants allowRegistration={false} languageCode={languageCode} disabled={busy||!selected.canDecide||!final} value={existing?.id} snapshot={existing?.data} onChange={setExisting}/>
 <TextField label={t.reason} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||!selected.canDecide} multiline minRows={2} inputProps={{maxLength:2000}}/>
 {selected.steps.map(s=><Typography key={s.position}>{s.stage?.name||s.stage?.employeeId} / {s.decision?t[s.decision.action==='REJECT'?'REJECTED':'APPROVED']:t.pending}{s.decision?.reason?' / '+s.decision.reason:''}</Typography>)}
 {selected.canDecide&&<Stack direction="row" spacing={1} flexWrap="wrap"><Button disabled={busy||!reason.trim()} onClick={()=>decide('REJECT')}>{t.reject}</Button>{final&&<Button disabled={busy||!existing} onClick={()=>decide('EXISTING')}>{t.existing}</Button>}<Button variant="contained" disabled={busy} onClick={()=>decide('APPROVE')}>{final?t.approve:(changeApprovalText[languageCode]||changeApprovalText.en).approve}</Button></Stack>}
 <Button disabled={busy} onClick={()=>setSelected(null)}>{t.cancel}</Button></>}
 </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{t.cancel}</Button></DialogActions></Dialog>;
}
