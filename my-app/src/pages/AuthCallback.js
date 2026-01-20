import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Typography, Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');

    if (code) {
      // In a real app, you'd send this code to your backend to exchange for a JWT token.
      console.log('Authorization code from social provider:', code);
      
      // Simulate successful login after getting the code
      console.log('Simulating successful social login...');
      login();
      
      // Redirect to home page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } else {
      // Handle error case
      console.error('No authorization code found.');
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    }
  }, [location, navigate, login]);

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
        <Typography sx={{ mt: 2 }}>
          인증 처리 중...
        </Typography>
      </Box>
    </Container>
  );
};

export default AuthCallback;