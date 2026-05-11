import React, { Suspense, useEffect } from 'react';
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

const HORIZONTAL_SCROLL_OVERFLOW_VALUES = new Set(['auto', 'scroll', 'overlay']);

const resolveHorizontalWheelDelta = (event) => {
  const deltaX = Number(event?.deltaX) || 0;
  if (deltaX !== 0) return deltaX;
  if (event?.shiftKey) {
    return Number(event?.deltaY) || 0;
  }
  return 0;
};

const isHorizontallyScrollable = (node) => {
  if (!(node instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(node);
  if (!HORIZONTAL_SCROLL_OVERFLOW_VALUES.has(style.overflowX)) return false;
  return node.scrollWidth > node.clientWidth + 1;
};

const findHorizontalScrollContainer = (startNode) => {
  let current =
    startNode instanceof HTMLElement
      ? startNode
      : startNode?.parentElement instanceof HTMLElement
        ? startNode.parentElement
        : null;

  while (current) {
    if (isHorizontallyScrollable(current)) {
      return current;
    }
    current = current.parentElement;
  }

  const rootScroller =
    document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
  return isHorizontallyScrollable(rootScroller) ? rootScroller : null;
};

const App = () => {
  useEffect(() => {
    const handleWheel = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;

      const horizontalDelta = resolveHorizontalWheelDelta(event);
      if (!horizontalDelta) return;

      const scrollContainer = findHorizontalScrollContainer(event.target);
      if (scrollContainer) {
        scrollContainer.scrollLeft += horizontalDelta;
      }

      event.preventDefault();
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', handleWheel, true);
    };
  }, []);

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
