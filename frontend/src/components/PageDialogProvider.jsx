import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

const PageDialogs = createContext(null);
const TEXT = {
  ko: { title: '확인', cancel: '취소', ok: '확인' },
  en: { title: 'Confirm', cancel: 'Cancel', ok: 'OK' },
  vi: { title: 'Xác nhận', cancel: 'Hủy', ok: 'Đồng ý' },
};
// Standalone/auth views without a workspace preserve the browser fallback.
const fallback = {
  confirm: async message => window.confirm(message),
  prompt: async (message, value = '') => window.prompt(message, value),
  alert: async message => window.alert(message),
};
export const usePageDialogs = () => useContext(PageDialogs) || fallback;

export default function PageDialogProvider({ children }) {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const titleId = useId();
  const [requests, setRequests] = useState([]);
  const pending = useRef([]);
  const [value, setValue] = useState('');
  const current = requests[0];
  const ask = useCallback((kind, message, initial = '') => new Promise(resolve => {
    const request = { id: Symbol(kind), kind, message: String(message ?? ''), initial: String(initial ?? ''), resolve };
    pending.current.push(request);
    setRequests([...pending.current]);
  }), []);
  const finish = useCallback((accepted, response, id) => {
    if (pending.current[0]?.id !== id) return;
    const request = pending.current.shift();
    if (!request) return;
    setRequests([...pending.current]);
    request.resolve(request.kind === 'confirm' ? accepted : request.kind === 'prompt' ? accepted ? response : null : undefined);
  }, []);
  useEffect(() => { setValue(current?.initial || ''); }, [current?.id]);
  useEffect(() => () => {
    for (const request of pending.current) request.resolve(request.kind === 'confirm' ? false : request.kind === 'prompt' ? null : undefined);
    pending.current = [];
  }, []);
  const dialogs = useMemo(() => ({ confirm: message => ask('confirm', message), prompt: (message, initial) => ask('prompt', message, initial), alert: message => ask('alert', message) }), [ask]);
  return <PageDialogs.Provider value={dialogs}>{children}
    <Dialog open={Boolean(current)} onClose={() => finish(false, undefined, current?.id)} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{text.title}</DialogTitle>
      <DialogContent><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current?.message}</Typography>
        {current?.kind === 'prompt' && <TextField autoFocus fullWidth size="small" value={value} onChange={event => setValue(event.target.value)} inputProps={{ 'aria-label': current.message }} sx={{ mt: 2 }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); finish(true, value, current.id); } }} />}
      </DialogContent>
      <DialogActions>{current?.kind !== 'alert' && <Button onClick={() => finish(false, undefined, current?.id)}>{text.cancel}</Button>}<Button variant="contained" onClick={() => finish(true, value, current?.id)}>{text.ok}</Button></DialogActions>
    </Dialog>
  </PageDialogs.Provider>;
}
