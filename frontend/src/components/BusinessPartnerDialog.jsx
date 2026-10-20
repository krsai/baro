import EntityDetailSection from './EntityDetailSection';
import EntityBankAccounts from './EntityBankAccounts';
import { ENTITY_TEXT } from '../constants/entityProfile';
import { getStaticOptionOptions } from '../constants/staticOptionRegistry';
import { EXPENSE_TEXT } from '../constants/expenseTypes';
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, ListItemText, MenuItem, Select, Stack, Switch, TextField,
} from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';
import { emitWorkspaceDataChanged } from '../utils/workspaceDataEvents';

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
  nameKo: partner?.nameKo || '', nameVi: partner?.nameVi || '',businessNumber:partner?.businessNumber || '',country:partner?.country || '',countryCode:partner?.countryCode || '',address:partner?.address || '',email:partner?.email || '',
  contactName: partner?.contactName || '',
  contactPhone: partner?.contactPhone || '',
  isActive: partner?.isActive !== false,
  partnerExpenseTypeId: partner?.partnerExpenseTypeId || '',
  serviceTypeIds: (partner?.serviceTypes || []).map((item) => item.id),
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
  const common = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const countryOptions=getStaticOptionOptions('country',languageCode);
  const expenseLabels = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko;
  const [expenseTypes,setExpenseTypes] = useState([]);
  const isEdit = Boolean(partner?.id);
  const [form, setForm] = useState(() => buildFormFromPartner(partner, initialType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [serviceTypes, setServiceTypes] = useState([]);

  useEffect(() => {
    if (open) {
      setForm(buildFormFromPartner(partner, initialType));
      setError('');
    }
  }, [initialType, open, partner]);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    requestJSON('/expense-types', { skipGlobalLoading: true }).then(setExpenseTypes).catch(() => setError(labels.error));
    requestJSON(`/outsourcing-service-types${buildQueryString({ orgId: activeOrgId })}`, { skipGlobalLoading: true })
      .then((rows) => setServiceTypes(Array.isArray(rows) ? rows : []))
      .catch(() => setServiceTypes([]));
  }, [activeOrgId, open]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) return setError(labels.required);
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(), type: form.type,
        ...Object.fromEntries(['nameKo','nameVi','businessNumber','country','countryCode','address','email'].map(key=>[key,form[key].trim()||null])),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        serviceTypeIds: form.serviceTypeIds,
        partnerExpenseTypeId: form.partnerExpenseTypeId || expenseTypes.find(row => row.entryMode === (form.type === 'MATERIAL_SUPPLIER' ? 'PURCHASE' : 'PROCESS'))?.id,
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
      emitWorkspaceDataChanged({ topics: ['business-partners'], orgId: activeOrgId, source: 'business-partner' });
      (onSaved || onCreated)?.(savedPartner);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || (isEdit ? labels.errorEdit : labels.error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose?.()} fullWidth maxWidth="md">
      <DialogTitle>{isEdit ? labels.titleEdit : labels.titleCreate}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <EntityDetailSection title={common.identity}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',md:'repeat(3,minmax(0,1fr))'},gap:2}}>
            <TextField autoFocus required fullWidth label={labels.name} value={form.name} onChange={update('name')} />
            <TextField label={common.nameKo} value={form.nameKo} onChange={update('nameKo')} />
            <TextField label={common.nameVi} value={form.nameVi} onChange={update('nameVi')} />
            <TextField label={common.businessNumber} value={form.businessNumber} onChange={update('businessNumber')} />
          </Box></EntityDetailSection>
          <EntityDetailSection title={common.contact}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
            <TextField label={labels.contact} value={form.contactName} onChange={update('contactName')} />
            <TextField label={common.countryCode} value={form.countryCode} onChange={update('countryCode')} />
            <TextField label={labels.phone} value={form.contactPhone} onChange={update('contactPhone')} />
            <TextField type="email" label={common.email} value={form.email} onChange={update('email')} />
          </Box></EntityDetailSection>
          <EntityDetailSection title={common.address}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'160px minmax(0,1fr)'},gap:2}}>
            <TextField select label={common.country} value={form.country} onChange={update('country')}><MenuItem value="">—</MenuItem>{countryOptions.map(row=><MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}</TextField>
            <TextField multiline minRows={2} label={common.address} value={form.address} onChange={update('address')} />
          </Box></EntityDetailSection>
          <EntityBankAccounts entityId={partner?.id} orgId={activeOrgId} languageCode={languageCode}/>
          <EntityDetailSection title={common.role}><Stack spacing={2}>
          <TextField select label={expenseLabels.partnerType} value={form.partnerExpenseTypeId || expenseTypes.find(row => row.entryMode === (form.type === 'MATERIAL_SUPPLIER' ? 'PURCHASE' : 'PROCESS'))?.id || ''} onChange={event => setForm({ ...form, partnerExpenseTypeId: event.target.value })}>
            {expenseTypes.filter(row => row.isActive || row.id === form.partnerExpenseTypeId).map(row => <MenuItem key={row.id} value={row.id}>{row[languageCode === 'ko' ? 'nameKo' : languageCode === 'vi' ? 'nameVi' : 'nameEn']}</MenuItem>)}
          </TextField>
          {true ? (
            <FormControl fullWidth>
              <InputLabel>{languageCode === 'ko' ? '외주 업종' : languageCode === 'vi' ? 'Ngành dịch vụ' : 'Outsourcing industries'}</InputLabel>
              <Select
                multiple
                value={form.serviceTypeIds}
                label={languageCode === 'ko' ? '외주 업종' : languageCode === 'vi' ? 'Ngành dịch vụ' : 'Outsourcing industries'}
                onChange={update('serviceTypeIds')}
                renderValue={(ids) => ids.map((id) => {
                  const item = serviceTypes.find((candidate) => candidate.id === id);
                  return item?.[languageCode === 'ko' ? 'nameKo' : languageCode === 'vi' ? 'nameVi' : 'nameEn'] || item?.nameEn || id;
                }).join(', ')}
              >
                {serviceTypes.map((item) => {
                  const label = item[languageCode === 'ko' ? 'nameKo' : languageCode === 'vi' ? 'nameVi' : 'nameEn'] || item.nameEn;
                  return <MenuItem key={item.id} value={item.id}><Checkbox checked={form.serviceTypeIds.includes(item.id)} /><ListItemText primary={label} /></MenuItem>;
                })}
              </Select>
            </FormControl>
          ) : null}
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
          </Stack></EntityDetailSection>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{labels.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>{isEdit ? labels.saveEdit : labels.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
