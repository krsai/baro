import React, { createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Modal, ThemeProvider, useTheme } from '@mui/material';
import PageDialogProvider from './PageDialogProvider';

const DialogScope = createContext(null);

const WorkspaceDialogRoot = forwardRef(function WorkspaceDialogRoot(props, ref) {
  const scope = useContext(DialogScope);
  const { ownerState, open, keepMounted, closeAfterTransition, sx, slotProps, ...rest } = props;
  const id = useRef(Symbol('workspace-dialog'));
  const register = scope?.register;
  const active = scope?.active;
  const origin = useRef(null);
  const modalRoot = useRef(null);
  const mounted = useRef(true);
  const wasOpen = useRef(false);
  const current = useRef({ open, active });
  current.current = { open, active };
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const target = origin.current;
      if ((mounted.current && current.current.open) || !current.current.active || !target?.isConnected ||
          target.disabled || target.closest('[inert],[aria-hidden="true"]') || !target.getClientRects().length) return;
      // A deliberate focus move (for example to another tab) takes precedence.
      const focused = target.ownerDocument.activeElement;
      if (focused !== target.ownerDocument.body && focused !== target &&
          !modalRoot.current?.contains(focused)) { origin.current = null; return; }
      target.focus({ preventScroll: true });
      origin.current = null;
    });
  }, []);
  useLayoutEffect(() => {
    if (open && active && !wasOpen.current) {
      const focused = document.activeElement;
      if (focused && focused !== document.body && !focused.closest('[inert]')) origin.current = focused;
    }
    wasOpen.current = open;
  }, [open, active]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; restoreFocus(); };
  }, [restoreFocus]);
  useEffect(() => {
    if (!open && active) restoreFocus();
  }, [open, active, restoreFocus]);
  useEffect(() => {
    register?.(id.current, Boolean(open && active));
    return () => register?.(id.current, false);
  }, [register, open, active]);
  if (!scope) return <Modal {...rest} ref={ref} open={open} keepMounted={keepMounted} closeAfterTransition={closeAfterTransition} sx={sx} slotProps={slotProps} />;
  return <Modal {...rest} ref={ref}
    open={Boolean(open && scope.active)}
    keepMounted={keepMounted || Boolean(open && !scope.active)}
    closeAfterTransition={scope.active ? closeAfterTransition : false}
    container={() => scope.host.current}
    disableScrollLock disableEnforceFocus disableRestoreFocus
    onFocusCapture={event => {
      modalRoot.current = event.currentTarget;
      if (!origin.current && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) origin.current = event.relatedTarget;
      rest.onFocusCapture?.(event);
    }}
    onTransitionExited={(...args) => { rest.onTransitionExited?.(...args); restoreFocus(); }}
    slotProps={{ ...slotProps, backdrop: { ...slotProps?.backdrop, sx: [{ position: 'absolute' }, slotProps?.backdrop?.sx] } }}
    sx={[...(Array.isArray(sx) ? sx : [sx]), {
      position: 'absolute', inset: 0, pointerEvents: 'auto',
      '--workspace-overlay-gap': 'clamp(12px, 2vw, 24px)',
      '& .MuiDialog-container': {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', boxSizing: 'border-box', padding: 'var(--workspace-overlay-gap)', overflow: 'hidden',
      },
      '& .MuiDialog-paper': {
        margin: '0 !important', minWidth: 0, minHeight: 0, flexShrink: 1,
        maxHeight: '100% !important', boxSizing: 'border-box', overflow: 'auto',
      },
      '& .MuiDrawer-paper': {
        // Page drawers are bounded by their workspace, not the browser's header.
        top: 'var(--workspace-overlay-gap) !important', bottom: 'var(--workspace-overlay-gap) !important',
        height: 'auto !important', minHeight: 0, minWidth: 0,
        maxHeight: 'calc(100% - 2 * var(--workspace-overlay-gap)) !important',
        maxWidth: 'calc(100% - 2 * var(--workspace-overlay-gap)) !important',
        boxSizing: 'border-box', borderRadius: 2, overflow: 'auto',
        '&.MuiDrawer-paperAnchorRight': { right: 'var(--workspace-overlay-gap)', left: 'auto' },
        '&.MuiDrawer-paperAnchorLeft': { left: 'var(--workspace-overlay-gap)', right: 'auto' },
      },
      ...(!scope.active ? { display: 'none' } : {}),
    }]}
  />;
});

// Portals belong to their preserved page, while only that page's dialogs join
// MUI's modal stack. The Dialog transition stays open during a tab switch, so
// onClose/onExited handlers and uncontrolled inputs are not reset by navigation.
export default function WorkspaceDialogScope({ active = true, viewportRef, children }) {
  const parentTheme = useTheme();
  const host = useRef(null);
  const [bounds, setBounds] = useState(null);
  const [openDialogs, setOpenDialogs] = useState(() => new Set());
  const register = useCallback((id, open) => setOpenDialogs(previous => {
    if (previous.has(id) === open) return previous;
    const next = new Set(previous);
    if (open) next.add(id); else next.delete(id);
    return next;
  }), []);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const { top, left, width, height } = viewport.getBoundingClientRect();
      setBounds(previous => previous && previous.top === top && previous.left === left && previous.width === width && previous.height === height ? previous : { top, left, width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [viewportRef]);
  const theme = useMemo(() => ({ ...parentTheme, components: { ...parentTheme.components,
    MuiDialog: { ...parentTheme.components?.MuiDialog, defaultProps: {
      ...parentTheme.components?.MuiDialog?.defaultProps,
      slots: { ...parentTheme.components?.MuiDialog?.defaultProps?.slots, root: WorkspaceDialogRoot },
    } },
    MuiDrawer: { ...parentTheme.components?.MuiDrawer, defaultProps: {
      ...parentTheme.components?.MuiDrawer?.defaultProps,
      slots: { ...parentTheme.components?.MuiDrawer?.defaultProps?.slots, root: WorkspaceDialogRoot },
    }, styleOverrides: { ...parentTheme.components?.MuiDrawer?.styleOverrides,
      paper: { ...parentTheme.components?.MuiDrawer?.styleOverrides?.paper, position: 'absolute', boxSizing: 'border-box' },
    } },
  } }), [parentTheme]);
  const scope = useMemo(() => ({ active, host, register }), [active, register]);
  return <DialogScope.Provider value={scope}><ThemeProvider theme={theme}><PageDialogProvider>
    <Box sx={{ display: 'contents' }} inert={active && openDialogs.size > 0 ? true : undefined}>{children}</Box>
    <Box ref={host} data-workspace-dialog-host sx={{ position: 'fixed', ...bounds,
      display: active && bounds ? 'block' : 'none', overflow: 'hidden', pointerEvents: 'none', zIndex: parentTheme.zIndex.modal }} />
  </PageDialogProvider></ThemeProvider></DialogScope.Provider>;
}
