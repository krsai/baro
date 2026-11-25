import React from 'react';
import { Box } from '@mui/material';
import { ui } from '../theme/ui';

function markPrimary(action) {
  if (Array.isArray(action)) {
    const children = [...action];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (React.isValidElement(children[index]) || Array.isArray(children[index])) {
        children[index] = markPrimary(children[index]);
        break;
      }
    }
    return children;
  }
  if (!React.isValidElement(action)) return action;
  if (action.type === React.Fragment) {
    return React.cloneElement(action, {}, markPrimary(React.Children.toArray(action.props.children)));
  }
  return React.cloneElement(action, { 'data-page-primary': true });
}

// Render secondary actions first and the primary action last in DOM/keyboard order.
// Callers own labels, permissions, confirmation and save scope.
export default function PageActions({ secondary, primary, children, sx = {} }) {
  return <Box sx={{ display:'flex', alignItems:'center', justifyContent:'flex-end', flexWrap:'wrap', gap:ui.layout.actionGap, minWidth:0, ...sx }}>
    {secondary}{children}{markPrimary(primary)}
  </Box>;
}
