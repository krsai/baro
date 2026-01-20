import React from 'react';
import { Container, Typography, Box } from '@mui/material';

const Users = () => {
  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          marginTop: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <Typography component="h1" variant="h4">
          사용자 관리
        </Typography>
        <Typography sx={{ mt: 2, color: 'text.secondary' }}>
          사용자 관리 페이지입니다.
        </Typography>
      </Box>
    </Container>
  );
};

export default Users;
