import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const ROLES = ['ADMIN', 'OPERATOR', 'ACCOUNTANT', 'WORKER'];
const ROLE_LABELS = { ADMIN: '관리자', OPERATOR: '운영자', ACCOUNTANT: '회계사', WORKER: '생산직' };
const CATEGORIES = { BASE: '기본급', FIXED: '고정수당', VARIABLE: '변동수당' };
const CATEGORY_COLORS = { BASE: 'primary', FIXED: 'success', VARIABLE: 'warning' };
const UNITS = {
  MONTHLY: '월 정액', WORKDAY: '근무일', CONDITION: '조건 충족',
  YEARLY: '근속연수', PERCENT: '기본급 비율',
};
const DEFAULT_ITEMS = [
  ['baseSalary', '기본급', 'BASE', 'MONTHLY', true],
  ['lunch', '점심수당', 'FIXED', 'MONTHLY'],
  ['phone', '통신비', 'FIXED', 'MONTHLY'],
  ['transport', '교통비', 'FIXED', 'MONTHLY'],
  ['position', '직책수당', 'FIXED', 'MONTHLY'],
  ['housing', '주거수당', 'FIXED', 'MONTHLY'],
  ['language', '어학수당', 'VARIABLE', 'MONTHLY'],
  ['holiday', '휴일근무수당', 'VARIABLE', 'WORKDAY'],
  ['attendance', '만근수당', 'VARIABLE', 'CONDITION'],
  ['seniority', '근속수당', 'VARIABLE', 'YEARLY'],
  ['overPlan', '생산 목표 초과 달성 수당', 'VARIABLE', 'CONDITION'],
].map(([id, name, category, unit, required]) => ({ id, name, category, unit, required }));

const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const gradeName = (grade, language) => language === 'en' ? grade.nameEn : language === 'vi' ? grade.nameVi : grade.nameKo;

const SalarySystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const [grades, setGrades] = useState([]);
  const [rates, setRates] = useState({});
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [selectedId, setSelectedId] = useState('baseSalary');
  const [effectiveMonth, setEffectiveMonth] = useState(monthKey());
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', category: 'FIXED', unit: 'MONTHLY' });
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [sets, policies] = await Promise.all([
        requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`),
        requestJSON(`/employee-compensation-policies${buildQueryString({ orgId: activeOrgId })}`),
      ]);
      setGrades((Array.isArray(sets) ? sets : []).flatMap((set) => set.grades || []).filter((grade) => grade.isActive));
      const next = {};
      (Array.isArray(policies) ? policies : []).forEach((row) => {
        next[`${row.orgRole}:${row.gradeId}`] = {
          baseSalary: money(row.baseSalary), fixedTotal: money(row.fixedAllowance),
          variableTotal: money(row.variableAllowance),
        };
      });
      setRates(next);
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || '급여 기준을 불러오지 못했습니다.' });
    }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);

  const selected = items.find((item) => item.id === selectedId) || items[0];
  const counts = useMemo(() => items.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] || 0) + 1 }), {}), [items]);
  const getRate = (role, gradeId) => rates[`${role}:${gradeId}`]?.[selected.id] || '0';
  const changeRate = (role, gradeId, value) => {
    const key = `${role}:${gradeId}`;
    setRates((prev) => ({ ...prev, [key]: { ...prev[key], [selected.id]: money(value) } }));
  };
  const addItem = () => {
    if (!draft.name.trim()) return;
    const item = { ...draft, name: draft.name.trim(), id: `draft-${Date.now()}` };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    setDialogOpen(false);
    setDraft({ name: '', category: 'FIXED', unit: 'MONTHLY' });
    setMessage({ severity: 'info', text: '화면 시안에 항목을 추가했습니다. 서버 저장은 백엔드 구현 후 연결됩니다.' });
  };
  const removeItem = () => {
    if (selected.required) return;
    setItems((prev) => prev.filter((item) => item.id !== selected.id));
    setSelectedId('baseSalary');
  };

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
      <Box><Typography variant="h5" fontWeight={700}>급여 체계</Typography>
        <Typography variant="body2" color="text.secondary">급여 항목, 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.</Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
        <TextField label="적용 시작월" type="month" size="small" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab(1)}>적용 이력</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>항목 추가</Button>
      </Stack>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>UI 시안입니다. 현재 서버는 합계 3개만 저장하므로 새 항목과 적용 이력은 아직 서버에 저장되지 않습니다.</Alert>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    <Paper variant="outlined" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ px: 1 }}>
      <Tab label="급여 항목 및 단가" /><Tab label="적용 이력" />
    </Tabs></Paper>

    {tab === 0 ? <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 330 }, flexShrink: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700}>급여 항목</Typography>
          <Typography variant="caption" color="text.secondary">항목을 선택해 직급별 단가를 설정하세요.</Typography></Box>
        {Object.entries(CATEGORIES).map(([category, label]) => <Box key={category} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1 }}><Chip size="small" color={CATEGORY_COLORS[category]} label={label} />
            <Typography variant="caption" color="text.secondary">{counts[category] || 0}개</Typography></Stack>
          <Stack spacing={0.5}>{items.filter((item) => item.category === category).map((item) => <Button key={item.id}
            variant={selectedId === item.id ? 'contained' : 'text'} color={selectedId === item.id ? 'primary' : 'inherit'}
            onClick={() => setSelectedId(item.id)} sx={{ justifyContent: 'space-between', px: 1.5 }}>
            <span>{item.name}</span><Typography component="span" variant="caption" sx={{ opacity: 0.75 }}>{UNITS[item.unit]}</Typography>
          </Button>)}</Stack>
        </Box>)}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={700}>{selected.name}</Typography>
            <Chip size="small" variant="outlined" label={UNITS[selected.unit]} /></Stack>
            <Typography variant="body2" color="text.secondary">{effectiveMonth}부터 적용할 직급별 단가</Typography></Box>
          <Tooltip title={selected.required ? '기본급은 삭제할 수 없습니다.' : '항목 삭제'}><span style={{ marginLeft: 'auto' }}>
            <IconButton color="error" disabled={selected.required} onClick={removeItem}><DeleteOutlineIcon /></IconButton></span></Tooltip>
        </Stack>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>대상</TableCell><TableCell>직급</TableCell><TableCell align="right">단가 (VND)</TableCell><TableCell>적용 단위</TableCell></TableRow></TableHead>
          <TableBody>{ROLES.flatMap((role) => grades.map((grade, index) => <TableRow key={`${role}:${grade.id}`} hover>
            {index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2, fontWeight: 700 }}>{ROLE_LABELS[role]}<Typography variant="caption" display="block" color="text.secondary">{role}</Typography></TableCell>}
            <TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
            <TableCell align="right"><TextField size="small" value={getRate(role, grade.id)} onChange={(e) => changeRate(role, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 170 }} /></TableCell>
            <TableCell>{UNITS[selected.unit]}</TableCell>
          </TableRow>))}</TableBody></Table></TableContainer>
      </Paper>
    </Stack> : <Paper variant="outlined">
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h6" fontWeight={700}>급여체계 적용 이력</Typography>
        <Typography variant="body2" color="text.secondary">적용 시점별 기준을 조회하고 새 버전의 기준으로 복사합니다.</Typography></Box>
      <TableContainer><Table size="small"><TableHead><TableRow><TableCell>버전</TableCell><TableCell>적용 기간</TableCell><TableCell>상태</TableCell><TableCell>급여 항목</TableCell><TableCell>비고</TableCell><TableCell align="right">작업</TableCell></TableRow></TableHead>
        <TableBody><TableRow><TableCell sx={{ fontWeight: 700 }}>현재 기준</TableCell><TableCell>{effectiveMonth} ~</TableCell><TableCell><Chip size="small" color="success" label="적용 예정" /></TableCell><TableCell>{items.length}개</TableCell><TableCell>화면에서 편집 중인 급여 기준</TableCell><TableCell align="right"><Button size="small" onClick={() => setTab(0)}>편집</Button></TableCell></TableRow>
          <TableRow><TableCell sx={{ fontWeight: 700 }}>기존 기준</TableCell><TableCell>최초 적용 ~ 현재</TableCell><TableCell><Chip size="small" variant="outlined" label="사용 중" /></TableCell><TableCell>기본급·고정수당·변동수당</TableCell><TableCell>현재 서버에 저장된 기존 기준</TableCell><TableCell align="right"><Button size="small" disabled>조회</Button></TableCell></TableRow>
        </TableBody></Table></TableContainer>
    </Paper>}

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>급여 항목 추가</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus label="항목명" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="예: 자격수당" />
        <FormControl fullWidth><InputLabel>급여 구분</InputLabel><Select label="급여 구분" value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
        <FormControl fullWidth><InputLabel>계산 단위</InputLabel><Select label="계산 단위" value={draft.unit} onChange={(e) => setDraft((prev) => ({ ...prev, unit: e.target.value }))}>{Object.entries(UNITS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
      </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>취소</Button><Button variant="contained" onClick={addItem} disabled={!draft.name.trim()}>추가</Button></DialogActions>
    </Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
