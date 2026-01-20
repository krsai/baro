import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const SystemSetting = () => {
  return (
    <Container component="main" maxWidth="lg">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography component="h1" variant="h4">
          시스템 설정
        </Typography>
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          시스템 설정 페이지입니다.
        </Typography>
      </Box>
    </Container>
  );
};

export default SystemSetting;
