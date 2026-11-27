import {documentInputKeyDown} from '../utils/documentKeyboard.mjs';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import React from 'react';
import { Box, Stack } from '@mui/material';
import PageSectionHeader from './PageSectionHeader';
import { ui } from '../theme/ui';
import { usePageNaming } from '../context/PageNamingContext';

const AppPageContainer = ({
  title,
  context,
  titleActions = null,
  toolbar = null,
  header,
  children,
  footer,
  sx = {},
  contentSx = {},
  keyboardEntry = false,
  // Document workspace/editor exceptions; toolbars always scroll with content.
  stickyHeader = true,
  stickyFooter = false,
}) => {
  useKeyboardNavigation();
  const pageNaming = usePageNaming();
  if (title) title = pageNaming?.title || title;
  const resolvedHeader = header || ((title || titleActions) ? (
    <PageSectionHeader title={title} titleComponent="h1" context={context} actions={titleActions} />
  ) : null);
  const hasHeader = Boolean(resolvedHeader);

  return (
    <Box
      component="main"
      data-document-keyboard={keyboardEntry?'true':undefined}
      onKeyDown={keyboardEntry?documentInputKeyDown:undefined}
      className="app-page"
      sx={{
        flexGrow: 1,
        width: '100%',
        maxWidth: 'none',
        p: 0,
        minWidth: 0,
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        className="app-page-layout"
        spacing={ui.layout.pageGap}
        sx={{
          flexGrow: 1,
          minHeight: '100%',
          px: ui.layout.pagePadding,
          pb: stickyFooter && footer ? 0 : ui.layout.pagePadding,
          pt: hasHeader ? 0 : ui.layout.pagePadding,
          minWidth: 0,
          ...sx,
          width: '100%',
          maxWidth: 'none',
          boxSizing: 'border-box',
        }}
      >
        {/* Page Header */}
        {resolvedHeader && (
          <Box
            className="app-page-header"
            sx={{
              position: stickyHeader ? 'sticky' : 'relative',
              top: 0,
              zIndex: ui.layout.pageHeaderZIndex,
              pt: ui.layout.pagePadding,
              pb: 0,
              minWidth: 0,
              bgcolor: 'background.default',
            }}
          >
            {resolvedHeader}
          </Box>
        )}

        {toolbar && <Box className="app-page-toolbar" sx={{ minWidth: 0 }}>{toolbar}</Box>}

        {/* Page Content */}
        <Box className="app-page-content" sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: ui.layout.sectionGap, ...contentSx, width: '100%', maxWidth: 'none', boxSizing: 'border-box' }}>
          {children}
        </Box>

        {/* Page Footer (Optional) */}
        {footer && (
            <Box className="app-page-footer" sx={{ display: 'flex', justifyContent: 'flex-end', gap: ui.layout.actionGap, ...(stickyFooter ? {position:'sticky',bottom:0,zIndex:ui.layout.pageHeaderZIndex,bgcolor:'background.default',pt:ui.layout.sectionGap,pb:ui.layout.pagePadding} : {}) }}>
              {footer}
            </Box>
        )}
      </Stack>
    </Box>
  );
};

export default AppPageContainer;
