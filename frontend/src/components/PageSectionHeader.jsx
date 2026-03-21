import React from 'react';
import { Box, Button, Typography } from '@mui/material';

const PageSectionHeader = ({
  title,
  actions = null,
  actionLabel,
  onAction,
  actionIcon = null,
  actionDisabled = false,
  sx = {},
  titleVariant = 'h5',
}) => {
  const resolvedActions =
    actions ||
    (actionLabel ? (
      <Button
        variant="contained"
        startIcon={actionIcon}
        onClick={onAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </Button>
    ) : null);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.25,
        minWidth: 0,
        ...sx,
      }}
    >
      <Typography variant={titleVariant} sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {resolvedActions}
    </Box>
  );
};

export default PageSectionHeader;
