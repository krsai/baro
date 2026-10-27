import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { CalendarMonthOutlined, QueryStatsOutlined, TaskAltOutlined } from '@mui/icons-material';
import { LOGIN_COPY } from './loginCopy';
import './login.css';
import AppVersionLabel from '../../components/AppVersionLabel';
import CompanyChooser from './CompanyChooser';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { canAccessPath, resolveFirstAccessiblePath } from '../../utils/accessControl';
import { readPersonalPreferences } from '../../utils/personalPreferences';
import { LOGIN_COMPANIES, readLoginCompany } from '../../utils/loginCompanySelection.mjs';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { languageCode, setLanguageCode } = useLanguage();
  const {
    signInWithGoogle,
    isAuthenticated,
    hasWorkspaceAccess,
    requiresWorkspaceSelection,
    requiresOnboarding,
    requiresSubscriptionContact,
    loading,
    isSupabaseConfigured,
    accessProfile,
    accessError,
    signOut,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginCompany,setLoginCompany] = useState(() => readLoginCompany() || 'BARO');
  const [loginError,setLoginError] = useState(false);
  const [isNavigatingAfterAuth, setIsNavigatingAfterAuth] = useState(false);
  const hasOAuthCallbackParams = useMemo(() => {
    const searchParams = new URLSearchParams(location.search || '');
    const hasSearchCallbackParam =
      searchParams.has('code') ||
      searchParams.has('state') ||
      searchParams.has('error') ||
      searchParams.has('error_code') ||
      searchParams.has('error_description');
    const hasHashToken =
      typeof location.hash === 'string' && location.hash.includes('access_token');
    return hasSearchCallbackParam || hasHashToken;
  }, [location.hash, location.search]);
  const [isOAuthReturnPending, setIsOAuthReturnPending] = useState(
    () => hasOAuthCallbackParams
  );

  const loginCopy = LOGIN_COPY[languageCode] || LOGIN_COPY.ko;
  const postAuthPath = useMemo(
    () => {
      const authState = {
        isAuthenticated,
        devBypass: false,
        devProfile: null,
        accessProfile,
      };
      if (
        readPersonalPreferences(accessProfile, null).openDashboardOnLogin &&
        canAccessPath('/dashboard', authState)
      ) {
        return '/dashboard';
      }
      return resolveFirstAccessiblePath(authState);
    },
    [accessProfile, isAuthenticated]
  );

  useEffect(() => {
    if (!hasOAuthCallbackParams) return;
    setIsOAuthReturnPending(true);
  }, [hasOAuthCallbackParams]);

  useEffect(() => {
    if (!isOAuthReturnPending) return;
    if (loading) return;
    if (isAuthenticated) return;
    setIsOAuthReturnPending(false);
  }, [isAuthenticated, isOAuthReturnPending, loading]);

  useEffect(() => {
    if (!isAuthenticated || loading) return;
    if (requiresWorkspaceSelection) {setIsNavigatingAfterAuth(false);return;}
    if (accessError) {
      setIsNavigatingAfterAuth(false);
      return;
    }
    setIsNavigatingAfterAuth(true);
    if (hasWorkspaceAccess) {
      navigate(postAuthPath, { replace: true });
      return;
    }
    if (requiresSubscriptionContact) {
      navigate('/subscription-required', { replace: true });
      return;
    }
    if (requiresOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [
    hasWorkspaceAccess,
    requiresWorkspaceSelection,
    isAuthenticated,
    loading,
    navigate,
    postAuthPath,
    requiresOnboarding,
    requiresSubscriptionContact,
    accessError,
  ]);

  useEffect(() => {
    if (isAuthenticated) return;
    setIsNavigatingAfterAuth(false);
  }, [isAuthenticated]);

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setLoginError(false);
    try {
      await signInWithGoogle(loginCompany);
    } catch {
      setLoginError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartSession = async () => {
    await signOut();
    setIsNavigatingAfterAuth(false);
    setIsSubmitting(false);
  };

  const isLoginLocked =
    isSubmitting ||
    loading ||
    isOAuthReturnPending ||
    isNavigatingAfterAuth;

  const featureIcons = [CalendarMonthOutlined, QueryStatsOutlined, TaskAltOutlined];
  return (
    <Box component="main" className="lineos-login">
      <header className="lineos-login-header">
        <div aria-label="LINEOS"><div className="lineos-login-brand">LINEOS</div><div className="lineos-login-brand-caption">PRODUCTION MANAGEMENT</div></div>
        <LanguageSwitcher languageCode={languageCode} onChange={setLanguageCode} />
      </header>
      <div className="lineos-login-content">
        <section className="lineos-login-intro" aria-labelledby="lineos-introduction">
          <h1 id="lineos-introduction">{loginCopy.headline}</h1>
          <p className="lineos-login-introduction">{loginCopy.introduction}</p>
          <div className="lineos-login-features">{loginCopy.features.map(([title,detail],index)=>{const Icon=featureIcons[index];return <div key={title}>
            <span className="lineos-login-feature-icon"><Icon sx={{fontSize:21}} /></span>
            <div className="lineos-login-feature-title">{title}</div><div className="lineos-login-feature-detail">{detail}</div>
          </div>;})}</div>
        </section>
        <section className="lineos-login-card" aria-labelledby="lineos-login-heading">
          <h2 id="lineos-login-heading">{loginCopy.welcome}</h2>
          <p className="lineos-login-subtitle">{loginCopy.subtitle}</p>
          {!isAuthenticated && <ToggleButtonGroup exclusive fullWidth value={loginCompany} onChange={(_event,value)=>{if(value)setLoginCompany(value);}} disabled={isLoginLocked} aria-label={languageCode==='ko'?'로그인 회사':languageCode==='vi'?'Công ty đăng nhập':'Login company'} sx={{mb:2,p:0.5,borderRadius:2,bgcolor:'action.hover','& .MuiToggleButtonGroup-grouped':{flex:1,border:0,borderRadius:'6px !important',minHeight:44,px:1,fontSize:'0.8125rem',fontWeight:600,whiteSpace:'nowrap'},'& .Mui-selected':{bgcolor:'background.paper',color:'primary.main',boxShadow:'0 1px 4px #20395020'},'& .Mui-selected:hover':{bgcolor:'background.paper'}}}>
            {LOGIN_COMPANIES.map(company=><ToggleButton key={company.key} value={company.key}>{company.label}</ToggleButton>)}
          </ToggleButtonGroup>}
          {isAuthenticated && requiresWorkspaceSelection ? <CompanyChooser languageCode={languageCode}/> : <>
          <Button fullWidth variant="outlined" className="lineos-google-button" startIcon={isLoginLocked ? <CircularProgress size={18} color="inherit" /> : <GoogleMark />} onClick={handleGoogleLogin} disabled={isLoginLocked || !isSupabaseConfigured}>
            {isLoginLocked ? loginCopy.loginLoading : loginCopy.loginWithGoogle}
          </Button>
          {!isSupabaseConfigured && <Typography role="alert" variant="body2" color="error" sx={{mt:2}}>{loginCopy.supabaseRequired}</Typography>}
          {loginError && <Typography role="alert" variant="body2" color="error" sx={{mt:2}}>{loginCopy.loginError}</Typography>}
          {isAuthenticated && accessError && <Box sx={{mt:2}}><Typography role="alert" variant="body2" color="error">{loginCopy.authContextError}</Typography><Button onClick={handleRestartSession} sx={{mt:1}}>{loginCopy.restartSession}</Button></Box>}
          <p className="lineos-login-destination">{loginCopy.destination}</p>
          </>}
        </section>
      </div>
      <footer className="lineos-login-footer"><span>LINEOS &copy; {new Date().getFullYear()}</span><AppVersionLabel sx={{fontSize:'inherit',color:'inherit'}} /></footer>
    </Box>
  );
};

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.7h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.9z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.9-3.6-11.5-8.4H5.7v5.2A20.4 20.4 0 0 0 24 44z" />
    <path fill="#FBBC05" d="M12.5 27.6a12.2 12.2 0 0 1 0-7.2v-5.2H5.7a20 20 0 0 0 0 17.6l6.8-5.2z" />
    <path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15.2l6.8 5.2C14.1 15.6 18.7 12 24 12z" />
  </svg>;
}
export default Login;
