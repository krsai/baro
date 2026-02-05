import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import router from './router';
import theme from './theme';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const App = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <DndProvider backend={HTML5Backend}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </DndProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;