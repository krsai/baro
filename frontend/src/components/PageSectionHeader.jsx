import React from 'react';
import { Box, Button, Typography } from '@mui/material';

const PageSectionHeader = ({
  title,
  actionLabel,
  onAction,
  actionIcon = null,
  actionDisabled = false,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 2,
      }}
    >
      <Typography variant="h6">{title}</Typography>
      {actionLabel ? (
        <Button
          variant="contained"
          startIcon={actionIcon}
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </Button>
      ) : null}
    </Box>
  );
};

export default PageSectionHeader;
