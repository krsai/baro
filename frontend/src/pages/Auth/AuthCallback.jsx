import React, { useEffect } from 'react';
import { Container, Typography, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const WORKSPACE_PATH = '/workspace';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { loading, isAuthenticated, hasWorkspaceAccess } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (isAuthenticated && hasWorkspaceAccess) {
      navigate(WORKSPACE_PATH, { replace: true });
      return;
    }

    navigate('/login', { replace: true });
  }, [
    hasWorkspaceAccess,
    isAuthenticated,
    loading,
    navigate,
  ]);

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
        <Typography sx={{ mt: 2 }}>인증 처리 중...</Typography>
      </Box>
    </Container>
  );
};

export default AuthCallback;
