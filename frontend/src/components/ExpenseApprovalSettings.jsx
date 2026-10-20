import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import DragIndicator from '@mui/icons-material/DragIndicator';
import DeleteActionButton from './DeleteActionButton';
import { EXPENSE_HEADER_TEXT } from '../constants/expenseRequest';
import { requestJSON, buildQueryString } from '../utils/apiClient';

export default function ExpenseApprovalSettings({ orgId, languageCode, value = [], steps = [], disabled, onChange }) {
  const labels = EXPENSE_HEADER_TEXT[languageCode] || EXPENSE_HEADER_TEXT.en;
  const [open,setOpen]=useState(false), [draft,setDraft]=useState([]), [options,setOptions]=useState([]), [loading,setLoading]=useState(false), [error,setError]=useState(false);
  useEffect(()=>{setOpen(false);setDraft([]);setOptions([]);},[orgId]);
  useEffect(()=>{
    if(!open)return;
    let alive=true;setLoading(true);setError(false);
    requestJSON(`/expense-approval-candidates${buildQueryString({orgId})}`,{skipCache:true})
      .then(rows=>{if(alive)setOptions(rows);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[open,orgId]);
  const name=id=>options.find(row=>row.id===id)?.name || steps.find(row=>row.employeeId===id)?.employee?.name || String(id);
  return <>
    <Box sx={{display:'flex',alignItems:'center',gap:1.5,minWidth:0,height:36}}>
      <Typography color="text.secondary" sx={{flexShrink:0}}>{labels.approval}</Typography>
      <Typography noWrap sx={{minWidth:0,flex:1}} title={value.map(name).join(' → ')}>{value.length ? value.map(name).join(' → ') : labels.empty}</Typography>
      <Button disabled={disabled} onClick={()=>{setDraft([...value]);setOpen(true);}} sx={{flexShrink:0}} aria-label={labels.approval}>{labels.configure}</Button>
    </Box>
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>{labels.approval}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{labels.loadError}</Alert>}
        <DragDropContext onDragEnd={({source,destination})=>{if(!destination)return;setDraft(current=>{const next=[...current];next.splice(destination.index,0,next.splice(source.index,1)[0]);return next;});}}>
          <Droppable droppableId="expense-approvers">{provided=><Stack ref={provided.innerRef} {...provided.droppableProps} spacing={1} sx={{pt:1}}>
            {draft.map((id,index)=><Draggable key={id || `empty-${index}`} draggableId={String(id || `empty-${index}`)} index={index}>{drag=><Stack direction="row" alignItems="center" spacing={1} ref={drag.innerRef} {...drag.draggableProps}>
              <span {...drag.dragHandleProps}><DragIndicator fontSize="small" /></span><Typography>{index+1}</Typography>
              <TextField select fullWidth label={labels.approver} value={id || ''} disabled={loading || error} onChange={event=>setDraft(current=>current.map((item,i)=>i===index?Number(event.target.value):item))}>
                {id && !options.some(row=>row.id===id) && <MenuItem value={id} disabled>{name(id)}</MenuItem>}
                {options.filter(row=>row.id===id || !draft.includes(row.id)).map(row=><MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
              </TextField><DeleteActionButton onClick={()=>setDraft(current=>current.filter((_,i)=>i!==index))} />
            </Stack>}</Draggable>)}{provided.placeholder}
          </Stack>}</Droppable>
        </DragDropContext>
        <Stack alignItems="flex-end" sx={{mt:1}}><Button disabled={loading || error || draft.length>=20 || draft.includes(0)} onClick={()=>setDraft(current=>[...current,0])}>{labels.addApprover}</Button></Stack>
      </DialogContent>
      <DialogActions><Button onClick={()=>setOpen(false)}>{languageCode==='ko'?'취소':languageCode==='vi'?'Hủy':'Cancel'}</Button><Button variant="contained" disabled={loading || error || draft.includes(0)} onClick={()=>{onChange(draft);setOpen(false);}}>{labels.apply}</Button></DialogActions>
    </Dialog>
  </>;
}
