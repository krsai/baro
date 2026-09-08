import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export default function StaleEditNotice({ stale, dirty, busy, languageCode, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { setOpen(stale); }, [stale]);
  const text = languageCode === 'vi' ? {
    title: 'Dữ liệu đã thay đổi', message: 'Dữ liệu đã được lưu từ màn hình khác. Màn hình này không còn là dữ liệu mới nhất.',
    warning: 'Tải lại sẽ xóa các thay đổi chưa lưu trên màn hình này.', refresh: 'Tải dữ liệu mới nhất', close: 'Đóng',
  } : languageCode === 'en' ? {
    title: 'Data has changed', message: 'Data was saved in another screen. This screen is no longer up to date.',
    warning: 'Reloading will discard your unsaved changes on this screen.', refresh: 'Reload latest data', close: 'Close',
  } : {
    title: '최신 현황이 변경되었습니다', message: '다른 화면에서 저장하여 현재 보고 있는 내용은 최신 현황이 아닙니다.',
    warning: '새로고침하면 이 화면의 저장하지 않은 수정 내용은 사라집니다.', refresh: '최신 현황 새로고침', close: '닫기',
  };
  if (!stale) return null;
  return <>
    <Alert severity="warning" action={<Button disabled={busy} onClick={() => setOpen(true)}>{text.refresh}</Button>}>{text.message}</Alert>
    <Dialog open={open} onClose={() => setOpen(false)}>
      <DialogTitle>{text.title}</DialogTitle>
      <DialogContent>{text.message}{dirty && <Alert severity="warning" sx={{ mt: 2 }}>{text.warning}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)}>{text.close}</Button><Button disabled={busy || refreshing} onClick={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }}>{text.refresh}</Button></DialogActions>
    </Dialog>
  </>;
}
