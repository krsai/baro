import React from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Container, Button, Typography, Box, Link } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';


const SignUp = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSocialLogin = (provider) => {
    // In a real app, you would redirect to the provider's OAuth URL.
    // e.g., window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...`;
    console.log(`Simulating ${provider} signup...`);
    // Simulate successful social login
    login();
    navigate('/');
  };

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
        <Typography component="h1" variant="h5">
          소셜 계정으로 시작하기
        </Typography>
        <Box sx={{ mt: 3, width: '100%' }}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<GoogleIcon />}
            sx={{ mb: 2, backgroundColor: '#DB4437', color: 'white', '&:hover': { backgroundColor: '#C33D2E' } }}
            onClick={() => handleSocialLogin('Google')}
          >
            Google 계정으로 시작하기
          </Button>
          {/* Add other social logins here */}
        </Box>
        <Link component={RouterLink} to="/login" variant="body2" sx={{ mt: 2 }}>
          이미 계정이 있으신가요? 이메일로 로그인
        </Link>
      </Box>
      <Copyright sx={{ mt: 5 }} />
    </Container>
  );
};

export default SignUp;
