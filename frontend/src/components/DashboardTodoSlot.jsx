import React from 'react';
import {Paper,Typography} from '@mui/material';
import {ui} from '../theme/ui';

export default function DashboardTodoSlot(){
 return <Paper variant="outlined" data-testid="dashboard-todo" sx={{p:2,minWidth:0,minHeight:180,height:'100%',borderRadius:`${ui.radius.panel}px`}}>
  <Typography variant="h6">TODO</Typography>
 </Paper>;
}
