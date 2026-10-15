import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Modal, ThemeProvider, useTheme } from '@mui/material';
import PageDialogProvider from './PageDialogProvider';

const DialogScope = createContext(null);

const WorkspaceDialogRoot = forwardRef(function WorkspaceDialogRoot(props, ref) {
  const scope = useContext(DialogScope);
  const { ownerState, open, keepMounted, closeAfterTransition, sx, slotProps, ...rest } = props;
  const id = useRef(Symbol('workspace-dialog'));
  const register = scope?.register;
  const active = scope?.active;
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
    slotProps={{ ...slotProps, backdrop: { ...slotProps?.backdrop, sx: [{ position: 'absolute' }, slotProps?.backdrop?.sx] } }}
    sx={[...(Array.isArray(sx) ? sx : [sx]), { position: 'absolute', inset: 0, pointerEvents: 'auto', ...(!scope.active ? { display: 'none' } : {}) }]}
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
