import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { getUiMessage } from '../constants/uiMessages';

const SaveButton = ({
  onClick,
  disabled = false,
  loading = false,
  sx = {},
  children,
  ...rest
}) => {
  const label = children ?? getUiMessage('common.save', 'Save');

  return (
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
      {loading ? <CircularProgress size={16} color="inherit" /> : label}
    </Button>
  );
};

export default SaveButton;
