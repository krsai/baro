import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const WORKSPACE_PATH = '/workspace';
const ONBOARDING_PATH = '/onboarding';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { loading, isAuthenticated, hasWorkspaceAccess, requiresOnboarding } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (isAuthenticated && hasWorkspaceAccess) {
      navigate(WORKSPACE_PATH, { replace: true });
      return;
    }

    if (isAuthenticated && requiresOnboarding) {
      navigate(ONBOARDING_PATH, { replace: true });
      return;
    }

    navigate('/login', { replace: true });
  }, [hasWorkspaceAccess, isAuthenticated, loading, navigate, requiresOnboarding]);

  return null;
};

export default AuthCallback;
