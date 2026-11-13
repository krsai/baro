import PartnerClassificationFields from './PartnerClassificationFields';
import {CompanyConnectionField} from './CompanyConnections';
import {emptyPartnerClassification,classificationPayload,classificationComplete,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';
import { normalizeLocalizedName, hasLocalizedName } from '../utils/localizedName.mjs';
import PartnerProfileFields from './PartnerProfileFields';
import {entityCodeError} from '../utils/entityCode.mjs';
import EntityDetailSection from './EntityDetailSection';
import EntityBankAccounts from './EntityBankAccounts';
import { ENTITY_TEXT } from '../constants/entityProfile';
import {PARTY_KIND_TEXT} from '../constants/partyKind';
import React, { useEffect, useRef, useState } from 'react';
import {partnerEditorText} from '../constants/partnerEditor';
import {getSizeSetOptions,normalizeSizeSetCode} from '../constants/productAttributes';
import {hasApparelBrandIndustry} from '../utils/orderDefaultsIndustry.mjs';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Slide, Stack, TextField, useMediaQuery,
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
    outsourcing: '외주 업체', supplier: '유통',
  },
  en: {
    titleCreate: 'Add Partner', titleEdit: 'Edit Partner',
    type: 'Type', name: 'Company name', contact: 'Contact person', phone: 'Phone', active: 'Active',
    cancel: 'Cancel', save: 'Add', saveEdit: 'Save',
    required: 'Enter a company name.',
    error: 'Failed to add the partner.', errorEdit: 'Failed to update the partner.',
    outsourcing: 'Outsourcing partner', supplier: 'Distribution',
  },
  vi: {
    titleCreate: 'Thêm đối tác', titleEdit: 'Sửa đối tác',
    type: 'Loại', name: 'Tên công ty', contact: 'Người liên hệ', phone: 'Số điện thoại', active: 'Đang sử dụng',
    cancel: 'Hủy', save: 'Thêm', saveEdit: 'Lưu',
    required: 'Vui lòng nhập tên công ty.',
    error: 'Không thể thêm đối tác.', errorEdit: 'Không thể cập nhật đối tác.',
    outsourcing: 'Đối tác gia công', supplier: 'Phân phối',
  },
};

export const getBusinessPartnerTypeLabel = (type, languageCode = 'ko') => {
  const labels = TEXT[languageCode] || TEXT.ko;
  if (!BUSINESS_PARTNER_TYPES.includes(type)) return '';
  if (type === 'LOGISTICS_PROVIDER') return ({ko:'물류 업체',en:'Logistics provider',vi:'Đơn vị logistics'})[languageCode] || 'Logistics provider';
  return type === 'MATERIAL_SUPPLIER' ? labels.supplier : labels.outsourcing;
};

const buildFormFromPartner = (partner, initialType) => ({
  linkedCompany:partner?.linkedCompany||null,
  partyKind:partner?.id?partner.partyKind||'':'CORPORATE',
  code: partner?.code || '',
  name: partner?.name || '',
  type: partner?.type || initialType,
  nameKo: partner?.nameKo || '', nameVi: partner?.nameVi || '',businessNumber:partner?.businessNumber || '',country:partner?.country || (partner?.id?'':'VN'),countryCode:partner?.countryCode || (partner?.id?'':'+84'),address:partner?.address || '',email:partner?.email || '',
  contactName: partner?.contactName || '',
  contactPhone: partner?.contactPhone || '',
  classification: partner?.localClassification || partner?.classification || emptyPartnerClassification(),
  defaultSizeSetCode:partner?.defaultSizeSetCode??null,
});

