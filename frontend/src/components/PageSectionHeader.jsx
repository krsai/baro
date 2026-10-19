import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { ui } from '../theme/ui';

const PageSectionHeader = ({
  title,
  actions = null,
  actionLabel,
  onAction,
  actionIcon = null,
  actionDisabled = false,
  sx = {},
  titleVariant = 'h5',
  titleComponent,
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
      <Typography component={titleComponent} variant={titleVariant} sx={{ fontWeight: ui.typography.titleFontWeight, color: ui.color.heading, letterSpacing: ui.typography.titleLetterSpacing, lineHeight: 1.4 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {resolvedActions}
      </Box>
    </Box>
  );
};

export default PageSectionHeader;
