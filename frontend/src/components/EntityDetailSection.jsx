import React from 'react';
import { Paper, Stack, Typography } from '@mui/material';

export default function EntityDetailSection({ title, children, sx, actions }) {
  return <Paper component="section" variant="outlined" sx={{p:2,borderRadius:2,minWidth:0,boxShadow:'none',...sx}}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{mb:2}}><Typography component="h2" variant="subtitle2" sx={{fontWeight:600,color:'text.primary'}}>{title}</Typography>{actions}</Stack>
    {children}
  </Paper>;
}
