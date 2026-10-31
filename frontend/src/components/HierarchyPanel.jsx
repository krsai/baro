import React from 'react';
import {Box,List,ListItemButton,Paper,Typography} from '@mui/material';
import ChevronRight from '@mui/icons-material/ChevronRight';

// Shared category → detail layout. Selection and relationship identifiers stay
// with the caller; this component owns spacing, hierarchy cues and boundaries.
export default function HierarchyPanel({label,items,selectedId,onSelect,children,contentKey}){
 return <Paper variant="outlined" data-testid="hierarchy-panel" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'240px minmax(0,1fr)'},overflow:'hidden'}}>
  <Box component="nav" aria-label={label} sx={{p:2,bgcolor:'#f8fafc',borderRight:{xs:0,md:'1px solid #e5eaf2'},borderBottom:{xs:'1px solid #e5eaf2',md:0}}}>
   <Typography variant="subtitle2" color="text.secondary" sx={{mb:1.5}}>{label}</Typography>
   <List disablePadding sx={{position:'relative',pl:1.5,'&::before':{content:'""',position:'absolute',left:4,top:18,bottom:18,width:'1px',bgcolor:'#dce4ef'}}}>
    {items.map(item=>{const selected=item.id===selectedId;return <Box key={item.id} sx={{display:'flex',alignItems:'center'}}><ListItemButton selected={selected} aria-current={selected?'true':undefined} onClick={()=>onSelect(item.id)} sx={{position:'relative',flex:1,minWidth:0,borderRadius:1,mb:.5,minHeight:36,px:1.5,'&::before':{content:'""',position:'absolute',left:-8,width:8,height:'1px',bgcolor:'#dce4ef'},'&.Mui-selected':{bgcolor:'#eaf1ff',color:'primary.main',boxShadow:'inset 3px 0 0 #2f75ed'},'&.Mui-selected:hover':{bgcolor:'#e3edff'}}}>
     <Typography sx={{flex:1,fontWeight:selected?600:400}}>{item.label}</Typography>
     {item.count!=null&&<Typography variant="caption" color="text.secondary" sx={{ml:1}}>{item.count}</Typography>}
     <ChevronRight sx={{fontSize:18,ml:.5,color:selected?'primary.main':'#98a5b8'}}/>
    </ListItemButton>{item.actions}</Box>;})}
   </List>
  </Box>
  <Box key={contentKey} sx={{p:{xs:2,md:2.5},minWidth:0}}>{children}</Box>
 </Paper>;
}
