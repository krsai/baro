import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const BasicInfo = () => {
  return (
    <Container component="main" maxWidth="lg">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography component="h1" variant="h4">
          기본 정보
        </Typography>
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          기본 정보 페이지입니다.
        </Typography>
      </Box>
    </Container>
  );
};

export default BasicInfo;
