import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {DndContext,PointerSensor,closestCenter,useDraggable,useDroppable,useSensor,useSensors} from '@dnd-kit/core';
import AppPageContainer from './AppPageContainer';
import {dashboardWidgetStorageKey,moveDashboardWidget,normalizeDashboardWidgets} from '../utils/dashboardWidgets.mjs';

const TEXT={
 ko:{select:'위젯 선택',preview:'배치 미리보기',available:'사용할 위젯',drag:'손잡이를 드래그하거나 방향키로 순서를 바꾸세요.',half:'절반 너비',full:'전체 너비',width:'너비',apply:'저장',reset:'기본 배치',empty:'표시할 위젯을 선택하세요.',error:'배치를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.',saved:'저장했습니다.'},
 en:{select:'Select widgets',preview:'Layout preview',available:'Widgets',drag:'Drag the handle or use arrow keys to reorder.',half:'Half width',full:'Full width',width:'Width',apply:'Save',reset:'Default layout',empty:'Select widgets to display.',error:'Could not save the layout. Check browser storage.',saved:'Saved.'},
 vi:{select:'Chọn tiện ích',preview:'Xem trước bố cục',available:'Tiện ích',drag:'Kéo tay nắm hoặc dùng phím mũi tên để đổi thứ tự.',half:'Nửa chiều rộng',full:'Toàn chiều rộng',width:'Chiều rộng',apply:'Lưu',reset:'Bố cục mặc định',empty:'Chọn tiện ích để hiển thị.',error:'Không thể lưu bố cục. Kiểm tra bộ nhớ trình duyệt.',saved:'Đã lưu.'}
};
function readStoredLayout(key){
 let value=null;try{const raw=localStorage.getItem(key);if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))value=parsed;}}catch{}
 return {key,value};
}
function PreviewTile({item,label,onWidth,onMove,t}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:item.id});
 const {setNodeRef:setDropRef,isOver}=useDroppable({id:item.id});
 return <Box ref={setDropRef} sx={{gridColumn:item.width==='full'?'span 2':'span 1',minWidth:0}}>
  <Paper ref={setNodeRef} variant="outlined" data-widget-preview={item.id} sx={{p:1.25,minHeight:116,position:'relative',zIndex:isDragging?2:0,borderColor:isOver?'primary.main':'divider',bgcolor:isOver?'action.hover':'background.paper',transform:transform?`translate3d(${transform.x}px,${transform.y}px,0)`:undefined,opacity:isDragging?.8:1}}>
   <Stack direction="row" alignItems="center" spacing={.5}>
    <IconButton {...attributes} {...listeners} size="small" aria-label={label} onKeyDown={event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();onMove(event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1);}else listeners?.onKeyDown?.(event);}} sx={{touchAction:'none',cursor:isDragging?'grabbing':'grab'}}><DragIndicatorIcon fontSize="small"/></IconButton>
    <Typography variant="subtitle2" sx={{flex:1,minWidth:0,overflowWrap:'anywhere'}}>{label}</Typography>
   </Stack>
   <TextField select size="small" label={t.width} value={item.width} onChange={event=>onWidth(event.target.value)} sx={{mt:1,width:'100%',minWidth:0}}><MenuItem value="half">{t.half}</MenuItem><MenuItem value="full">{t.full}</MenuItem></TextField>
  </Paper>
 </Box>;
}
export default function DashboardWidgets({title,widgets,companyId,userId,languageCode,onSaved,children}){
 const t=TEXT[languageCode]||TEXT.en,key=dashboardWidgetStorageKey(companyId,userId);
 const [stored,setStored]=useState(()=>readStoredLayout(key)),[open,setOpen]=useState(false),[draft,setDraft]=useState([]),[error,setError]=useState(false);
 useEffect(()=>{setStored(readStoredLayout(key));setOpen(false);setError(false);},[key]);
 const layout=normalizeDashboardWidgets(stored?.key===key?stored.value:readStoredLayout(key).value,widgets);
 const byId=useMemo(()=>new Map(widgets.map(widget=>[widget.id,widget])),[widgets]);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}));
 const dirty=JSON.stringify(draft)!==JSON.stringify(layout);
 const close=()=>{setOpen(false);setError(false);};
 const save=()=>{const next=normalizeDashboardWidgets(draft,widgets);try{localStorage.setItem(key,JSON.stringify(next));}catch{setError(true);return;}setStored({key,value:next});close();onSaved?.(t.saved);};
 return <AppPageContainer title={title} titleActions={<Button variant="outlined" startIcon={<DashboardCustomizeIcon/>} onClick={()=>{setDraft(layout);setError(false);setOpen(true);}}>{t.select}</Button>}>
  <Box data-testid="dashboard-widget-layout" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2,alignItems:'start'}}>
   {layout.map(item=><Box key={item.id} data-dashboard-widget={item.id} sx={{gridColumn:{lg:item.width==='full'?'span 2':'span 1'},minWidth:0}}>{byId.get(item.id)?.content}</Box>)}
  </Box>
  {!layout.length&&<Typography color="text.secondary">{t.empty}</Typography>}
  {children}
  <Dialog open={open} onClose={close} fullWidth maxWidth="md"><DialogTitle>{t.select}</DialogTitle><DialogContent><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'200px minmax(0,1fr)'},gap:2}}>
   <Stack><Typography variant="subtitle2" sx={{mb:1}}>{t.available}</Typography>{widgets.map(widget=><FormControlLabel key={widget.id} label={widget.label} control={<Checkbox checked={draft.some(item=>item.id===widget.id)} onChange={event=>setDraft(current=>event.target.checked?[...current,{id:widget.id,width:widget.width||'half'}]:current.filter(item=>item.id!==widget.id))}/>}/>)}</Stack>
   <Stack spacing={1}><Typography variant="subtitle2">{t.preview}</Typography><Typography variant="caption" color="text.secondary">{t.drag}</Typography>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(over)setDraft(current=>moveDashboardWidget(current,active.id,over.id));}}>
     <Box data-testid="dashboard-widget-preview" sx={{p:1.5,bgcolor:'background.default',border:1,borderColor:'divider',borderRadius:1.5,minHeight:240,display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',alignContent:'start',gap:1}}>
      {draft.map((item,index)=><PreviewTile key={item.id} item={item} label={byId.get(item.id)?.label} t={t} onWidth={width=>setDraft(current=>current.map(row=>row.id===item.id?{...row,width}:row))} onMove={delta=>{const target=draft[index+delta];if(target)setDraft(current=>moveDashboardWidget(current,item.id,target.id));}}/>)}
      {!draft.length&&<Typography variant="body2" sx={{gridColumn:'span 2'}}>{t.empty}</Typography>}
     </Box>
    </DndContext>
   </Stack>
  </Box>{error&&<Alert severity="error" sx={{mt:2}}>{t.error}</Alert>}</DialogContent><DialogActions sx={{px:3,pb:2}}><Button onClick={()=>setDraft(normalizeDashboardWidgets(null,widgets))}>{t.reset}</Button><Button variant="contained" disabled={!dirty} onClick={save}>{t.apply}</Button></DialogActions></Dialog>
 </AppPageContainer>;
}
