import React, { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip } from '@mui/material';
import { requestJSON, buildQueryString } from '../utils/apiClient';
import DeleteActionButton from './DeleteActionButton';

export const SETTING_DELETE_TEXT = {
  ko: { remove: '삭제', cancel: '취소', confirm: '삭제하시겠습니까?', used: '사용 이력이나 연결 설정이 있어 삭제할 수 없습니다. 수정 또는 사용 중지해 주세요.', error: '삭제하지 못했습니다.' },
  en: { remove: 'Delete', cancel: 'Cancel', confirm: 'Delete this setting?', used: 'Usage history or linked settings prevent deletion. Edit or deactivate it instead.', error: 'Could not delete the setting.' },
  vi: { remove: 'Xóa', cancel: 'Hủy', confirm: 'Xóa cài đặt này?', used: 'Không thể xóa do có lịch sử sử dụng hoặc cài đặt liên kết. Hãy sửa hoặc ngừng sử dụng.', error: 'Không thể xóa cài đặt.' },
};
export default function SettingDeleteButton({ path, id, name, orgId, languageCode = 'ko', disabled, used, onDeleted, onError }) {
  const labels = SETTING_DELETE_TEXT[languageCode] || SETTING_DELETE_TEXT.ko;
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false);
  const remove = async () => {
    setSaving(true);
    try { await requestJSON(`${path}/${id}${buildQueryString({ orgId })}`, { method: 'DELETE' }); setOpen(false); onDeleted?.(); }
    catch (error) { setOpen(false); onError?.(error?.status === 409 ? labels.used : labels.error); }
    finally { setSaving(false); }
  };
  return <><Tooltip title={used ? labels.used : labels.remove}><span><DeleteActionButton title={labels.remove} disabled={disabled || used || saving || !id} onClick={() => setOpen(true)} /></span></Tooltip><Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>{labels.confirm}</DialogTitle><DialogContent>{name}</DialogContent><DialogActions><Button disabled={saving} onClick={() => setOpen(false)}>{labels.cancel}</Button><Button color="error" variant="contained" disabled={saving} onClick={remove}>{labels.remove}</Button></DialogActions></Dialog></>;
}
