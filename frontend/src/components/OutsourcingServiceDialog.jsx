import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField } from '@mui/material';
import { buildQueryString, requestJSON } from '../utils/apiClient';

export const TRANSACTION_TEXT = {
  ko: { industry: '업종', addIndustry: '업종 등록', code: '코드', nameKo: '한국어 이름', nameEn: '영어 이름', nameVi: '베트남어 이름', entryMode: '입력 방식', PROCESS: '공정 외주 (공정 연결 필수)', LOGISTICS: '물류·운송', GENERAL: '일반 서비스', transportDate: '운송일', origin: '출발지', destination: '도착지', reference: '증빙·운송장 번호', requiredFields: '필수 입력 항목', save: '등록', cancel: '취소', error: '저장하지 못했습니다.', costs: '거래 비용', process: '공정 외주', addCost: '거래 비용 등록', date: '거래일', partner: '업체', description: '거래 내용', amount: '금액', currency: '통화', order: '연결 주문 (선택)', none: '선택 안 함', empty: '등록된 거래 비용이 없습니다.', help: '공정 작업 대행은 공정 외주에서 기존 방식으로 입력합니다. 물류·일반 서비스 비용은 이곳에 등록합니다.', adminHelp: '업체와 업종 등록·수정은 전체 시스템 관리자가 담당합니다.', loadError: '거래 정보를 불러오지 못했습니다.', search: '업체·업종·내용 검색', creator: '입력자' },
  en: { industry: 'Industry', addIndustry: 'Add industry', code: 'Code', nameKo: 'Korean name', nameEn: 'English name', nameVi: 'Vietnamese name', entryMode: 'Entry mode', PROCESS: 'Process outsourcing (process required)', LOGISTICS: 'Logistics', GENERAL: 'General service', transportDate: 'Transport date', origin: 'Origin', destination: 'Destination', reference: 'Document / tracking number', requiredFields: 'Required fields', save: 'Add', cancel: 'Cancel', error: 'Failed to save.', costs: 'Transaction costs', process: 'Process outsourcing', addCost: 'Add transaction cost', date: 'Transaction date', partner: 'Partner', description: 'Description', amount: 'Amount', currency: 'Currency', order: 'Linked order (optional)', none: 'None', empty: 'No transaction costs.', help: 'Enter process work using the existing Process outsourcing form. Register logistics and general service costs here.', adminHelp: 'Only the system administrator can add or edit partners and industries.', loadError: 'Failed to load transaction data.', search: 'Search partner, industry or description', creator: 'Created by' },
  vi: { industry: 'Ngành dịch vụ', addIndustry: 'Thêm ngành dịch vụ', code: 'Mã', nameKo: 'Tên tiếng Hàn', nameEn: 'Tên tiếng Anh', nameVi: 'Tên tiếng Việt', entryMode: 'Cách nhập', PROCESS: 'Gia công (bắt buộc liên kết công đoạn)', LOGISTICS: 'Vận chuyển', GENERAL: 'Dịch vụ khác', transportDate: 'Ngày vận chuyển', origin: 'Nơi đi', destination: 'Nơi đến', reference: 'Số chứng từ / vận đơn', requiredFields: 'Thông tin bắt buộc', save: 'Thêm', cancel: 'Hủy', error: 'Không thể lưu.', costs: 'Chi phí giao dịch', process: 'Gia công', addCost: 'Thêm chi phí giao dịch', date: 'Ngày giao dịch', partner: 'Đối tác', description: 'Nội dung giao dịch', amount: 'Số tiền', currency: 'Tiền tệ', order: 'Đơn hàng liên quan (tùy chọn)', none: 'Không chọn', empty: 'Chưa có chi phí giao dịch.', help: 'Nhập công việc gia công bằng biểu mẫu Gia công hiện có. Đăng ký chi phí vận chuyển và dịch vụ khác tại đây.', adminHelp: 'Chỉ quản trị viên hệ thống được thêm hoặc sửa đối tác và ngành dịch vụ.', loadError: 'Không thể tải dữ liệu giao dịch.', search: 'Tìm đối tác, ngành hoặc nội dung', creator: 'Người nhập' },
};
export const serviceName = (item, language) => item?.[language === 'ko' ? 'nameKo' : language === 'vi' ? 'nameVi' : 'nameEn'] || item?.nameEn || '';
export const OUTSOURCING_REQUEST_TEXT = {
  ko: { costs: '외주 이용·비용 신청', addCost: '외주 이용 신청', process: '공정 작업 대행', historical: '기존 외주 기록', next: '공정·작업 수량 입력', help: '업체와 업종을 선택해 외주 이용을 신청합니다. 공정 작업 대행은 공정과 수량을 연결하고, 물류·일반 서비스는 관련 주문과 비용을 등록합니다. 기존 외주 기록은 그대로 보존됩니다.', processHelp: '공정 작업 대행은 연결된 공정과 실제 작업 수량이 필요합니다.' },
  en: { costs: 'Outsourcing and cost requests', addCost: 'New outsourcing request', process: 'Process work', historical: 'Existing outsourcing record', next: 'Enter process and quantity', help: 'Select a partner and industry to request outsourcing. Process work requires a process and quantity; logistics and general services link costs to an order. Existing records are preserved.', processHelp: 'Process work requires a linked process and actual work quantity.' },
  vi: { costs: 'Đề nghị thuê ngoài và chi phí', addCost: 'Đề nghị thuê ngoài', process: 'Gia công theo công đoạn', historical: 'Hồ sơ gia công hiện có', next: 'Nhập công đoạn và số lượng', help: 'Chọn đối tác và ngành dịch vụ để đề nghị thuê ngoài. Gia công cần liên kết công đoạn và số lượng; vận chuyển và dịch vụ khác ghi nhận chi phí theo đơn hàng. Hồ sơ hiện có được giữ nguyên.', processHelp: 'Gia công cần liên kết công đoạn và số lượng thực tế.' },
};

