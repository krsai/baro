import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const Organization = () => {
  return (
    <Container component="main" maxWidth="lg">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <Typography component="h1" variant="h4">
          시스템 관리
        </Typography>
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          시스템 관리 페이지입니다.
        </Typography>
      </Box>
    </Container>
  );
};

export default Organization;
