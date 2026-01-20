import React from 'react';
import { Container, Typography, Button, Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const Home = () => {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    // The ProtectedRoute in App.js will handle the redirect to /login
  };

  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h4">
          메인 페이지
        </Typography>
        <Typography sx={{ mt: 2 }}>
          로그인에 성공했습니다.
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 3 }}
          onClick={handleLogout}
        >
          로그아웃
        </Button>
      </Box>
    </Container>
  );
};

export default Home;