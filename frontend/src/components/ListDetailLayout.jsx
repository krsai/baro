import React from 'react';
import {Box} from '@mui/material';
import {ui} from '../theme/ui';

// Layout only: callers retain selection, draft ownership, permissions and saves.
export default function ListDetailLayout({list,detail,listWidth='minmax(0,1fr)',detailWidth='minmax(0,1fr)',breakpoint='md',sx={},listSx={},detailSx={}}){
 const hasList=list!==null&&list!==undefined&&list!==false,hasDetail=detail!==null&&detail!==undefined&&detail!==false,split=hasList&&hasDetail;
 return <Box data-list-detail sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',[breakpoint]:split?`${listWidth} ${detailWidth}`:'minmax(0,1fr)'},gap:ui.layout.sectionGap,alignItems:'start',minWidth:0,minHeight:0,...sx}}>
  {hasList&&<Box data-list-detail-list sx={{minWidth:0,minHeight:0,...listSx}}>{list}</Box>}
  {hasDetail&&<Box data-list-detail-content sx={{minWidth:0,minHeight:0,overflowWrap:'anywhere',...detailSx}}>{detail}</Box>}
 </Box>;
}