export default function OutsourcingServiceDialog({ open, onClose, onSaved, orgId, languageCode }) {
  const labels = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const [form, setForm] = useState({ code: '', nameKo: '', nameEn: '', nameVi: '', entryMode: 'PROCESS', requiredFields: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [editingId, setEditingId] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    requestJSON(`/outsourcing-service-types${buildQueryString({ orgId, all: '1' })}`, { skipCache: true }).then(setServices).catch(() => setError(labels.loadError));
  }, [open, orgId, labels.loadError]);
  const save = async () => {
    setSaving(true); setError('');
    try {
      await requestJSON(`/outsourcing-service-types${editingId ? `/${editingId}` : ''}${buildQueryString({ orgId })}`, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      onSaved?.(); onClose();
      setEditingId('');
      setForm({ code: '', nameKo: '', nameEn: '', nameVi: '', entryMode: 'PROCESS', requiredFields: [] });
    } catch { setError(labels.error); } finally { setSaving(false); }
  };
  return <Dialog open={open} onClose={() => !saving && onClose()} fullWidth maxWidth="xs"><DialogTitle>{labels.addIndustry}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select label={labels.industry} value={editingId} onChange={event => { const id = event.target.value; setEditingId(id); const service = services.find(item => item.id === id); setForm(service ? { ...service } : { code: '', nameKo: '', nameEn: '', nameVi: '', entryMode: 'PROCESS', requiredFields: [] }); }}><MenuItem value="">{labels.addIndustry}</MenuItem>{services.map(service => <MenuItem key={service.id} value={service.id}>{serviceName(service, languageCode)}</MenuItem>)}</TextField>
    {['code', 'nameKo', 'nameEn', 'nameVi'].map(key => <TextField key={key} required disabled={saving || (key === 'code' && Boolean(editingId))} label={labels[key]} value={form[key]} onChange={event => setForm({ ...form, [key]: key === 'code' ? event.target.value.toUpperCase() : event.target.value })} />)}
    <TextField select disabled={Boolean(editingId) || saving} label={labels.entryMode} value={form.entryMode} onChange={event => setForm({ ...form, entryMode: event.target.value, requiredFields: event.target.value === 'LOGISTICS' ? ['transportDate', 'origin', 'destination'] : [] })}>{['PROCESS', 'LOGISTICS', 'GENERAL'].map(mode => <MenuItem key={mode} value={mode}>{labels[mode]}</MenuItem>)}</TextField>
    {form.entryMode !== 'PROCESS' && <Stack>{labels.requiredFields}{['transportDate', 'origin', 'destination', 'reference'].map(key => <FormControlLabel key={key} label={labels[key]} control={<Checkbox checked={form.requiredFields.includes(key)} disabled={form.entryMode === 'LOGISTICS' && key !== 'reference'} onChange={event => setForm({ ...form, requiredFields: event.target.checked ? [...form.requiredFields, key] : form.requiredFields.filter(field => field !== key) })} />}/>)}</Stack>}
    {editingId && <FormControlLabel label={languageCode === 'ko' ? '사용 중' : languageCode === 'vi' ? 'Đang sử dụng' : 'Active'} control={<Checkbox checked={form.isActive !== false} disabled={saving} onChange={event => setForm({ ...form, isActive: event.target.checked })} />} />}
  </Stack></DialogContent><DialogActions><Button disabled={saving} onClick={onClose}>{labels.cancel}</Button><Button disabled={saving || ['code', 'nameKo', 'nameEn', 'nameVi'].some(key => !form[key].trim())} onClick={save} variant="contained">{labels.save}</Button></DialogActions></Dialog>;
}
