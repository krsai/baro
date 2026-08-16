import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const gradeDraft = (grade) => ({
  id: grade.id, nameKo: grade.nameKo || grade.name || '', nameEn: grade.nameEn || grade.name || '',
  nameVi: grade.nameVi || grade.name || '', sortOrder: String(grade.sortOrder ?? ''),
});
const buildDraftMap = (sets) => Object.fromEntries(
  sets.flatMap((set) => (set.grades || []).map((grade) => [grade.id, gradeDraft(grade)]))
);

const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
  const [sets, setSets] = useState([]);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [message, setMessage] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [draft, setDraft] = useState({ setId: '', code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' });

  const load = useCallback(async () => {
    if (!activeOrgId) return [];
    try {
      const rows = await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`);
      const nextSets = Array.isArray(rows) ? rows : [];
      setSets(nextSets); setGradeDrafts(buildDraftMap(nextSets));
      return nextSets;
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || '직급 정보를 불러오지 못했습니다.' });
      return [];
    }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);

  const activeSet = useMemo(() => sets[0] || null, [sets]);
  useEffect(() => {
    if (activeSet && !draft.setId) setDraft((previous) => ({ ...previous, setId: String(activeSet.id) }));
  }, [activeSet, draft.setId]);
  const allGrades = useMemo(() => sets.flatMap((set) => set.grades || []), [sets]);
  const hasChanges = allGrades.some((grade) => {
    const current = gradeDrafts[grade.id] || gradeDraft(grade);
    const original = gradeDraft(grade);
    return ['nameKo', 'nameEn', 'nameVi', 'sortOrder'].some((key) => String(current[key]).trim() !== String(original[key]).trim());
  });
  const allValid = allGrades.every((grade) => {
    const value = gradeDrafts[grade.id] || gradeDraft(grade);
    return value.nameKo.trim() && value.nameEn.trim() && value.nameVi.trim()
      && Number.isSafeInteger(Number(value.sortOrder)) && Number(value.sortOrder) > 0;
  }) && sets.every((set) => {
    const orders = (set.grades || []).map((grade) => Number((gradeDrafts[grade.id] || gradeDraft(grade)).sortOrder));
    return new Set(orders).size === orders.length;
  });
  const changeGrade = (gradeId, key, value) => setGradeDrafts((previous) => ({
    ...previous, [gradeId]: { ...previous[gradeId], [key]: value },
  }));

  const saveAll = async () => {
    if (!hasChanges || !allValid || savingAll) return;
    setSavingAll(true);
    try {
      for (const set of sets) {
        await requestJSON(`/employee-grade-sets/${set.id}/grades${buildQueryString({ orgId: activeOrgId })}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grades: set.grades.map((grade) => ({
            ...gradeDrafts[grade.id], sortOrder: Number(gradeDrafts[grade.id].sortOrder),
          })) }),
        });
      }
      await load();
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES], orgId: activeOrgId, source: 'employee-grade-save' });
      setMessage({ severity: 'success', text: '전체 직급 표현을 저장했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '전체 직급 저장에 실패했습니다.' }); }
    finally { setSavingAll(false); }
  };
  const addGrade = async () => {
    try {
      await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, setId: Number(draft.setId), sortOrder: Number(draft.sortOrder) }),
      });
      setDraft({ setId: String(activeSet?.id || ''), code: '', nameKo: '', nameEn: '', nameVi: '', sortOrder: '' });
      await load();
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES], orgId: activeOrgId, source: 'employee-grade-create' });
      setMessage({ severity: 'success', text: '직급을 추가했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 추가에 실패했습니다.' }); }
  };
  const removeGrade = async (grade) => {
    try {
      const result = await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: 'DELETE' });
      await load();
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES], orgId: activeOrgId, source: 'employee-grade-delete' });
      const count = Number(result?.reassignedEmployeeCount) || 0;
      setMessage({ severity: 'success', text: count > 0 ? `직급을 삭제하고 직원 ${count}명을 기본 직급으로 전환했습니다.` : '직급을 삭제했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 삭제에 실패했습니다.' }); }
  };

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>직원 체계</Typography>
      <Button variant="contained" onClick={saveAll} disabled={!hasChanges || !allValid || savingAll} sx={{ ml: 'auto' }}>{savingAll ? '저장 중' : '전체 저장'}</Button>
    </Box>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    {sets.map((set) => <Paper key={set.id} variant="outlined" sx={{ p: 3, mb: 2 }}>
      <Typography variant="h6">직급 세트: {set.name} ({set.code})</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>모든 표현을 수정한 뒤 상단의 전체 저장 버튼을 누르세요. 직급 삭제 시 배정 직원은 기본 직급으로 전환됩니다.</Typography>
      <Stack spacing={1.25}>{set.grades.map((grade) => {
        const value = gradeDrafts[grade.id] || gradeDraft(grade);
        return <Box key={grade.id} sx={{ display: 'grid', gridTemplateColumns: '90px repeat(3, minmax(150px, 1fr)) 90px 44px', gap: 1, alignItems: 'center' }}>
          <TextField size="small" label="코드" value={grade.code} disabled />
          <TextField size="small" label="직급명 (한국어)" value={value.nameKo} onChange={(event) => changeGrade(grade.id, 'nameKo', event.target.value)} disabled={savingAll} />
          <TextField size="small" label="Grade name (English)" value={value.nameEn} onChange={(event) => changeGrade(grade.id, 'nameEn', event.target.value)} disabled={savingAll} />
          <TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={value.nameVi} onChange={(event) => changeGrade(grade.id, 'nameVi', event.target.value)} disabled={savingAll} />
          <TextField size="small" label="순서" type="number" value={value.sortOrder} onChange={(event) => changeGrade(grade.id, 'sortOrder', event.target.value)} disabled={savingAll} />
          <IconButton color="error" disabled={grade.isDefault || savingAll || hasChanges} onClick={() => removeGrade(grade)} aria-label={`${grade.nameKo || grade.name} 삭제`}><DeleteOutlineIcon /></IconButton>
        </Box>;
      })}</Stack>
    </Paper>)}
    {activeSet && <Paper variant="outlined" sx={{ p: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>직급 추가</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField select size="small" label="직급 세트" value={draft.setId} onChange={(event) => setDraft({ ...draft, setId: event.target.value })} sx={{ minWidth: 150 }}>{sets.map((set) => <MenuItem key={set.id} value={String(set.id)}>{set.name}</MenuItem>)}</TextField>
        <TextField size="small" label="코드" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} />
        <TextField size="small" label="직급명 (한국어)" value={draft.nameKo} onChange={(event) => setDraft({ ...draft, nameKo: event.target.value })} />
        <TextField size="small" label="Grade name (English)" value={draft.nameEn} onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })} />
        <TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={draft.nameVi} onChange={(event) => setDraft({ ...draft, nameVi: event.target.value })} />
        <TextField size="small" label="순서" type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })} sx={{ width: 110 }} />
        <Button variant="contained" onClick={addGrade} disabled={!draft.code.trim() || !draft.nameKo.trim() || !draft.nameEn.trim() || !draft.nameVi.trim() || !draft.sortOrder}>추가</Button>
      </Stack></Paper>}
  </Box></AppPageContainer>;
};

export default EmployeeSystem;
