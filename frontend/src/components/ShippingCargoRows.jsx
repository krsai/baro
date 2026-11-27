import React,{useRef} from 'react';
import {Box,MenuItem,Stack,TextField,Tooltip} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
export const containerOptions=['20DC','40DC','40HQ','45HQ','20RF','40RF','40RH','20OT','40OT','40OH','20FR','40FR','40FH','20TK'];
export const dgClasses=['1.1','1.2','1.3','1.4','1.5','1.6','2.1','2.2','2.3','3','4.1','4.2','4.3','5.1','5.2','6.1','6.2','7','8','9'];
export const containerLabel=code=>`${code.slice(0,2)}'${code.slice(2)}`;
export default function ShippingCargoRows({rows,onChange,containers=false,disabled,t}){
 const ids=useRef([]);while(ids.current.length<rows.length)ids.current.push(crypto.randomUUID());ids.current.length=rows.length;
 if(!containers)return null;
 const update=(index,patch)=>onChange(rows.map((row,i)=>i===index?{...row,...patch}:row));
 return <DragDropContext onDragEnd={({source,destination})=>{if(disabled||!destination||source.index===destination.index)return;const next=[...rows],keys=[...ids.current];next.splice(destination.index,0,next.splice(source.index,1)[0]);keys.splice(destination.index,0,keys.splice(source.index,1)[0]);ids.current=keys;onChange(next);}}><Droppable droppableId="containers">{provided=><Stack ref={provided.innerRef} {...provided.droppableProps} spacing={1}>{rows.map((row,index)=><Draggable key={ids.current[index]} draggableId={ids.current[index]} index={index} isDragDisabled={disabled}>{(drag,state)=><Box ref={drag.innerRef} {...drag.draggableProps} data-dragging={state.isDragging} data-container-row sx={{display:'grid',gridTemplateColumns:'24px minmax(0,1fr) auto',gap:1,alignItems:'center'}}>
 <Tooltip title={t.reorder}><Box component="span" {...drag.dragHandleProps} aria-disabled={disabled} aria-label={t.reorder+' '+(index+1)} sx={{display:'flex',cursor:disabled?'default':'grab',color:'text.secondary',touchAction:'none'}}><DragIndicatorIcon fontSize="small"/></Box></Tooltip>
 <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(3,minmax(0,1fr))',sm:'repeat(3,minmax(0,1fr))'},gap:1,minWidth:0}}>
 <TextField size="small" fullWidth required disabled={disabled} label={t.count} value={row.count||''} slotProps={{htmlInput:{inputMode:'numeric',maxLength:8}}} onChange={ev=>{if(/^\d*$/.test(ev.target.value))update(index,{count:ev.target.value});}}/>
 <TextField size="small" select fullWidth required label={t.containerSize} disabled={disabled} value={row.size||''} slotProps={{select:{SelectDisplayProps:{'aria-label':t.containerSize,'aria-labelledby':undefined}}}} onChange={ev=>update(index,{size:ev.target.value,type:containerOptions.includes(ev.target.value+row.type)?row.type:''})}>{['20','40','45'].map(size=><MenuItem key={size} value={size}>{size}'</MenuItem>)}</TextField>
 <TextField size="small" select fullWidth required label={t.containerType} disabled={disabled||!row.size} value={row.type||''} slotProps={{select:{SelectDisplayProps:{'aria-label':t.containerType,'aria-labelledby':undefined}}}} onChange={ev=>update(index,{type:ev.target.value})}>{row.type&&!containerOptions.includes(row.size+row.type)&&<MenuItem value={row.type}>{row.type}</MenuItem>}{containerOptions.filter(code=>code.startsWith(row.size)).map(code=><MenuItem key={code} value={code.slice(2)}>{code.slice(2)}</MenuItem>)}</TextField>
 </Box><Stack direction={{xs:'column',sm:'row'}} gap={.25}><AddActionButton disabled={disabled||rows.length>=50} title={t.add} onClick={()=>{const next=[...rows];next.splice(index+1,0,{size:'',type:'',count:''});ids.current.splice(index+1,0,crypto.randomUUID());onChange(next);}}/><DeleteActionButton disabled={disabled||rows.length===1} title={t.remove} onClick={()=>{ids.current.splice(index,1);onChange(rows.filter((_,i)=>i!==index));}}/></Stack></Box>}</Draggable>)}{provided.placeholder}</Stack>}</Droppable></DragDropContext>;
}
