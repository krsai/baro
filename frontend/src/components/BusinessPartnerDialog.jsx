import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Switch, TextField,
} from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';

export const BUSINESS_PARTNER_TYPES = ['PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER'];

const TEXT = {
  ko: {
    titleCreate: '거래처 등록', titleEdit: '거래처 수정',
    type: '타입', name: '업체명', contact: '담당자', phone: '연락처', active: '사용 중',
    cancel: '취소', save: '등록', saveEdit: '저장',
    required: '업체명을 입력해 주세요.',
    error: '거래처를 등록하지 못했습니다.', errorEdit: '거래처를 수정하지 못했습니다.',
    outsourcing: '제작 외주', supplier: '구매처',
  },
  en: {
    titleCreate: 'Add Partner', titleEdit: 'Edit Partner',
    type: 'Type', name: 'Company name', contact: 'Contact person', phone: 'Phone', active: 'Active',
    cancel: 'Cancel', save: 'Add', saveEdit: 'Save',
    required: 'Enter a company name.',
    error: 'Failed to add the partner.', errorEdit: 'Failed to update the partner.',
    outsourcing: 'Production Outsourcing', supplier: 'Supplier',
  },
  vi: {
    titleCreate: 'Thêm đối tác', titleEdit: 'Sửa đối tác',
    type: 'Loại', name: 'Tên công ty', contact: 'Người liên hệ', phone: 'Số điện thoại', active: 'Đang sử dụng',
    cancel: 'Hủy', save: 'Thêm', saveEdit: 'Lưu',
    required: 'Vui lòng nhập tên công ty.',
    error: 'Không thể thêm đối tác.', errorEdit: 'Không thể cập nhật đối tác.',
    outsourcing: 'Gia công sản xuất', supplier: 'Nhà cung cấp',
  },
};

export const getBusinessPartnerTypeLabel = (type, languageCode = 'ko') => {
  const labels = TEXT[languageCode] || TEXT.ko;
  return type === 'MATERIAL_SUPPLIER' ? labels.supplier : labels.outsourcing;
};

const buildFormFromPartner = (partner, initialType) => ({
  name: partner?.name || '',
  type: partner?.type || initialType,
  contactName: partner?.contactName || '',
  contactPhone: partner?.contactPhone || '',
  isActive: partner?.isActive !== false,
});

export default function BusinessPartnerDialog({
  open,
  onClose,
  onCreated,
  onSaved,
  activeOrgId,
  languageCode = 'ko',
  initialType = 'PROCESS_OUTSOURCING',
  lockType = false,
  partner = null,
}) {
  const labels = TEXT[languageCode] || TEXT.ko;
  const isEdit = Boolean(partner?.id);
  const [form, setForm] = useState(() => buildFormFromPartner(partner, initialType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(buildFormFromPartner(partner, initialType));
      setError('');
    }
  }, [initialType, open, partner]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) return setError(labels.required);
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(), type: form.type,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        ...(isEdit ? { isActive: Boolean(form.isActive) } : {}),
      };
      const savedPartner = await requestJSON(
        isEdit
          ? `/business-partners/${partner.id}${buildQueryString({ orgId: activeOrgId })}`
          : `/business-partners${buildQueryString({ orgId: activeOrgId })}`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      (onSaved || onCreated)?.(savedPartner);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || (isEdit ? labels.errorEdit : labels.error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose?.()} fullWidth maxWidth="xs">
      <DialogTitle>{isEdit ? labels.titleEdit : labels.titleCreate}</DialogTitle>
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
          {isEdit ? (
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(form.isActive)}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
              }
              label={labels.active}
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{labels.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>{isEdit ? labels.saveEdit : labels.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
