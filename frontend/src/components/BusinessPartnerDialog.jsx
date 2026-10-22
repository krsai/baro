import PartnerProfileFields from './PartnerProfileFields';
import EntityDetailSection from './EntityDetailSection';
import EntityBankAccounts from './EntityBankAccounts';
import { ENTITY_TEXT } from '../constants/entityProfile';
import { INDUSTRY_TREE_TEXT } from '../constants/industryHierarchy';
import { getStaticOptionOptions } from '../constants/staticOptionRegistry';
import React, { useEffect, useId, useState } from 'react';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
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
    outsourcing: '외주 업체', supplier: '구매처',
  },
  en: {
    titleCreate: 'Add Partner', titleEdit: 'Edit Partner',
    type: 'Type', name: 'Company name', contact: 'Contact person', phone: 'Phone', active: 'Active',
    cancel: 'Cancel', save: 'Add', saveEdit: 'Save',
    required: 'Enter a company name.',
    error: 'Failed to add the partner.', errorEdit: 'Failed to update the partner.',
    outsourcing: 'Outsourcing partner', supplier: 'Supplier',
  },
  vi: {
    titleCreate: 'Thêm đối tác', titleEdit: 'Sửa đối tác',
    type: 'Loại', name: 'Tên công ty', contact: 'Người liên hệ', phone: 'Số điện thoại', active: 'Đang sử dụng',
    cancel: 'Hủy', save: 'Thêm', saveEdit: 'Lưu',
    required: 'Vui lòng nhập tên công ty.',
    error: 'Không thể thêm đối tác.', errorEdit: 'Không thể cập nhật đối tác.',
    outsourcing: 'Đối tác gia công', supplier: 'Nhà cung cấp',
  },
};

export const getBusinessPartnerTypeLabel = (type, languageCode = 'ko') => {
  const labels = TEXT[languageCode] || TEXT.ko;
  if (!BUSINESS_PARTNER_TYPES.includes(type)) return '';
  return type === 'MATERIAL_SUPPLIER' ? labels.supplier : labels.outsourcing;
};

const buildFormFromPartner = (partner, initialType) => ({
  code: partner?.code || '',
  name: partner?.name || '',
  type: partner?.type || initialType,
  nameKo: partner?.nameKo || '', nameVi: partner?.nameVi || '',businessNumber:partner?.businessNumber || '',country:partner?.country || '',countryCode:partner?.countryCode || '',address:partner?.address || '',email:partner?.email || '',
  contactName: partner?.contactName || '',
  contactPhone: partner?.contactPhone || '',
  isActive: partner?.isActive !== false,
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
  title,
  onAccountsChange,
}) {
  const labels = TEXT[languageCode] || TEXT.ko;
  const industryLabelId=useId();
  const common = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const countryOptions=getStaticOptionOptions('country',languageCode);
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
    let alive=true;
    requestJSON(`/outsourcing-service-types${buildQueryString({ orgId: activeOrgId, forPartner: '1', partnerType: form.type })}`, { skipGlobalLoading: true, skipCache: true })
      .then((rows) => {if(alive)setServiceTypes(Array.isArray(rows) ? rows : []);})
      .catch(() => {if(alive)setServiceTypes([]);});
    return()=>{alive=false;};
  }, [activeOrgId, open, form.type]);

  const industryOptions=[...serviceTypes,...(partner?.serviceTypes||[]).filter(row=>!serviceTypes.some(option=>option.id===row.id))];

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.name.trim()) return setError(labels.required);
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(), type: form.type,
        ...Object.fromEntries(['code','nameKo','nameVi','businessNumber','country','countryCode','address','email'].map(key=>[key,form[key].trim()||null])),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        serviceTypeIds: form.serviceTypeIds,
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
    <Dialog open={open} onClose={() => !saving && onClose?.()} scroll="paper" fullWidth maxWidth="md" PaperProps={{sx:{m:{xs:1,sm:3},width:{xs:"calc(100% - 16px)",sm:"calc(100% - 48px)"},maxHeight:{xs:"calc(100dvh - 16px)",sm:"calc(100dvh - 48px)"},display:"flex",flexDirection:"column",overflow:"hidden"}}}>
      <DialogTitle sx={{flexShrink:0}}>{title || (isEdit ? labels.titleEdit : labels.titleCreate)}</DialogTitle>
      <DialogContent dividers sx={{minHeight:0,overflowY:"auto",overflowX:"hidden"}}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <PartnerProfileFields value={form} languageCode={languageCode} disabled={saving} autoFocus onChange={(key,value)=>setForm(current=>({...current,[key]:value}))}/>
          <EntityBankAccounts entityId={partner?.id} orgId={activeOrgId} languageCode={languageCode} onAccountsChange={onAccountsChange}/>
          <EntityDetailSection title={common.role}><Stack spacing={2}>
          <TextField label={(INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en).category} value={getBusinessPartnerTypeLabel(form.type,languageCode)} InputProps={{readOnly:true}}/>
          {true ? (
            <FormControl fullWidth>
              <InputLabel id={industryLabelId}>{(INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en).industry}</InputLabel>
              <Select
                labelId={industryLabelId}
                multiple
                value={form.serviceTypeIds}
                label={(INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en).industry}
                onChange={update('serviceTypeIds')}
                renderValue={(ids) => ids.map((id) => {
                  const item = industryOptions.find((candidate) => candidate.id === id);
                  return item?.[languageCode === 'ko' ? 'nameKo' : languageCode === 'vi' ? 'nameVi' : 'nameEn'] || item?.nameEn || id;
                }).join(', ')}
              >
                {industryOptions.filter(item=>!item.systemDefault?.partnerRole || item.systemDefault.partnerRole.code===form.type || form.serviceTypeIds.includes(item.id)).map((item) => {
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
      <DialogActions sx={{flexShrink:0,px:3,py:2}}>
        <Button onClick={onClose} disabled={saving}>{labels.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={saving || !form.name.trim()}>{isEdit ? labels.saveEdit : labels.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
