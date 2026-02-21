import React from 'react';
import { Container, Typography, Box, CircularProgress } from '@mui/material';

const AuthCallback = () => {
  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>인증 처리 중...</Typography>
      </Box>
    </Container>
  );
};

export default AuthCallback;
