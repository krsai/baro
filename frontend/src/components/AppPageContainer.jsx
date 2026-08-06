import React from 'react';
import { Box, Stack, Divider } from '@mui/material';
import PageSectionHeader from './PageSectionHeader';

const PAGE_PADDING = 2;
const NEGATIVE_PAGE_PADDING = -2;

const AppPageContainer = ({
  title,
  titleActions = null,
  toolbar = null,
  header,
  children,
  footer,
  sx = {},
  contentSx = {},
}) => {
  const resolvedHeader = header ? (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {header}
      {toolbar}
    </Stack>
  ) : title || titleActions || toolbar ? (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {(title || titleActions) ? (
        <PageSectionHeader
          title={title}
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
        spacing={2}
        sx={{
          flexGrow: 1,
          minHeight: '100%',
          px: PAGE_PADDING,
          pb: PAGE_PADDING,
          pt: hasHeader ? 0 : PAGE_PADDING,
          minWidth: 0,
          ...sx,
        }}
      >
        {/* Page Header */}
        {resolvedHeader && (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              mx: NEGATIVE_PAGE_PADDING,
              px: PAGE_PADDING,
              pt: 1.5,
              pb: 2,
              minWidth: 0,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {resolvedHeader}
          </Box>
        )}

        {/* Page Content */}
        <Box sx={{ flexGrow: 1, minWidth: 0, ...contentSx }}>
          {children}
        </Box>

        {/* Page Footer (Optional) */}
        {footer && (
          <>
            <Divider sx={{ mt: 3 }} />
            <Box sx={{ pt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              {footer}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
};

export default AppPageContainer;
