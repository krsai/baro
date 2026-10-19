import React from 'react';
import { Box, Stack } from '@mui/material';
import PageSectionHeader from './PageSectionHeader';
import { ui } from '../theme/ui';

const AppPageContainer = ({
  title,
  description,
  titleActions = null,
  toolbar = null,
  header,
  children,
  footer,
  sx = {},
  contentSx = {},
}) => {
  const resolvedHeader = header ? (
    <Stack spacing={ui.layout.headerGap} sx={{ minWidth: 0 }}>
      {header}
      {toolbar}
    </Stack>
  ) : title || titleActions || toolbar ? (
    <Stack spacing={ui.layout.headerGap} sx={{ minWidth: 0 }}>
      {(title || titleActions) ? (
        <PageSectionHeader
          title={title}
          titleComponent="h1"
          description={description}
          actions={titleActions}
        />
      ) : null}
      {toolbar}
    </Stack>
  ) : null;
  const hasHeader = Boolean(resolvedHeader);

  return (
    <Box
      component="main"
      className="app-page"
      sx={{
        flexGrow: 1,
        p: 0,
        minWidth: 0,
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        spacing={ui.layout.pageGap}
        sx={{
          flexGrow: 1,
          minHeight: '100%',
          px: ui.layout.pagePadding,
          pb: ui.layout.pagePadding,
          pt: hasHeader ? 0 : ui.layout.pagePadding,
          minWidth: 0,
          ...sx,
        }}
      >
        {/* Page Header */}
        {resolvedHeader && (
          <Box
            className="app-page-header"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              pt: ui.layout.pagePadding,
              pb: 0,
              minWidth: 0,
              bgcolor: 'background.default',
            }}
          >
            {resolvedHeader}
          </Box>
        )}

        {/* Page Content */}
        <Box className="app-page-content" sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: ui.layout.sectionGap, ...contentSx }}>
          {children}
        </Box>

        {/* Page Footer (Optional) */}
        {footer && (
            <Box className="app-page-footer" sx={{ display: 'flex', justifyContent: 'flex-end', gap: ui.layout.actionGap }}>
              {footer}
            </Box>
        )}
      </Stack>
    </Box>
  );
};

export default AppPageContainer;
