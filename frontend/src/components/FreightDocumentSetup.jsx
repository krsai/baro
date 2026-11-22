import React,{useEffect,useState} from 'react';
import {Button,MenuItem,Paper,Stack,TextField} from '@mui/material';
import SaveButton from './SaveButton';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {documentTypes,freightWorkflowText} from '../constants/freightWorkflow';

export default function FreightDocumentSetup({job,languageCode,busy,onSave,onNext,onDirtyChange}){
 const t=freightWorkflowText[languageCode]||freightWorkflowText.en,types=documentTypes(job);
 const initial=job.data.documentSetup||{composition:job.bills.some(row=>row.kind==='HOUSE')?(job.bills.some(row=>row.kind==='MASTER')?'MASTER_HOUSE':'HOUSE_ONLY'):'MASTER_ONLY',documentType:types[0]};
 const [value,setValue]=useState(initial),dirty=JSON.stringify(value)!==JSON.stringify(initial);
 useUnsavedChanges(dirty);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 return <Paper variant="outlined" sx={{p:1.5}}><Stack spacing={1} direction={{xs:'column',sm:'row'}} useFlexGap flexWrap="wrap" alignItems={{xs:'stretch',sm:'center'}} sx={{'& > .MuiFormControl-root':{flex:1,minWidth:200}}}>
 <TextField id="freight-document-composition" select slotProps={{select:{SelectDisplayProps:{'aria-label':t.composition,'aria-labelledby':undefined}}}} label={t.composition} value={value.composition} disabled={busy} onChange={e=>setValue(old=>({...old,composition:e.target.value}))}>{['MASTER_ONLY','MASTER_HOUSE','HOUSE_ONLY'].map(key=><MenuItem key={key} value={key}>{t[key]}</MenuItem>)}</TextField>
 <TextField id="freight-document-type" select slotProps={{select:{SelectDisplayProps:{'aria-label':t.documentType,'aria-labelledby':undefined}}}} label={t.documentType} value={value.documentType} disabled={busy} onChange={e=>setValue(old=>({...old,documentType:e.target.value}))}>{types.map(key=><MenuItem key={key} value={key}>{t[key]}</MenuItem>)}</TextField>
 <Stack direction="row" spacing={1} justifyContent="flex-end"><Button disabled={busy||!dirty} onClick={()=>setValue(initial)}>{t.cancel}</Button><SaveButton loading={busy} disabled={!dirty&&!!job.data.documentSetup} onClick={()=>onSave({...value,version:job.version}).catch(()=>{})}>{t.save}</SaveButton>{onNext&&job.data.documentSetup&&!dirty&&<Button onClick={onNext}>{t.next}</Button>}</Stack>
 </Stack></Paper>;
}
