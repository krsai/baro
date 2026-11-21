import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ui } from '../theme/ui';
import PageActions from './PageActions';
import { usePageNaming } from '../context/PageNamingContext';

const PageSectionHeader = ({
  title,
  context,
  actions = null,
  actionLabel,
  onAction,
  actionIcon = null,
  actionDisabled = false,
  sx = {},
  titleVariant = 'h5',
  titleComponent,
}) => {
  const pageNaming = usePageNaming();
  const heading = titleComponent === 'h1' ? pageNaming?.title || title : title;
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
      <Stack direction="row" alignItems="baseline" flexWrap="wrap" gap={1} sx={{minWidth:0}}>
      <Typography component={titleComponent} variant={titleVariant} sx={{ fontWeight: ui.typography.titleFontWeight, color: ui.color.heading, letterSpacing: ui.typography.titleLetterSpacing, lineHeight: 1.4, overflowWrap:'anywhere' }}>
        {heading}
      </Typography>
      {context&&<Typography component="span" variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{context}</Typography>}
      </Stack>
      <PageActions
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          alignSelf: { xs: 'flex-end', sm: 'auto' },
          maxWidth: '100%',
          '& > .MuiStack-root': { flexWrap: 'wrap', rowGap: ui.layout.actionGap },
          gap: ui.layout.actionGap,
        }}
      >
        {resolvedActions}
      </PageActions>
    </Box>
  );
};

export default PageSectionHeader;
