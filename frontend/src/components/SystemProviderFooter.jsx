import React from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { SYSTEM_PROVIDER } from '../constants/systemProvider';

const SystemProviderFooter = () => {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        py: 1.5,
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            System Provider
          </Typography>
          <Typography variant="body2">
            {SYSTEM_PROVIDER.systemName} | {SYSTEM_PROVIDER.email}
          </Typography>
          {SYSTEM_PROVIDER.contacts.map((contact) => (
            <Typography key={contact.region} variant="body2" color="text.secondary">
              {contact.region}: {contact.phone}
            </Typography>
          ))}
        </Stack>
      </Container>
    </Box>
  );
};

export default SystemProviderFooter;
