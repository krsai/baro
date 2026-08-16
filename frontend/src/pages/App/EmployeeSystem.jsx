import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
  const [sets, setSets] = useState([]);
  const [message, setMessage] = useState(null);
  const [draft, setDraft] = useState({ setId: '', code: '', name: '', sortOrder: '' });

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      setSets(await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`));
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || '직급 정보를 불러오지 못했습니다.' });
    }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);

  const activeSet = useMemo(() => sets[0] || null, [sets]);
  useEffect(() => {
    if (activeSet && !draft.setId) setDraft((prev) => ({ ...prev, setId: String(activeSet.id) }));
  }, [activeSet, draft.setId]);

  const updateGrade = async (grade, patch) => {
    try {
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      await load();
      setMessage({ severity: 'success', text: '직급을 저장했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 저장에 실패했습니다.' }); }
  };
  const addGrade = async () => {
    try {
      await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, setId: Number(draft.setId), sortOrder: Number(draft.sortOrder) }),
      });
      setDraft({ setId: String(activeSet?.id || ''), code: '', name: '', sortOrder: '' });
      await load();
      setMessage({ severity: 'success', text: '직급을 추가했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 추가에 실패했습니다.' }); }
  };
  const removeGrade = async (grade) => {
    try {
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: 'DELETE' });
      await load();
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '직급 삭제에 실패했습니다.' }); }
  };

  return (
    <AppPageContainer>
      <Box sx={{ p: 2, width: '100%' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>직원 체계</Typography>
        {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
        {sets.map((set) => (
          <Paper key={set.id} variant="outlined" sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6">직급 세트: {set.name} ({set.code})</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>코드 순서대로 직원 직급을 관리합니다. 기본 직급은 삭제할 수 없습니다.</Typography>
            <Stack spacing={1.25}>
              {set.grades.map((grade) => (
                <Box key={grade.id} sx={{ display: 'grid', gridTemplateColumns: '100px minmax(180px, 1fr) 100px 44px', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" label="코드" value={grade.code} disabled />
                  <TextField size="small" label="직급명" defaultValue={grade.name} onBlur={(e) => e.target.value.trim() !== grade.name && updateGrade(grade, { name: e.target.value })} />
                  <TextField size="small" label="순서" type="number" defaultValue={grade.sortOrder} onBlur={(e) => Number(e.target.value) !== grade.sortOrder && updateGrade(grade, { sortOrder: Number(e.target.value) })} />
                  <IconButton color="error" disabled={grade.isDefault} onClick={() => removeGrade(grade)} aria-label={`${grade.name} 삭제`}><DeleteOutlineIcon /></IconButton>
                </Box>
              ))}
            </Stack>
          </Paper>
        ))}
        {activeSet && (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>직급 추가</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField select size="small" label="직급 세트" value={draft.setId} onChange={(e) => setDraft({ ...draft, setId: e.target.value })} sx={{ minWidth: 150 }}>{sets.map((set) => <MenuItem key={set.id} value={String(set.id)}>{set.name}</MenuItem>)}</TextField>
              <TextField size="small" label="코드" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
              <TextField size="small" label="직급명" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <TextField size="small" label="순서" type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} sx={{ width: 110 }} />
              <Button variant="contained" onClick={addGrade} disabled={!draft.code.trim() || !draft.name.trim() || !draft.sortOrder}>추가</Button>
            </Stack>
          </Paper>
        )}
      </Box>
    </AppPageContainer>
  );
};

export default EmployeeSystem;
