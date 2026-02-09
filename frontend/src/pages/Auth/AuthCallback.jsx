import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Typography, Box, CircularProgress } from '@mui/material';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');

    const run = async () => {
      if (!isSupabaseConfigured || !supabase) {
        navigate('/login', { replace: true });
        return;
      }
      if (!code) {
        navigate('/login', { replace: true });
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        navigate('/login', { replace: true });
        return;
      }

      navigate('/', { replace: true });
    };

    run();
  }, [location, navigate]);

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
