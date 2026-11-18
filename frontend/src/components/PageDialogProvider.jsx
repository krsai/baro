import {keyboardAction} from '../utils/keyboardPolicy.mjs';
import {notifyGlobally} from '../utils/appNotifications';
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

const PageDialogs = createContext(null);
const TEXT = {
  ko: { title: '확인', cancel: '취소', ok: '확인' },
  en: { title: 'Confirm', cancel: 'Cancel', ok: 'OK' },
  vi: { title: 'Xác nhận', cancel: 'Hủy', ok: 'Đồng ý' },
};
const DISCARD_TEXT={
 ko:{title:'저장하지 않은 변경 사항',cancel:'계속 작성',ok:'변경 사항 버리기',message:'저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리시겠습니까?'},
 en:{title:'Unsaved changes',cancel:'Continue editing',ok:'Discard changes',message:'You have unsaved changes. Discard these changes?'},
 vi:{title:'Thay đổi chưa lưu',cancel:'Tiếp tục chỉnh sửa',ok:'Bỏ thay đổi',message:'Bạn có thay đổi chưa lưu. Bỏ các thay đổi này?'},
};
// Standalone/auth views without a workspace preserve the browser fallback.
const fallback = {
  confirm: async message => window.confirm(message),
  prompt: async (message, value = '') => window.prompt(message, value),
  alert: async message => notifyGlobally(message),
};
export const usePageDialogs = () => useContext(PageDialogs) || fallback;

export default function PageDialogProvider({ children }) {
  const { languageCode } = useLanguage();
  const generalText = TEXT[languageCode] || TEXT.en;
  const titleId = useId();
  const [requests, setRequests] = useState([]);
  const pending = useRef([]);
  const [value, setValue] = useState('');
  const current = requests[0];
  const lastRequest=useRef(null);
  if(current)lastRequest.current=current;
  const displayed=current||lastRequest.current;
  const text=displayed?.options?.purpose==='discard'?(DISCARD_TEXT[languageCode]||DISCARD_TEXT.en):generalText;
  const ask = useCallback((kind, message, initial = '', options={}) => new Promise(resolve => {
    const request = { id: Symbol(kind), kind, message: String(message ?? ''), initial: String(initial ?? ''), options, resolve };
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
  useEffect(() => { if(current)setValue(current.initial || ''); }, [current?.id]);
  useEffect(() => () => {
    for (const request of pending.current) request.resolve(request.kind === 'confirm' ? false : request.kind === 'prompt' ? null : undefined);
    pending.current = [];
  }, []);
  const dialogs = useMemo(() => ({ confirm: (message,options) => ask('confirm', message,'',options), prompt: (message, initial) => ask('prompt', message, initial), alert: async message => notifyGlobally(message) }), [ask]);
  return <PageDialogs.Provider value={dialogs}>{children}
    <Dialog data-page-confirmation open={Boolean(current)} onClose={() => finish(false, undefined, current?.id)} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{text.title}</DialogTitle>
      <DialogContent><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{displayed?.message||text.message||''}</Typography>
        {displayed?.kind === 'prompt' && <TextField autoFocus fullWidth size="small" value={value} onChange={event => setValue(event.target.value)} inputProps={{ 'aria-label': displayed.message }} sx={{ mt: 2 }} onKeyDown={event => { if (keyboardAction(event,'lookup') === 'confirm') { event.preventDefault(); finish(true, value, current?.id); } }} />}
      </DialogContent>
      <DialogActions><Button autoFocus={current?.kind==='confirm'} onClick={()=>finish(false,undefined,current?.id)}>{text.cancel}</Button><Button variant="contained" onClick={() => finish(true, value, current?.id)}>{text.ok}</Button></DialogActions>
    </Dialog>
  </PageDialogs.Provider>;
}
