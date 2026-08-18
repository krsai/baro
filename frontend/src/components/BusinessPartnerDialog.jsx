import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField,
} from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';

export const BUSINESS_PARTNER_TYPES = ['PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER'];

const TEXT = {
  ko: { title: '거래처 등록', type: '타입', name: '업체명', contact: '담당자', phone: '연락처', cancel: '취소', save: '등록', required: '업체명을 입력해 주세요.', error: '거래처를 등록하지 못했습니다.', outsourcing: '제작 외주', supplier: '구매처' },
  en: { title: 'Add Partner', type: 'Type', name: 'Company name', contact: 'Contact person', phone: 'Phone', cancel: 'Cancel', save: 'Add', required: 'Enter a company name.', error: 'Failed to add the partner.', outsourcing: 'Production Outsourcing', supplier: 'Supplier' },
  vi: { title: 'Thêm đối tác', type: 'Loại', name: 'Tên công ty', contact: 'Người liên hệ', phone: 'Số điện thoại', cancel: 'Hủy', save: 'Thêm', required: 'Vui lòng nhập tên công ty.', error: 'Không thể thêm đối tác.', outsourcing: 'Gia công sản xuất', supplier: 'Nhà cung cấp' },
};

export const getBusinessPartnerTypeLabel = (type, languageCode = 'ko') => {
  const labels = TEXT[languageCode] || TEXT.ko;
  return type === 'MATERIAL_SUPPLIER' ? labels.supplier : labels.outsourcing;
};

export default function BusinessPartnerDialog({
  open,
  onClose,
  onCreated,
  activeOrgId,
  languageCode = 'ko',
  initialType = 'PROCESS_OUTSOURCING',
  lockType = false,
}) {
  const labels = TEXT[languageCode] || TEXT.ko;
  const [form, setForm] = useState({ name: '', type: initialType, contactName: '', contactPhone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ name: '', type: initialType, contactName: '', contactPhone: '' });
      setError('');
    }
  }, [initialType, open]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) return setError(labels.required);
    setSaving(true);
    setError('');
    try {
      const partner = await requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), type: form.type,
          contactName: form.contactName.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
        }),
      });
      onCreated?.(partner);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || labels.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose?.()} fullWidth maxWidth="xs">
      <DialogTitle>{labels.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <FormControl fullWidth disabled={lockType}>
            <InputLabel>{labels.type}</InputLabel>
            <Select value={form.type} label={labels.type} onChange={update('type')}>
              {BUSINESS_PARTNER_TYPES.map((type) => <MenuItem key={type} value={type}>{getBusinessPartnerTypeLabel(type, languageCode)}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField autoFocus fullWidth required label={labels.name} value={form.name} onChange={update('name')} />
          <TextField fullWidth label={labels.contact} value={form.contactName} onChange={update('contactName')} />
          <TextField fullWidth label={labels.phone} value={form.contactPhone} onChange={update('contactPhone')} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{labels.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>{labels.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
