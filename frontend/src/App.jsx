import React, { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Box, CircularProgress, CssBaseline, Typography } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import router from './router';
import theme from './theme';

const ROUTE_LOADING_TEXT = {
  ko: '페이지를 불러오는 중입니다...',
  en: 'Loading page...',
  vi: 'Dang tai trang...',
};

const RouteLoadingFallback = () => {
  const { languageCode } = useLanguage();
  const message = ROUTE_LOADING_TEXT[languageCode] || ROUTE_LOADING_TEXT.en;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 1.5,
        bgcolor: 'background.default',
      }}
    >
      <CircularProgress size={30} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
};

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <AuthProvider>
          <LanguageProvider>
            <Suspense fallback={<RouteLoadingFallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </LanguageProvider>
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;
