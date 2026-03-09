import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Container, Button, Typography, Box, Link } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import Copyright from '../../components/Copyright';
import { useAuth } from '../../context/AuthContext';

const SignUp = () => {
  const { signInWithGoogle, loading, isSupabaseConfigured } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSocialLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await signInWithGoogle();
    setIsSubmitting(false);
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
          신규 계정으로 시작하기
        </Typography>
        <Box sx={{ mt: 3, width: '100%' }}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<GoogleIcon />}
            sx={{ mb: 2, backgroundColor: '#DB4437', color: 'white', '&:hover': { backgroundColor: '#C33D2E' } }}
            onClick={handleSocialLogin}
            disabled={isSubmitting || loading || !isSupabaseConfigured}
          >
            {isSubmitting || loading ? '시작 중...' : 'Google 계정으로 시작하기'}
          </Button>
          {!isSupabaseConfigured && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              Supabase 설정이 필요합니다. `.env`에 `VITE_SUPABASE_URL`과
              `VITE_SUPABASE_ANON_KEY`를 넣고 다시 실행해 주세요.
            </Typography>
          )}
        </Box>
        <Link component={RouterLink} to="/login" variant="body2" sx={{ mt: 2 }}>
          이미 계정이 있으신가요? 로그인으로 이동
        </Link>
      </Box>
      <Copyright sx={{ mt: 5 }} />
    </Container>
  );
};

export default SignUp;
