import React from 'react';
import { Box } from '@mui/material';
import { ui } from '../theme/ui';

// Render secondary actions first and the primary action last in DOM/keyboard order.
// Callers own labels, permissions, confirmation and save scope.
export default function PageActions({ secondary, primary, children, sx = {} }) {
  return <Box sx={{ display:'flex', alignItems:'center', justifyContent:'flex-end', flexWrap:'wrap', gap:ui.layout.actionGap, minWidth:0, ...sx }}>
    {secondary}{children}{React.isValidElement(primary)?React.cloneElement(primary,{'data-page-primary':true}):primary}
  </Box>;
}
