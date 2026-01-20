import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import router from './router';
import theme from './theme';

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;