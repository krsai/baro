import React, { useEffect, useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Container, Button, Typography, Box, Link, CircularProgress } from '@mui/material';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { signInWithGoogle, isAuthenticated, loading, isSupabaseConfigured, enableDevBypass } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await signInWithGoogle();
    setIsSubmitting(false);
  };

  const handleDevBypass = () => {
    enableDevBypass();
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
          로그인
        </Typography>
        <Box sx={{ mt: 3, width: '100%' }}>
          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 1, mb: 2, backgroundColor: '#4285F4', '&:hover': { backgroundColor: '#357ae8' } }}
            startIcon={isSubmitting || loading ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={handleGoogleLogin}
            disabled={isSubmitting || loading || !isSupabaseConfigured}
          >
            {isSubmitting || loading ? '로그인 중' : 'Google 계정으로 로그인'}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            sx={{ mb: 2 }}
            onClick={handleDevBypass}
          >
            개발용 로그인 우회
          </Button>
          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과
              `VITE_SUPABASE_ANON_KEY`를 넣고 다시 실행하세요.
            </Typography>
          )}
          <Link component={RouterLink} to="/signup" variant="body2">
            계정이 없으신가요? 소셜 계정으로 시작하기
          </Link>
        </Box>
      </Box>
      <Copyright sx={{ mt: 8, mb: 4 }} />
    </Container>
  );
};

export default Login;
