import React from 'react';
import { Box, Stack, Typography, Divider } from '@mui/material';

const AppPageContainer = ({ header, children, footer }) => {
  return (
    <Box component="main" sx={{ flexGrow: 1, p: 0 }}> {/* Root Box no longer has padding */}
      <Stack spacing={3} sx={{ height: '100%', p: 1 }}> {/* Padding moved to Stack for consistent spacing around content */}
        {/* Page Header */}
        {header && (
          <Box sx={{ pb: 2, borderBottom: '1px solid #e0e0e0' }}> {/* Visual separation */}
            {header}
          </Box>
        )}

        {/* Page Content */}
        <Box sx={{ flexGrow: 1 }}>
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
