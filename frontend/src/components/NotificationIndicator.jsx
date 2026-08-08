import React from 'react';
import { Box } from '@mui/material';

const NotificationIndicator = ({ label = 'attention', sx = {} }) => (
  <Box
    component="span"
    aria-label={label}
    sx={{
      display: 'inline-block',
      flex: '0 0 auto',
      width: 6,
      height: 6,
      borderRadius: '50%',
      bgcolor: '#d97706',
      ...sx,
    }}
  />
);

export default NotificationIndicator;
