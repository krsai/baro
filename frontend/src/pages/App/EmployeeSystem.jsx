import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getPayTypeLabel } from '../../constants/payType';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const toGradeDraft = (grade) => ({ id: grade.id, nameKo: grade.nameKo || grade.name || '', nameEn: grade.nameEn || grade.name || '', nameVi: grade.nameVi || grade.name || '', sortOrder: String(grade.sortOrder ?? '') });
const toPolicyDraft = (row) => ({ ...row, breakMinutes: String(row.breakMinutes), workdayMinimumHours: String(Number(row.workdayMinimumMinutes) / 60) });
const policyPayload = (rows) => rows.map((row) => ({ payType: row.payType, workWeekdays: [...row.workWeekdays].sort(), standardClockIn: row.standardClockIn, standardClockOut: row.standardClockOut, breakMinutes: Number(row.breakMinutes), workdayMinimumMinutes: Math.round(Number(row.workdayMinimumHours) * 60) }));
const timeMinutes = (value) => { const [h, m] = String(value || '').split(':').map(Number); return Number.isFinite(h + m) ? h * 60 + m : 0; };
const dailyMinutes = (row) => { let span = timeMinutes(row.standardClockOut) - timeMinutes(row.standardClockIn); if (span <= 0) span += 1440; return Math.max(0, span - Number(row.breakMinutes || 0)); };

