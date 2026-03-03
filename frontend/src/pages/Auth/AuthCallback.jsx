import React, { useEffect } from 'react';
import { Container, Typography, Box, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { resolveFirstAccessiblePath } from '../../utils/accessControl';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { loading, isAuthenticated, hasWorkspaceAccess, devBypass, devProfile, accessProfile } =
    useAuth();

  useEffect(() => {
    if (loading) return;

    if (isAuthenticated && hasWorkspaceAccess) {
      navigate(
        resolveFirstAccessiblePath({
          isAuthenticated,
          devBypass,
          devProfile,
          accessProfile,
        }),
        { replace: true }
      );
      return;
    }

    navigate('/login', { replace: true });
  }, [
    accessProfile,
    devBypass,
    devProfile,
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