export default function BusinessPartnerDialog(props){return <PartnerEditorState key={`${props.activeOrgId}:${props.partner?.id||'new'}:${props.relationshipId||''}`} {...props}/>;}
function PartnerEditorState({
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
  relationshipId,
}) {
  const labels = TEXT[languageCode] || TEXT.ko;
  const common = ENTITY_TEXT[languageCode] || ENTITY_TEXT.en;
  const isEdit = Boolean(partner?.id||relationshipId);
  const editorText=partnerEditorText[languageCode]||partnerEditorText.en;
  const [loadedPartner,setLoadedPartner]=useState(null),[loadingProfile,setLoadingProfile]=useState(isEdit),[profileFailed,setProfileFailed]=useState(false),[profileReload,setProfileReload]=useState(0);
  const record=loadedPartner||partner,profileLocked=isEdit&&record?.canEditProfile===false;
  const live=useRef(true),saveLock=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const [connectionActionsTarget,setConnectionActionsTarget]=useState(null);
  const [form, setForm] = useState(() => buildFormFromPartner(partner, initialType));
  const [saving, setSaving] = useState(false);
  const locked=saving||loadingProfile||profileFailed;
  const [error, setError] = useState('');
  const [panelKind,setPanelKind]=useState('classification'),[pendingAccounts,setPendingAccounts]=useState([]),[panelOpen,setPanelOpen]=useState(false),[panelExiting,setPanelExiting]=useState(false),[panelTarget,setPanelTarget]=useState(null);
  const reducedMotion=useMediaQuery('(prefers-reduced-motion: reduce)'),panelVisible=panelOpen||panelExiting;
  const togglePanel=(next,kind='classification')=>{if(next)setPanelKind(kind);if(!next&&panelOpen)setPanelExiting(true);setPanelOpen(next);};
  const [optionsReady,setOptionsReady]=useState(false),[classificationLoaded,setClassificationLoaded]=useState(false);
  const officialClassification=form.linkedCompany?.subscriberOrgId&&(form.linkedCompany.officialClassification||record?.officialClassification);
  const hasOfficialClassification=Boolean(officialClassification?.industryIds?.length);
  const displayedClassification=hasOfficialClassification?officialClassification:form.classification;
  const classificationText=PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en;

  useEffect(() => {
    if (open) {
      setForm(buildFormFromPartner(partner, initialType));
      setError('');
      setPendingAccounts([]);setPanelOpen(false);setPanelExiting(false);
    }
  }, [initialType, open, partner]);

  useEffect(()=>{
    if(!open)return;let alive=true;const controller=new AbortController();
    setClassificationLoaded(!isEdit);setProfileFailed(false);setLoadingProfile(isEdit);
    if(isEdit)requestJSON('/partner-editor/'+(relationshipId?'relationship/'+relationshipId:'entity/'+partner.id)+buildQueryString({orgId:activeOrgId}),{skipCache:true,signal:controller.signal}).then(profile=>{if(alive){if(!Number.isSafeInteger(profile?.id)||!['BUSINESS','CUSTOMER'].includes(profile.sourceKind)||partner?.id&&profile.id!==partner.id||relationshipId&&profile.relationshipId!==Number(relationshipId))throw Error('INVALID_PARTNER_PROFILE');setLoadedPartner(profile);setForm(buildFormFromPartner(profile,initialType));setClassificationLoaded(true);}}).catch(failure=>{if(alive&&failure.name!=='AbortError')setProfileFailed(true);}).finally(()=>{if(alive)setLoadingProfile(false);});
    return()=>{alive=false;controller.abort();};
  },[open,partner?.id,relationshipId,activeOrgId,initialType,isEdit,profileReload]);

  const save = async () => {
    if(saveLock.current||locked||profileLocked)return;
    if (!hasLocalizedName(form, 'name')) return setError(labels.required);
    if(form.partyKind==='CORPORATE'&&!form.businessNumber.trim())return setError((PARTY_KIND_TEXT[languageCode]||PARTY_KIND_TEXT.en).businessRequired);
    if(!classificationLoaded||!optionsReady||!classificationComplete(displayedClassification))return setError(classificationText.required);
    saveLock.current=true;setSaving(true);
    setError('');
    try {
      const body = {
        partyKind:form.partyKind||null,
        name: normalizeLocalizedName(form, 'name').name, type: form.type,
        ...Object.fromEntries(['code','nameKo','nameVi','businessNumber','country','countryCode','address','email'].map(key=>[key,form[key].trim()||null])),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        classification: classificationPayload({...displayedClassification,revision:form.classification.revision}),
        ...(form.companyConnection?{companyConnection:form.companyConnection}:{}),
        ...(!isEdit&&pendingAccounts.length?{bankAccounts:pendingAccounts.map(account=>Object.fromEntries(['accountKind','displayName','bankName','accountNumber','accountHolder','currencyId'].map(key=>[key,account[key]])))}:{}),

      };
      const customer=record?.sourceKind==='CUSTOMER';
      if(customer){delete body.type;body.manager=body.contactName;body.phoneNumber=body.contactPhone;if(form.defaultSizeSetCode!==record.defaultSizeSetCode)body.defaultSizeSetCode=form.defaultSizeSetCode;}
      const savedPartner = await requestJSON(
        isEdit
          ? `${customer?'/customers/'+record.relationshipId:'/business-partners/'+record.id}${buildQueryString({ orgId: activeOrgId })}`
          : `/business-partners${buildQueryString({ orgId: activeOrgId })}`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      emitWorkspaceDataChanged({ topics: ['business-partners','customers'], orgId: activeOrgId, source: 'business-partner' });
      if(live.current){(onSaved || onCreated)?.(customer?{...record,...savedPartner,id:record.id,entityId:record.id,relationshipId:record.relationshipId,contactName:savedPartner.manager??form.contactName,contactPhone:savedPartner.phoneNumber??form.contactPhone}:savedPartner);onClose?.();}
    } catch (saveError) {
      if(live.current)setError(['INVALID_BANK_ACCOUNT','INVALID_CURRENCY'].includes(saveError?.message)?common.error:saveError?.message==='PARTNER_CLASSIFICATION_CHANGED'?classificationText.changed:saveError?.message==='PARTNER_CLASSIFICATION_REQUIRED'?classificationText.required:entityCodeError(saveError,languageCode,isEdit ? labels.errorEdit : labels.error,form.partyKind));
    } finally {
      saveLock.current=false;if(live.current)setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose?.()} scroll="paper" fullWidth maxWidth={panelVisible?'lg':'md'} PaperProps={{sx:{m:{xs:1,sm:3},width:{xs:"calc(100% - 16px)",sm:"calc(100% - 48px)"},maxHeight:{xs:"calc(100dvh - 16px)",sm:"calc(100dvh - 48px)"},display:"flex",flexDirection:"column",overflow:"hidden",transition:reducedMotion?'none':'max-width 200ms ease'}}}>
      <DialogTitle sx={{flexShrink:0}}><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><Box component="span">{title || (isEdit ? labels.titleEdit : labels.titleCreate)}</Box><Box component="span" ref={setConnectionActionsTarget} sx={{display:'inline-flex',flexShrink:0}}/></Stack></DialogTitle>
      {loadingProfile&&<LinearProgress/>}
      {profileFailed&&<Alert severity="error" sx={{mx:3,mb:1}} action={<Button onClick={()=>setProfileReload(value=>value+1)}>{editorText.retry}</Button>}>{editorText.loadError}</Alert>}
      {profileLocked&&<Alert severity="info" sx={{mx:3,mb:1}}>{editorText.private}</Alert>}
      {error&&<Alert severity="error" sx={{mx:3,mb:1,flexShrink:0}}>{error}</Alert>}
      <DialogContent dividers sx={{minHeight:0,overflowY:"auto",overflowX:"hidden"}}>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:panelVisible?'minmax(0,1fr) 340px':'minmax(0,1fr)'},gap:panelVisible?2:0,alignItems:'start'}}><Stack spacing={2} sx={{ pt: 1,minWidth:0 }}>
          <CompanyConnectionField searchMode sidePanelTarget={panelKind==='connections'?panelTarget:null} sidePanelOpen={panelOpen&&panelKind==='connections'} onPanelOpenChange={next=>togglePanel(next,'connections')} knownCompany={form.linkedCompany} actionsTarget={connectionActionsTarget} orgId={activeOrgId} entityId={record?.id} name={form.name} businessNumber={form.businessNumber} country={form.country} value={form.companyConnection} onChange={(companyConnection,linkedCompany)=>setForm(current=>({...current,companyConnection,...(linkedCompany!==undefined?{linkedCompany}:{}),...(linkedCompany?{...Object.fromEntries(['name','nameKo','nameVi','address','country','businessNumber','email'].map(key=>[key,linkedCompany[key]||''])),contactName:linkedCompany.representative||'',contactPhone:linkedCompany.phone||'',...(!isEdit&&linkedCompany.officialClassification?{classification:{...linkedCompany.officialClassification,revision:0}}:{})}:{})}))} disabled={locked||(profileLocked&&!form.linkedCompany)} languageCode={languageCode}/>
          <PartnerProfileFields hideGuidance value={form} languageCode={languageCode} disabled={locked||profileLocked} autoFocus onChange={(key,value)=>setForm(current=>({...current,[key]:value}))}/>
          <EntityBankAccounts hideGuidance entityId={record?.id} orgId={activeOrgId} languageCode={languageCode} onAccountsChange={onAccountsChange} pendingAccounts={pendingAccounts} onPendingAccountsChange={isEdit?undefined:setPendingAccounts} disabled={locked}/>

          <PartnerClassificationFields title={common.role} expandable sidePanelTarget={panelKind==='classification'?panelTarget:null} sidePanelOpen={panelOpen&&panelKind==='classification'} onPanelOpenChange={togglePanel} value={displayedClassification} onChange={classification=>setForm(current=>({...current,classification}))} orgId={activeOrgId} enabled={open} disabled={locked||profileLocked||!classificationLoaded||hasOfficialClassification} languageCode={languageCode} onReady={setOptionsReady}/>


          {record?.sourceKind==='CUSTOMER'&&hasApparelBrandIndustry(displayedClassification)&&<EntityDetailSection title={editorText.order}><TextField fullWidth select size="small" label={editorText.size} value={normalizeSizeSetCode(form.defaultSizeSetCode)} disabled={locked||profileLocked} onChange={event=>setForm(current=>({...current,defaultSizeSetCode:event.target.value}))}>{getSizeSetOptions(languageCode).map(option=><MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}</TextField></EntityDetailSection>}
        </Stack><Slide direction="left" in={panelOpen} timeout={reducedMotion?0:200} mountOnEnter unmountOnExit onExited={()=>setPanelExiting(false)}><Box ref={setPanelTarget} sx={{minWidth:0}}/></Slide></Box>
      </DialogContent>
      <DialogActions sx={{flexShrink:0,px:3,py:2,flexWrap:'wrap',gap:1,'& > :not(style) ~ :not(style)':{ml:0}}}>

        <Stack direction="row" spacing={1} alignItems="center" sx={{maxWidth:'100%'}}>

        <Button variant="contained" onClick={save} disabled={locked||profileLocked}>{isEdit ? labels.saveEdit : labels.save}</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
