import React from 'react';
import { Paper, Typography } from '@mui/material';

export default function EntityDetailSection({ title, children, sx }) {
  return <Paper component="section" variant="outlined" sx={{p:2,borderRadius:2,minWidth:0,boxShadow:'none',...sx}}>
    <Typography component="h2" variant="subtitle2" sx={{fontWeight:600,mb:2,color:'text.primary'}}>{title}</Typography>
    {children}
  </Paper>;
}
