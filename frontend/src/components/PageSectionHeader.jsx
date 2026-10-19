import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ui } from '../theme/ui';

const PageSectionHeader = ({
  title,
  description,
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
        gap: ui.layout.headerGap,
        minWidth: 0,
        ...sx,
      }}
    >
      <Stack spacing={0.5} sx={{minWidth:0}}>
      <Typography component={titleComponent} variant={titleVariant} sx={{ fontWeight: ui.typography.titleFontWeight, color: ui.color.heading, letterSpacing: ui.typography.titleLetterSpacing, lineHeight: 1.4, overflowWrap:'anywhere' }}>
        {title}
      </Typography>
      {description && <Typography variant="body2" color="text.secondary">{description}</Typography>}
      </Stack>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: ui.layout.actionGap,
        }}
      >
        {resolvedActions}
      </Box>
    </Box>
  );
};

export default PageSectionHeader;
