import PartnerClassificationFields from './PartnerClassificationFields';
import {emptyPartnerClassification,classificationPayload,classificationComplete,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';
import { normalizeLocalizedName, hasLocalizedName } from '../utils/localizedName.mjs';
import PartnerProfileFields from './PartnerProfileFields';
import {entityCodeError} from '../utils/entityCode.mjs';
import EntityDetailSection from './EntityDetailSection';
import EntityBankAccounts from './EntityBankAccounts';
import { ENTITY_TEXT } from '../constants/entityProfile';
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
} from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';
import { emitWorkspaceDataChanged } from '../utils/workspaceDataEvents';

export const BUSINESS_PARTNER_TYPES = ['PROCESS_OUTSOURCING', 'MATERIAL_SUPPLIER', 'LOGISTICS_PROVIDER'];

const TEXT = {
  ko: {
    titleCreate: '거래처 등록', titleEdit: '거래처 수정',
    type: '타입', name: '업체명', contact: '담당자', phone: '연락처', active: '사용 중',
    cancel: '취소', save: '등록', saveEdit: '저장',
    required: '업체명을 입력해 주세요.',
    error: '거래처를 등록하지 못했습니다.', errorEdit: '거래처를 수정하지 못했습니다.',
    outsourcing: '외주 업체', supplier: '공급 업체',
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
  if (type === 'LOGISTICS_PROVIDER') return ({ko:'물류 업체',en:'Logistics provider',vi:'Đơn vị logistics'})[languageCode] || 'Logistics provider';
  return type === 'MATERIAL_SUPPLIER' ? labels.supplier : labels.outsourcing;
};

const buildFormFromPartner = (partner, initialType) => ({
  code: partner?.code || '',
  name: partner?.name || '',
  type: partner?.type || initialType,
  nameKo: partner?.nameKo || '', nameVi: partner?.nameVi || '',businessNumber:partner?.businessNumber || '',country:partner?.country || '',countryCode:partner?.countryCode || '',address:partner?.address || '',email:partner?.email || '',
  contactName: partner?.contactName || '',
  contactPhone: partner?.contactPhone || '',
  classification: partner?.classification || emptyPartnerClassification(),
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
  allowCustomerCreation = false,
}) {
  const labels = TEXT[languageCode] || TEXT.ko;
  const common = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const isEdit = Boolean(partner?.id);
  const [form, setForm] = useState(() => buildFormFromPartner(partner, initialType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [optionsReady,setOptionsReady]=useState(false),[classificationLoaded,setClassificationLoaded]=useState(false);
  const classificationText=PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en;

  useEffect(() => {
    if (open) {
      setForm(buildFormFromPartner(partner, initialType));
      setError('');
    }
  }, [initialType, open, partner]);

  useEffect(()=>{
    if(!open)return;
    let alive=true;setClassificationLoaded(!partner?.id||Boolean(partner.classification));
    if(partner?.id&&!partner.classification)requestJSON('/partner-classifications/'+partner.id+buildQueryString({orgId:activeOrgId}),{skipCache:true}).then(classification=>{if(alive){setForm(current=>({...current,classification}));setClassificationLoaded(true);}}).catch(()=>{if(alive)setError(classificationText.loadError);});
    return()=>{alive=false;};
  },[open,partner,activeOrgId,classificationText.loadError]);

  const save = async () => {
    if (!hasLocalizedName(form, 'name')) return setError(labels.required);
    if(!classificationLoaded||!optionsReady||!classificationComplete(form.classification))return setError(classificationText.required);
    setSaving(true);
    setError('');
    try {
      const body = {
        name: normalizeLocalizedName(form, 'name').name, type: form.type,
        ...Object.fromEntries(['code','nameKo','nameVi','businessNumber','country','countryCode','address','email'].map(key=>[key,form[key].trim()||null])),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        classification: classificationPayload(form.classification),

      };
      const creatingCustomer=allowCustomerCreation&&!isEdit&&form.classification.industries.some(row=>row.partnerRole?.code==='CUSTOMER'&&form.classification.industryIds.includes(row.id));
      if(creatingCustomer){
        body.manager=body.contactName;body.phoneNumber=body.contactPhone;delete body.type;
      }
      const savedPartner = await requestJSON(
        isEdit
          ? `/business-partners/${partner.id}${buildQueryString({ orgId: activeOrgId })}`
          : `${creatingCustomer?'/customers':'/business-partners'}${buildQueryString({ orgId: activeOrgId })}`,
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
      setError(saveError?.message==='PARTNER_CLASSIFICATION_CHANGED'?classificationText.changed:saveError?.message==='PARTNER_CLASSIFICATION_REQUIRED'?classificationText.required:entityCodeError(saveError,languageCode,isEdit ? labels.errorEdit : labels.error));
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
          <PartnerClassificationFields value={form.classification} onChange={classification=>setForm(current=>({...current,classification}))} orgId={activeOrgId} enabled={open} disabled={saving||!classificationLoaded} languageCode={languageCode} initialRoleCode={!isEdit?initialType:undefined} onReady={setOptionsReady}/>

          </Stack></EntityDetailSection>
        </Stack>
      </DialogContent>
      <DialogActions sx={{flexShrink:0,px:3,py:2}}>
        <Button onClick={onClose} disabled={saving}>{labels.cancel}</Button>
        <Button variant="contained" onClick={save} disabled={saving || !hasLocalizedName(form, 'name') || !optionsReady || !classificationLoaded || !classificationComplete(form.classification)}>{isEdit ? labels.saveEdit : labels.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