const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const [tab, setTab] = useState(0);
  const [sets, setSets] = useState([]);
  const [grades, setGrades] = useState({});
  const [policies, setPolicies] = useState([]);
  const [savedPolicies, setSavedPolicies] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [newGrade, setNewGrade] = useState({ setId: '', code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' });

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [gradeRows, policyRows] = await Promise.all([
        requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`),
        requestJSON(`/employee-pay-type-policies${buildQueryString({ orgId: activeOrgId })}`),
      ]);
      const nextSets = Array.isArray(gradeRows) ? gradeRows : [];
      const nextPolicies = (Array.isArray(policyRows) ? policyRows : []).map(toPolicyDraft);
      setSets(nextSets);
      setGrades(Object.fromEntries(nextSets.flatMap((set) => set.grades.map((grade) => [grade.id, toGradeDraft(grade)]))));
      setPolicies(nextPolicies); setSavedPolicies(JSON.stringify(policyPayload(nextPolicies)));
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직원 체계 정보를 불러오지 못했습니다.' }); }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);
  const activeSet = sets[0];
  useEffect(() => { if (activeSet && !newGrade.setId) setNewGrade((value) => ({ ...value, setId: String(activeSet.id) })); }, [activeSet, newGrade.setId]);

  const allGrades = useMemo(() => sets.flatMap((set) => set.grades || []), [sets]);
  const gradesChanged = allGrades.some((grade) => JSON.stringify(grades[grade.id]) !== JSON.stringify(toGradeDraft(grade)));
  const gradesValid = allGrades.every((grade) => { const row = grades[grade.id]; return row?.nameKo.trim() && row?.nameEn.trim() && row?.nameVi.trim() && Number(row?.sortOrder) > 0; });
  const policiesChanged = JSON.stringify(policyPayload(policies)) !== savedPolicies;
  const policiesValid = policies.length === 3 && policies.every((row) => row.workWeekdays.length && dailyMinutes(row) > 0 && Number(row.workdayMinimumHours) > 0 && Number(row.workdayMinimumHours) * 60 <= dailyMinutes(row));
  const canSave = tab === 0 ? gradesChanged && gradesValid : policiesChanged && policiesValid;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (tab === 0) {
        for (const set of sets) await requestJSON(`/employee-grade-sets/${set.id}/grades${buildQueryString({ orgId: activeOrgId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grades: set.grades.map((grade) => ({ ...grades[grade.id], sortOrder: Number(grades[grade.id].sortOrder) })) }) });
      } else {
        await requestJSON(`/employee-pay-type-policies${buildQueryString({ orgId: activeOrgId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policies: policyPayload(policies) }) });
      }
      await load();
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES, WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId: activeOrgId, source: tab ? 'employee-pay-type-policy-save' : 'employee-grade-save' });
      setMessage({ severity: 'success', text: tab ? '급여 타입 설정을 저장했습니다. 급여 계산에 바로 반영됩니다.' : '직급 설정을 저장했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '저장하지 못했습니다.' }); } finally { setSaving(false); }
  };
  const editGrade = (id, key, value) => setGrades((rows) => ({ ...rows, [id]: { ...rows[id], [key]: value } }));
  const editPolicy = (type, key, value) => setPolicies((rows) => rows.map((row) => row.payType === type ? { ...row, [key]: value } : row));
  const toggleDay = (type, day) => setPolicies((rows) => rows.map((row) => row.payType !== type ? row : { ...row, workWeekdays: row.workWeekdays.includes(day) ? row.workWeekdays.filter((value) => value !== day) : [...row.workWeekdays, day].sort() }));
  const addGrade = async () => { try { await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newGrade, setId: Number(newGrade.setId), sortOrder: Number(newGrade.sortOrder) }) }); setNewGrade({ setId: String(activeSet?.id || ''), code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' }); await load(); } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급을 추가하지 못했습니다.' }); } };
  const removeGrade = async (grade) => { try { await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: 'DELETE' }); await load(); } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급을 삭제하지 못했습니다.' }); } };

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}><Typography variant="h5" fontWeight={700}>직원 체계</Typography><Button variant="contained" sx={{ ml: 'auto' }} disabled={!canSave || saving} onClick={save}>{saving ? '저장 중' : '저장'}</Button></Box>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}><Tab label="직급 체계" /><Tab label="급여 타입" /></Tabs>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    {tab === 0 && <>
      {sets.map((set) => <Paper key={set.id} variant="outlined" sx={{ p: 3, mb: 2 }}><Typography variant="h6" sx={{ mb: 2 }}>직급 세트: {set.name} ({set.code})</Typography><Stack spacing={1.25}>{set.grades.map((grade) => <Box key={grade.id} sx={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(150px, 1fr)) 90px 44px', gap: 1, alignItems: 'center' }}><TextField size="small" label="코드" value={grade.code} disabled /><TextField size="small" label="직급명 (한국어)" value={grades[grade.id]?.nameKo || ''} onChange={(e) => editGrade(grade.id, 'nameKo', e.target.value)} /><TextField size="small" label="Grade name (English)" value={grades[grade.id]?.nameEn || ''} onChange={(e) => editGrade(grade.id, 'nameEn', e.target.value)} /><TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={grades[grade.id]?.nameVi || ''} onChange={(e) => editGrade(grade.id, 'nameVi', e.target.value)} /><TextField size="small" label="순서" type="number" value={grades[grade.id]?.sortOrder || ''} onChange={(e) => editGrade(grade.id, 'sortOrder', e.target.value)} /><IconButton color="error" disabled={grade.isDefault || saving || gradesChanged} onClick={() => removeGrade(grade)}><DeleteOutlineIcon /></IconButton></Box>)}</Stack></Paper>)}
      {activeSet && <Paper variant="outlined" sx={{ p: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>직급 추가</Typography><Stack direction={{ xs: 'column', md: 'row' }} spacing={1}><TextField select size="small" label="직급 세트" value={newGrade.setId} onChange={(e) => setNewGrade({ ...newGrade, setId: e.target.value })}>{sets.map((set) => <MenuItem key={set.id} value={String(set.id)}>{set.name}</MenuItem>)}</TextField>{[['code', '코드'], ['nameKo', '직급명 (한국어)'], ['nameEn', 'Grade name (English)'], ['nameVi', 'Tên cấp bậc (Tiếng Việt)'], ['sortOrder', '순서']].map(([key, label]) => <TextField key={key} size="small" label={label} type={key === 'sortOrder' ? 'number' : 'text'} value={newGrade[key]} onChange={(e) => setNewGrade({ ...newGrade, [key]: key === 'code' ? e.target.value.toUpperCase() : e.target.value })} />)}<Button variant="outlined" onClick={addGrade}>추가</Button></Stack></Paper>}
    </>}
    {tab === 1 && <Stack spacing={2}>{policies.map((row) => <Paper key={row.payType} variant="outlined" sx={{ p: 3 }}><Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 2 }}><Typography variant="h6">{row.payType === 'GENERAL' ? '일반' : '생산'}</Typography><Typography variant="body2" color="text.secondary">{row.payType}</Typography></Stack><Typography variant="subtitle2">근무 요일</Typography><Stack direction="row" sx={{ mb: 2 }}>{WEEKDAYS.map((label, index) => <FormControlLabel key={label} control={<Checkbox checked={row.workWeekdays.includes(index + 1)} onChange={() => toggleDay(row.payType, index + 1)} />} label={label} />)}</Stack><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 220px)) minmax(180px, 1fr)', gap: 2 }}><TextField size="small" type="time" label="기준 출근 시간" value={row.standardClockIn} onChange={(e) => editPolicy(row.payType, 'standardClockIn', e.target.value)} InputLabelProps={{ shrink: true }} /><TextField size="small" type="time" label="기준 퇴근 시간" value={row.standardClockOut} onChange={(e) => editPolicy(row.payType, 'standardClockOut', e.target.value)} InputLabelProps={{ shrink: true }} /><TextField size="small" type="number" label="휴게시간 (분)" value={row.breakMinutes} onChange={(e) => editPolicy(row.payType, 'breakMinutes', e.target.value)} /><TextField size="small" type="number" label="근무일 인정 기준 (시간)" value={row.workdayMinimumHours} onChange={(e) => editPolicy(row.payType, 'workdayMinimumHours', e.target.value)} inputProps={{ min: .5, step: .5 }} /><Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderRadius: 1 }}><Typography variant="caption" color="text.secondary">1일 기준 근무시간</Typography><Typography fontWeight={700}>{(dailyMinutes(row) / 60).toFixed(dailyMinutes(row) % 60 ? 1 : 0)}시간</Typography></Box></Box><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>선택한 요일만 기준 근무일수와 필수 출퇴근 기록에 포함됩니다. 휴일 메뉴에 등록된 날짜는 근무 요일이어도 휴일로 처리합니다.</Typography></Paper>)}</Stack>}
  </Box></AppPageContainer>;
};
export default EmployeeSystem;
