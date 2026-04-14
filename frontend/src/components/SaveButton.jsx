import React from 'react';
import { Button, CircularProgress } from '@mui/material';

const SaveButton = ({
  onClick,
  disabled = false,
  loading = false,
  sx = {},
  ...rest
}) => (
  <Button
    variant="contained"
    disableElevation
    onClick={onClick}
    disabled={disabled || loading}
    sx={{
      minWidth: 88,
      height: 36,
      px: 1.75,
      borderRadius: 1.5,
      textTransform: 'none',
      fontWeight: 700,
      ...sx,
    }}
    {...rest}
  >
    {loading ? <CircularProgress size={16} color="inherit" /> : '저장'}
  </Button>
);

export default SaveButton;
