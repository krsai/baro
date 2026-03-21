import React from 'react';
import { Box, Stack } from '@mui/material';

const PageToolbar = ({ left = null, right = null, sx = {} }) => {
  if (!left && !right) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', lg: 'row' },
        alignItems: { xs: 'stretch', lg: 'center' },
        justifyContent: 'space-between',
        gap: 1.25,
        minWidth: 0,
        ...sx,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {left}
      </Box>
      {right ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            justifyContent: { xs: 'flex-start', lg: 'flex-end' },
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {right}
        </Stack>
      ) : null}
    </Box>
  );
};

export default PageToolbar;
