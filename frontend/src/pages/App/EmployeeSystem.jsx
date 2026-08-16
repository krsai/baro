import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const buildGradeDraft = (grade) => ({
  nameKo: grade?.nameKo || grade?.name || '', nameEn: grade?.nameEn || grade?.name || '',
  nameVi: grade?.nameVi || grade?.name || '', sortOrder: String(grade?.sortOrder ?? ''),
});

const GradeRow = ({ grade, onSave, onDelete }) => {
  const [draft, setDraft] = useState(() => buildGradeDraft(grade));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(buildGradeDraft(grade)), [grade]);
  const original = buildGradeDraft(grade);
  const isDirty = Object.keys(original).some((key) => String(draft[key]).trim() !== String(original[key]).trim());
  const isValid = Boolean(draft.nameKo.trim() && draft.nameEn.trim() && draft.nameVi.trim()
    && Number.isSafeInteger(Number(draft.sortOrder)) && Number(draft.sortOrder) > 0);
  const change = (key) => (event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }));
  const save = async () => {
    if (!isDirty || !isValid || saving) return;
    setSaving(true);
    await onSave(grade, { ...draft, sortOrder: Number(draft.sortOrder) });
    setSaving(false);
  };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(150px, 1fr)) 90px 72px 44px', gap: 1, alignItems: 'center' }}>
      <TextField size="small" label="코드" value={grade.code} disabled />
      <TextField size="small" label="직급명 (한국어)" value={draft.nameKo} onChange={change('nameKo')} disabled={saving} />
      <TextField size="small" label="Grade name (English)" value={draft.nameEn} onChange={change('nameEn')} disabled={saving} />
      <TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={draft.nameVi} onChange={change('nameVi')} disabled={saving} />
      <TextField size="small" label="순서" type="number" value={draft.sortOrder} onChange={change('sortOrder')} disabled={saving} />
      <Button variant="contained" size="small" onClick={save} disabled={!isDirty || !isValid || saving}>{saving ? '저장 중' : '저장'}</Button>
      <IconButton color="error" disabled={grade.isDefault || saving} onClick={() => onDelete(grade)} aria-label={`${grade.nameKo || grade.name} 삭제`}><DeleteOutlineIcon /></IconButton>
    </Box>
  );
};

const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
  const [sets, setSets] = useState([]);
  const [message, setMessage] = useState(null);
  const [draft, setDraft] = useState({ setId: '', code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' });
  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try { setSets(await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`)); }
    catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 정보를 불러오지 못했습니다.' }); }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);
  const activeSet = useMemo(() => sets[0] || null, [sets]);
  useEffect(() => {
    if (activeSet && !draft.setId) setDraft((previous) => ({ ...previous, setId: String(activeSet.id) }));
  }, [activeSet, draft.setId]);

  const updateGrade = async (grade, patch) => {
    try {
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      await load();
      setMessage({ severity: 'success', text: '직급 표현을 저장했습니다.' });
      return true;
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || '직급 저장에 실패했습니다.' });
      return false;
    }
  };
  const addGrade = async () => {
    try {
      await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, setId: Number(draft.setId), sortOrder: Number(draft.sortOrder) }),
      });
      setDraft({ setId: String(activeSet?.id || ''), code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' });
      await load(); setMessage({ severity: 'success', text: '직급을 추가했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 추가에 실패했습니다.' }); }
  };
  const removeGrade = async (grade) => {
    try {
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: 'DELETE' });
      await load(); setMessage({ severity: 'success', text: '직급을 삭제했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 삭제에 실패했습니다.' }); }
  };

  return (
    <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>직원 체계</Typography>
      {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
      {sets.map((set) => <Paper key={set.id} variant="outlined" sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6">직급 세트: {set.name} ({set.code})</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>표현을 수정한 뒤 해당 행의 저장 버튼을 누르세요. 기본 직급은 삭제할 수 없습니다.</Typography>
        <Stack spacing={1.25}>{set.grades.map((grade) => <GradeRow key={grade.id} grade={grade} onSave={updateGrade} onDelete={removeGrade} />)}</Stack>
      </Paper>)}
      {activeSet && <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>직급 추가</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select size="small" label="직급 세트" value={draft.setId} onChange={(event) => setDraft({ ...draft, setId: event.target.value })} sx={{ minWidth: 150 }}>{sets.map((set) => <MenuItem key={set.id} value={String(set.id)}>{set.name}</MenuItem>)}</TextField>
          <TextField size="small" label="코드" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} />
          <TextField size="small" label="직급명 (한국어)" value={draft.nameKo} onChange={(event) => setDraft({ ...draft, nameKo: event.target.value })} />
          <TextField size="small" label="Grade name (English)" value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })} />
          <TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={draft.nameVi} onChange={(event) => setDraft({ ...draft, nameVi: event.target.value })} />
          <TextField size="small" label="순서" type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} sx={{ width: 110 }} />
          <Button variant="contained" onClick={addGrade} disabled={!draft.code.trim() || !draft.nameKo.trim() || !draft.nameEn.trim() || !draft.nameVi.trim() || !draft.sortOrder}>추가</Button>
        </Stack>
      </Paper>}
    </Box></AppPageContainer>
  );
};

export default EmployeeSystem;
