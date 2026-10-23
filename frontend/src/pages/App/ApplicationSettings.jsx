import ExpenseCodeLinkSettings from '../../components/ExpenseCodeLinkSettings';
import { useNavigate } from 'react-router-dom';
import { SETTING_SCOPE_TEXT } from '../../components/SettingInheritanceControls';
import React, { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../utils/apiClient';

export default function ApplicationSettings({ systemDefaults = false }) {
  const { activeOrgId } = useAuth(), { languageCode } = useLanguage();
  const labels = { ko: { title: '앱 설정', accounting: '거래 비용', vat: '기본 VAT (%)', save: '저장', saved: '설정을 저장했습니다.', error: '설정을 불러오거나 저장하지 못했습니다.', help: 'VAT 적용 코드를 선택할 때 새 신청에 사용하는 기본값입니다. 기존 신청의 VAT는 변경하지 않습니다.' }, en: { title: 'App settings', accounting: 'Transaction costs', vat: 'Default VAT (%)', save: 'Save', saved: 'Settings saved.', error: 'Could not load or save settings.', help: 'Default for new requests using VAT-enabled codes. Existing requests keep their saved VAT.' }, vi: { title: 'Cài đặt ứng dụng', accounting: 'Chi phí giao dịch', vat: 'VAT mặc định (%)', save: 'Lưu', saved: 'Đã lưu cài đặt.', error: 'Không thể tải hoặc lưu cài đặt.', help: 'Áp dụng cho đề nghị mới sử dụng mã có VAT. VAT đã lưu của đề nghị cũ không thay đổi.' } }[languageCode] || {};
  const navigate = useNavigate();
  const scopeLabels = SETTING_SCOPE_TEXT[languageCode] || SETTING_SCOPE_TEXT.ko;
  const path = systemDefaults ? '/system-app-settings' : '/app-settings';
  const [settings,setSettings] = useState({});
  const [rate, setRate] = useState('10'), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { let alive = true; setLoading(true); requestJSON(`${path}${buildQueryString({ orgId: activeOrgId })}`, { skipCache: true }).then(data => { if (alive) { setSettings(data); setRate(String(data.defaultVatRate)); } }).catch(() => alive && setError(labels.error)).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [activeOrgId, labels.error, path]);
  const save = async (reset = false) => { setSaving(true); setError(''); setMessage(''); try { const data = await requestJSON(`${path}${buildQueryString({ orgId: activeOrgId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : { defaultVatRate: rate }) }); setSettings(data); setRate(String(data.defaultVatRate)); setMessage(labels.saved); } catch { setError(labels.error); } finally { setSaving(false); } };
  return <AppPageContainer title={systemDefaults ? scopeLabels.systemTitle : scopeLabels.localTitle} titleActions={<Button onClick={() => navigate(systemDefaults ? '/system-setting/transaction-codes' : '/app-settings/transaction-codes')}>{scopeLabels.codes}</Button>}><Paper variant="outlined" sx={{ p: 'var(--ui-panel-padding, 16px)', maxWidth: 700 }}><Stack spacing={2}><Typography variant="h6">{labels.accounting}</Typography><Alert severity="info">{systemDefaults ? scopeLabels.defaults : `${settings.isOverridden ? scopeLabels.custom : scopeLabels.inherited} · ${scopeLabels.defaults}: ${settings.systemDefaultVatRate ?? '10'}%`}</Alert>{error && <Alert severity="error">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}<TextField label={labels.vat} disabled={loading || saving} value={rate} onChange={event => setRate(event.target.value)} helperText={labels.help} /><Button variant="contained" onClick={() => save(false)} disabled={loading || saving || !/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100}>{labels.save}</Button>{!systemDefaults && <Button disabled={loading || saving || !settings.isOverridden} onClick={() => save(true)}>{scopeLabels.reset}</Button>}</Stack></Paper>{!systemDefaults && <ExpenseCodeLinkSettings />}</AppPageContainer>;
}
