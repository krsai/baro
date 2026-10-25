import LocalizedNameFields from '../../components/LocalizedNameFields';
import { hasLocalizedName } from '../../utils/localizedName.mjs';
import PageContentStack from '../../components/PageContentStack';
import { EXPENSE_TEXT } from '../../constants/expenseTypes';
import { useAppActions } from '../../context/AppContext';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import SaveButton from '../../components/SaveButton';
import AppPageContainer from '../../components/AppPageContainer';
import { serviceName } from '../../components/OutsourcingServiceDialog';
import SettingDeleteButton from '../../components/SettingDeleteButton';
import { IconButton, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useLanguage } from '../../context/LanguageContext';
import { requestJSON } from '../../utils/apiClient';
import { subscribeWorkspaceDataChanged } from '../../utils/workspaceDataEvents';

const TEXT = {
  ko: { title: '코드·업종 관리 · 시스템 기본값', add: '기본 코드 등록', industry: '업종·입력 옵션 관리', code: '기본 코드', name: '거래 내용', tax: '세금 구분', generated: '자동 생성 코드', active: '사용 설정', edit: '수정', save: '저장', cancel: '취소', help: '영문 3자리 기본 코드에 세금 구분을 붙입니다. V: 과세 · Z: 영세율 · E: 면세. 비용 입력 시 완성된 4자리 코드를 선택합니다.', hint: '예: TRK (영문 대문자 3자리)', legacy: '기존 미분류 코드는 이력과 ID를 보존합니다. VAT 미적용 기록을 면세나 영세율로 추측 변경하지 않습니다.', error: '설정을 불러오거나 저장하지 못했습니다. 코드 중복과 연결 정보를 확인해 주세요.', empty: '등록된 기본 코드가 없습니다.', legacyCount: '기존 코드 보존' },
  en: { title: 'Codes & industries · System defaults', add: 'Add base code', industry: 'Industries & input options', code: 'Base code', name: 'Description', tax: 'Tax treatment', generated: 'Generated codes', active: 'Enabled', edit: 'Edit', save: 'Save', cancel: 'Cancel', help: 'Use 3 English letters plus V: VAT, Z: zero-rated or E: exempt. Select the generated 4-letter code when entering a cost.', hint: 'Example: TRK (3 uppercase English letters)', legacy: 'Legacy unclassified codes retain their IDs and history. Non-VAT history is not inferred as exempt or zero-rated.', error: 'Could not load or save settings. Check duplicate codes and linked settings.', empty: 'No base codes registered.', legacyCount: 'Legacy codes preserved' },
  vi: { title: 'Quản lý mã và ngành · Mặc định hệ thống', add: 'Thêm mã gốc', industry: 'Ngành và tùy chọn nhập', code: 'Mã gốc', name: 'Nội dung', tax: 'Phân loại thuế', generated: 'Mã tự động', active: 'Cho phép sử dụng', edit: 'Sửa', save: 'Lưu', cancel: 'Hủy', help: 'Dùng 3 chữ cái và V: chịu thuế, Z: thuế suất 0%, E: không chịu thuế. Chọn mã 4 chữ khi nhập chi phí.', hint: 'Ví dụ: TRK (3 chữ cái viết hoa)', legacy: 'Giữ nguyên mã và lịch sử chưa phân loại thuế. Không tự suy đoán lịch sử không VAT thành miễn thuế hoặc thuế suất 0%.', error: 'Không thể tải hoặc lưu. Kiểm tra mã trùng và cài đặt liên kết.', empty: 'Chưa có mã gốc.', legacyCount: 'Giữ mã cũ' },
};
const TAXES = [{ id: 1, suffix: 'V', ko: '과세', en: 'VAT', vi: 'Chịu thuế' }, { id: 2, suffix: 'Z', ko: '영세율', en: 'Zero-rated', vi: 'Thuế suất 0%' }, { id: 3, suffix: 'E', ko: '면세', en: 'Exempt', vi: 'Không chịu thuế' }];
const emptyForm = () => ({ code: '', nameKo: '', nameEn: '', nameVi: '', serviceTypeId: '', expenseTypeId: '', requiredFields: [], orderInput: 'OPTIONAL', styleInput: 'HIDDEN', processInput: 'HIDDEN', taxTreatmentIds: [1,2,3], isActive: true });
const path = '/system-setting-defaults/code-bases';
export default function CodeBaseSettings() {
  const { languageCode } = useLanguage();
  const oldLabels = TEXT[languageCode] || TEXT.ko;
  const expenseLabels = EXPENSE_TEXT[languageCode] || EXPENSE_TEXT.ko;
  const labels = { ...oldLabels, title: expenseLabels.codes, industry: expenseLabels.industry };
  const { navigateToPath } = useAppActions();
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [rows, setRows] = useState([]), [services, setServices] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [form, setForm] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      try { await requestJSON('/system-setting-defaults/other-expense-defaults', {method:'POST',body:JSON.stringify({})}); }
      catch { setError(labels.error); }
      const [bases, industries, types] = await Promise.all([requestJSON(path, { skipCache: true }), requestJSON('/system-setting-defaults/services', { skipCache: true }), requestJSON('/expense-types', { skipCache: true })]);
      setRows(bases); setServices(industries); setExpenseTypes(types);
    }
    catch { setError(labels.error); } finally { setLoading(false); }
  }, [labels.error]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsubscribe = subscribeWorkspaceDataChanged(detail => { if (detail?.source === 'transaction-request') load(); });
    const refresh = () => load();
    window.addEventListener('focus',refresh);
    return () => { unsubscribe(); window.removeEventListener('focus',refresh); };
  }, [load]);
  const save = async () => {
    setSaving(true); setError('');
    try { await requestJSON(`${path}${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); setForm(null); await load(); }
    catch { setError(labels.error); } finally { setSaving(false); }
  };
  return <AppPageContainer title={labels.title} titleActions={<Stack direction="row" spacing={1}><Button onClick={() => navigateToPath('/system-setting/expense-types', { label: expenseLabels.types })}>{expenseLabels.types}</Button><Button variant="contained" disabled={loading} onClick={() => setForm(emptyForm())}>{labels.add}</Button></Stack>}>
    <PageContentStack><Alert severity="info">{labels.help}</Alert>{error && <Alert severity="error">{error}</Alert>}<TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{[labels.code, labels.name, expenseLabels.type, labels.industry, labels.active, ''].map((label,index) => <TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Typography fontWeight={700}>{row.code}</Typography></TableCell><TableCell>{serviceName(row, languageCode)}</TableCell><TableCell>{serviceName(row.expenseType, languageCode)}</TableCell><TableCell>{serviceName(row.serviceType, languageCode)}</TableCell><TableCell>{row.isActive ? '✓' : '—'}</TableCell><TableCell><Stack direction="row"><Tooltip title={labels.edit}><IconButton aria-label={labels.edit} color="primary" size="small" onClick={() => setForm({ ...row, taxTreatmentIds: row.variants.filter(value => value.taxTreatmentId && (value.isEnabled ?? value.isActive)).map(value => value.taxTreatmentId) })}><EditIcon fontSize="small" /></IconButton></Tooltip><SettingDeleteButton path={path} id={row.id} name={row.code} used={row.hasUsageHistory} disabled={loading} languageCode={languageCode} onDeleted={load} onError={async message => { await load(); setError(message); }} /></Stack></TableCell></TableRow>)}{!loading && !rows.length && <TableRow><TableCell colSpan={6}>{labels.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer><Typography variant="caption" color="text.secondary">{labels.legacy}</Typography></PageContentStack>
    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullWidth maxWidth="md" slotProps={{paper:{sx:{maxHeight:'calc(100dvh - 48px)'}}}}>
      <DialogTitle>{form?.id ? labels.edit : labels.add}</DialogTitle>
      <DialogContent dividers>{form && <Stack spacing={2.5} sx={{py:1}}>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:2}}>
          <TextField required label={labels.code} helperText={labels.hint} sx={{width:180}} value={form.code} disabled={saving || Boolean(form.id)} onChange={event=>setForm({...form,code:event.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)})} />
          <FormControlLabel label={labels.active} control={<Checkbox disabled={saving} checked={form.isActive} onChange={event=>setForm({...form,isActive:event.target.checked})} />} />
        </Box>
        <Box>
          <LocalizedNameFields value={form} languageCode={languageCode} disabled={saving} onChange={(key, value) => setForm(prev => ({ ...prev, [key]: value }))} />
        </Box>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
          <TextField select required label={expenseLabels.type} disabled={saving} value={form.expenseTypeId || ''} onChange={event=>{const type=expenseTypes.find(row=>row.id===event.target.value);setForm({...form,expenseTypeId:type.id,entryMode:type.entryMode,requiredFields:type.entryMode==='LOGISTICS'?['transportDate','origin','destination']:[],orderInput:type.entryMode==='PROCESS'?'REQUIRED':'OPTIONAL',styleInput:type.entryMode==='PROCESS'?'REQUIRED':'HIDDEN',processInput:type.entryMode==='PROCESS'?'REQUIRED':'HIDDEN'});}}>{expenseTypes.filter(row=>row.isActive || row.id===form.expenseTypeId).map(row=><MenuItem key={row.id} value={row.id}>{serviceName(row,languageCode)}</MenuItem>)}</TextField>
          <TextField select required label={labels.industry} disabled={saving || Boolean(form.id)} value={form.serviceTypeId} onChange={event=>setForm({...form,serviceTypeId:event.target.value})}>{services.map(row=><MenuItem key={row.id} value={row.id}>{serviceName(row,languageCode)}</MenuItem>)}</TextField>
        </Box>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:2}}>
          {['order','style','process'].map(key=><TextField key={key} select label={expenseLabels[key]} disabled={saving || form.entryMode==='PROCESS'} value={form[key+'Input'] || 'HIDDEN'} onChange={event=>setForm({...form,[key+'Input']:event.target.value})}>{['REQUIRED','OPTIONAL','HIDDEN'].map(option=><MenuItem key={option} value={option}>{expenseLabels[option]}</MenuItem>)}</TextField>)}
        </Box>
        <Box sx={{pt:2,borderTop:1,borderColor:'divider'}}>
          <Typography variant="subtitle2" sx={{mb:1}}>{expenseLabels.requiredFields}</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'repeat(4,minmax(0,1fr))'}}}>
            {['transportDate','origin','destination','reference'].map(key=><FormControlLabel key={key} label={expenseLabels[key]} control={<Checkbox disabled={saving} checked={(form.requiredFields || []).includes(key)} onChange={event=>setForm({...form,requiredFields:event.target.checked?[...(form.requiredFields || []),key]:(form.requiredFields || []).filter(field=>field!==key)})} />} />)}
          </Box>
        </Box>
        <Box sx={{pt:2,borderTop:1,borderColor:'divider'}}>
          <Typography variant="subtitle2" sx={{mb:1}}>{labels.tax}</Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap">{TAXES.map(tax=><FormControlLabel key={tax.id} label={tax.suffix+' ? '+(tax[languageCode] || tax.en)} control={<Checkbox disabled={saving} checked={form.taxTreatmentIds.includes(tax.id)} onChange={event=>setForm({...form,taxTreatmentIds:event.target.checked?[...form.taxTreatmentIds,tax.id]:form.taxTreatmentIds.filter(id=>id!==tax.id)})} />} />)}</Stack>
          <Typography variant="body2" color="text.secondary" sx={{mt:1}}>{labels.generated}: {form.taxTreatmentIds.map(id=>form.code+TAXES.find(tax=>tax.id===id).suffix).join(' ? ')}</Typography>
        </Box>
      </Stack>}</DialogContent>
      <DialogActions sx={{px:3,py:2}}><Button disabled={saving} onClick={()=>setForm(null)}>{labels.cancel}</Button><SaveButton loading={saving} onClick={save} disabled={saving || !form || !/^[A-Z]{3}$/.test(form.code) || !form.serviceTypeId || !form.expenseTypeId || !form.taxTreatmentIds.length || !hasLocalizedName(form)}>{labels.save}</SaveButton></DialogActions>
    </Dialog>
  </AppPageContainer>;
}
