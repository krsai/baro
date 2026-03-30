import React, { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Box, CircularProgress, CssBaseline, Typography } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import router from './router';
import theme from './theme';

const RouteLoadingFallback = () => (
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
      페이지를 불러오는 중입니다...
    </Typography>
  </Box>
);

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
