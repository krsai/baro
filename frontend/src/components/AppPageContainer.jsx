import React from 'react';
import { Box, Stack, Divider } from '@mui/material';
import PageSectionHeader from './PageSectionHeader';

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
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      {header}
      {toolbar}
    </Stack>
  ) : title || titleActions || toolbar ? (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      {(title || titleActions) ? (
        <PageSectionHeader
          title={title}
          actions={titleActions}
        />
      ) : null}
      {toolbar}
    </Stack>
  ) : null;

  return (
    <Box component="main" sx={{ flexGrow: 1, p: 0, minWidth: 0 }}>
      <Stack
        spacing={2.5}
        sx={{
          height: '100%',
          p: { xs: 1.5, md: 2 },
          minWidth: 0,
          ...sx,
        }}
      >
        {/* Page Header */}
        {resolvedHeader && (
          <Box sx={{ pb: 2, borderBottom: '1px solid #e0e0e0', minWidth: 0 }}>
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
