import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const ROLES = ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'WORKER'];
const ROLE_LABELS = { ADMIN: '관리자', OPERATOR: '운영자', ACCOUNTANT: '회계사', WORKER: '작업자' };
const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const number = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
const gradeName = (grade, languageCode) => languageCode === 'en' ? grade.nameEn : languageCode === 'vi' ? grade.nameVi : grade.nameKo;

const SalarySystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const [grades, setGrades] = useState([]);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [gradeSets, policies] = await Promise.all([
        requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`),
        requestJSON(`/employee-compensation-policies${buildQueryString({ orgId: activeOrgId })}`),
      ]);
      const nextGrades = (Array.isArray(gradeSets) ? gradeSets : []).flatMap((set) => set.grades || []).filter((grade) => grade.isActive);
      const policyMap = new Map((Array.isArray(policies) ? policies : []).map((row) => [`${row.orgRole}:${row.gradeId}`, row]));
      const next = {};
      ROLES.forEach((orgRole) => nextGrades.forEach((grade) => {
        const key = `${orgRole}:${grade.id}`; const row = policyMap.get(key) || {};
        next[key] = { orgRole, gradeId: grade.id, baseSalary: money(row.baseSalary), fixedAllowance: money(row.fixedAllowance), variableAllowance: money(row.variableAllowance) };
      }));
      setGrades(nextGrades); setValues(next); setOriginal(next);
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '급여 기준을 불러오지 못했습니다.' }); }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(original), [original, values]);
  const change = (key, field, value) => setValues((prev) => ({ ...prev, [key]: { ...prev[key], [field]: money(value) } }));
  const save = async () => {
    setSaving(true);
    try {
      await requestJSON(`/employee-compensation-policies${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policies: Object.values(values).map((row) => ({ ...row, baseSalary: number(row.baseSalary), fixedAllowance: number(row.fixedAllowance), variableAllowance: number(row.variableAllowance) })) }),
      });
      setOriginal(values); setMessage({ severity: 'success', text: '급여 기준표를 저장했습니다.' });
    } catch (error) { setMessage({ severity: 'error', text: error?.message || '급여 기준 저장에 실패했습니다.' }); }
    finally { setSaving(false); }
  };
  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}><Box>
      <Typography variant="h5" fontWeight={700}>급여 체계</Typography>
      <Typography variant="body2" color="text.secondary">권한과 직급 조합별 공통 급여 기준을 관리합니다. 실제 직원 급여 계산에는 아직 반영하지 않습니다.</Typography>
    </Box><Button variant="contained" onClick={save} disabled={!dirty || saving} sx={{ ml: 'auto' }}>{saving ? '저장 중' : '전체 저장'}</Button></Box>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>
      <TableCell>권한</TableCell><TableCell>직급</TableCell><TableCell align="right">기본급</TableCell><TableCell align="right">고정수당</TableCell><TableCell align="right">변동수당</TableCell><TableCell align="right">고정 보상 합계</TableCell><TableCell>생산수당</TableCell>
    </TableRow></TableHead><TableBody>{ROLES.flatMap((orgRole) => grades.map((grade, gradeIndex) => {
      const key = `${orgRole}:${grade.id}`; const row = values[key]; if (!row) return null;
      const total = number(row.baseSalary) + number(row.fixedAllowance) + number(row.variableAllowance);
      return <TableRow key={key}>{gradeIndex === 0 && <TableCell rowSpan={grades.length} sx={{ fontWeight: 700, verticalAlign: 'top' }}>{ROLE_LABELS[orgRole]}<Typography variant="caption" display="block" color="text.secondary">{orgRole}</Typography></TableCell>}
        <TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
        {['baseSalary', 'fixedAllowance', 'variableAllowance'].map((field) => <TableCell key={field} align="right"><TextField size="small" value={row[field]} onChange={(event) => change(key, field, event.target.value)} disabled={saving} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 150 }} /></TableCell>)}
        <TableCell align="right" sx={{ fontWeight: 700 }}>{total.toLocaleString('en-US')}</TableCell><TableCell color="text.secondary">실적 기준 별도 계산</TableCell>
      </TableRow>;
    }))}</TableBody></Table></TableContainer></Paper>
  </Box></AppPageContainer>;
};
export default SalarySystem;
