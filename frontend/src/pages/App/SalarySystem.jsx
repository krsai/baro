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
const RATE_BASES = {
  PER_MONTH: 'VND / 월', PER_WORKDAY: 'VND / 근무일', PER_WORK_HOUR: 'VND / 근무시간',
  PER_HOLIDAY_DAY: 'VND / 휴일근무일', PER_EVENT: 'VND / 건',
  PER_TENURE_YEAR: 'VND / 근속연수', BASE_SALARY_PERCENT: '기본급의 %', MANUAL: '직접 입력',
};
const PAY_CYCLES = {
  MONTHLY: '매월', QUARTERLY: '3개월마다', SEMIANNUAL: '6개월마다',
  ANNUAL: '매년', ONCE: '1회 지급',
};
const CONDITIONS = {
  NONE: '조건 없음', ACTUAL_WORKDAYS: '실제 근무일수만큼', FULL_ATTENDANCE: '만근 시',
  TENURE_OVER_12_MONTHS: '근속 12개월 초과', TARGET_100: '목표 100% 이상',
  TARGET_120: '목표 120% 이상', PROBATION_85: '수습기간 85%', CUSTOM: '사용자 정의',
};
const DEFAULT_DRAFT = { name: '', category: 'FIXED', rateBasis: 'PER_MONTH', payCycle: 'MONTHLY', condition: 'NONE', capValue: '' };
const item = (id, name, category, rateBasis, payCycle = 'MONTHLY', condition = 'NONE', extra = {}) =>
  ({ id, name, category, rateBasis, payCycle, condition, capValue: '', ...extra });
const DEFAULT_ITEMS = [
  item('baseSalary', '기본급', 'BASE', 'PER_MONTH', 'MONTHLY', 'ACTUAL_WORKDAYS', { required: true }),
  item('lunch', '점심수당', 'FIXED', 'PER_WORKDAY', 'MONTHLY', 'ACTUAL_WORKDAYS'),
  item('phone', '통신비', 'FIXED', 'PER_MONTH'),
  item('transport', '교통비', 'FIXED', 'PER_MONTH'),
  item('position', '직책수당', 'FIXED', 'PER_MONTH'),
  item('housing', '주거수당', 'FIXED', 'PER_MONTH'),
  item('language', '어학수당', 'VARIABLE', 'PER_MONTH'),
  item('holiday', '휴일근무수당', 'VARIABLE', 'PER_HOLIDAY_DAY', 'MONTHLY'),
  item('attendance', '만근수당', 'VARIABLE', 'PER_MONTH', 'MONTHLY', 'FULL_ATTENDANCE'),
  item('seniority', '근속수당', 'VARIABLE', 'PER_TENURE_YEAR', 'SEMIANNUAL', 'TENURE_OVER_12_MONTHS', { capValue: '5' }),
  item('overPlan', '생산 목표 초과 달성 수당', 'VARIABLE', 'PER_EVENT', 'MONTHLY', 'TARGET_100'),
];

const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const gradeName = (grade, language) => language === 'en' ? grade.nameEn : language === 'vi' ? grade.nameVi : grade.nameKo;
const calculationLabel = (row) => [RATE_BASES[row.rateBasis], PAY_CYCLES[row.payCycle], CONDITIONS[row.condition]].filter(Boolean).join(' · ');

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
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
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
          baseSalary: money(row.baseSalary), fixedTotal: money(row.fixedAllowance), variableTotal: money(row.variableAllowance),
        };
      });
      setRates(next);
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || '급여 기준을 불러오지 못했습니다.' });
    }
  }, [activeOrgId]);
  useEffect(() => { load(); }, [load]);

  const selected = items.find((row) => row.id === selectedId) || items[0];
  const counts = useMemo(() => items.reduce((map, row) => ({ ...map, [row.category]: (map[row.category] || 0) + 1 }), {}), [items]);
  const updateSelected = (field, value) => setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, [field]: value } : row));
  const getRate = (role, gradeId) => rates[`${role}:${gradeId}`]?.[selected.id] || '0';
  const changeRate = (role, gradeId, value) => {
    const key = `${role}:${gradeId}`;
    setRates((prev) => ({ ...prev, [key]: { ...prev[key], [selected.id]: money(value) } }));
  };
  const addItem = () => {
    if (!draft.name.trim()) return;
    const next = { ...draft, name: draft.name.trim(), id: `draft-${Date.now()}` };
    setItems((rows) => [...rows, next]);
    setSelectedId(next.id);
    setDialogOpen(false);
    setDraft(DEFAULT_DRAFT);
    setMessage({ severity: 'info', text: '화면 시안에 항목을 추가했습니다. 서버 저장은 백엔드 구현 후 연결됩니다.' });
  };
  const removeItem = () => {
    if (selected.required) return;
    setItems((rows) => rows.filter((row) => row.id !== selected.id));
    setSelectedId('baseSalary');
  };

  const calculationFields = (value, onChange) => <>
    <FormControl fullWidth size="small"><InputLabel>단가 기준</InputLabel><Select label="단가 기준" value={value.rateBasis} onChange={(e) => onChange('rateBasis', e.target.value)}>
      {Object.entries(RATE_BASES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </Select></FormControl>
    <FormControl fullWidth size="small"><InputLabel>정산 주기</InputLabel><Select label="정산 주기" value={value.payCycle} onChange={(e) => onChange('payCycle', e.target.value)}>
      {Object.entries(PAY_CYCLES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </Select></FormControl>
    <FormControl fullWidth size="small"><InputLabel>지급 조건</InputLabel><Select label="지급 조건" value={value.condition} onChange={(e) => onChange('condition', e.target.value)}>
      {Object.entries(CONDITIONS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </Select></FormControl>
    <TextField size="small" label="상한값 (선택)" value={value.capValue || ''} onChange={(e) => onChange('capValue', e.target.value)} placeholder="예: 최대 5년이면 5" />
  </>;

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
      <Box><Typography variant="h5" fontWeight={700}>급여 체계</Typography><Typography variant="body2" color="text.secondary">급여 항목, 복합 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}><TextField label="적용 시작월" type="month" size="small" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab(1)}>적용 이력</Button><Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>항목 추가</Button></Stack>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>UI 시안입니다. 단가 기준·정산 주기·지급 조건은 화면에서 조합할 수 있지만 아직 서버에는 저장되지 않습니다.</Alert>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    <Paper variant="outlined" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ px: 1 }}><Tab label="급여 항목 및 단가" /><Tab label="적용 이력" /></Tabs></Paper>

    {tab === 0 ? <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 350 }, flexShrink: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700}>급여 항목</Typography><Typography variant="caption" color="text.secondary">항목을 선택해 계산 방식과 직급별 단가를 설정하세요.</Typography></Box>
        {Object.entries(CATEGORIES).map(([category, label]) => <Box key={category} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1 }}><Chip size="small" color={CATEGORY_COLORS[category]} label={label} /><Typography variant="caption" color="text.secondary">{counts[category] || 0}개</Typography></Stack>
          <Stack spacing={0.5}>{items.filter((row) => row.category === category).map((row) => <Button key={row.id} variant={selectedId === row.id ? 'contained' : 'text'} color={selectedId === row.id ? 'primary' : 'inherit'} onClick={() => setSelectedId(row.id)} sx={{ display: 'block', textAlign: 'left', px: 1.5 }}>
            <Typography variant="body2" fontWeight={600}>{row.name}</Typography><Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>{RATE_BASES[row.rateBasis]} · {PAY_CYCLES[row.payCycle]}</Typography>
          </Button>)}</Stack>
        </Box>)}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Box><Typography variant="h6" fontWeight={700}>{selected.name}</Typography><Typography variant="body2" color="text.secondary">{calculationLabel(selected)}</Typography></Box>
          <Tooltip title={selected.required ? '기본급은 삭제할 수 없습니다.' : '항목 삭제'}><span style={{ marginLeft: 'auto' }}><IconButton color="error" disabled={selected.required} onClick={removeItem}><DeleteOutlineIcon /></IconButton></span></Tooltip></Stack>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700} sx={{ mb: 1.5 }}>계산 방식</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(180px, 1fr))', xl: 'repeat(4, minmax(160px, 1fr))' }, gap: 1.5 }}>{calculationFields(selected, updateSelected)}</Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}><Chip size="small" label={RATE_BASES[selected.rateBasis]} /><Chip size="small" label={`정산: ${PAY_CYCLES[selected.payCycle]}`} /><Chip size="small" label={`조건: ${CONDITIONS[selected.condition]}`} />{selected.capValue && <Chip size="small" label={`상한: ${selected.capValue}`} />}</Stack>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}><Typography fontWeight={700}>{effectiveMonth}부터 적용할 직급별 단가</Typography></Box>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>대상</TableCell><TableCell>직급</TableCell><TableCell align="right">단가</TableCell><TableCell>계산 기준</TableCell></TableRow></TableHead><TableBody>
          {ROLES.flatMap((role) => grades.map((grade, index) => <TableRow key={`${role}:${grade.id}`} hover>{index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2, fontWeight: 700 }}>{ROLE_LABELS[role]}<Typography variant="caption" display="block" color="text.secondary">{role}</Typography></TableCell>}<TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
            <TableCell align="right"><TextField size="small" value={getRate(role, grade.id)} onChange={(e) => changeRate(role, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 170 }} /></TableCell><TableCell>{RATE_BASES[selected.rateBasis]}</TableCell></TableRow>))}
        </TableBody></Table></TableContainer>
      </Paper>
    </Stack> : <Paper variant="outlined"><Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h6" fontWeight={700}>급여체계 적용 이력</Typography><Typography variant="body2" color="text.secondary">적용 시점별 급여 기준을 조회하고 새 버전의 기준으로 복사합니다.</Typography></Box>
      <TableContainer><Table size="small"><TableHead><TableRow><TableCell>버전</TableCell><TableCell>적용 기간</TableCell><TableCell>상태</TableCell><TableCell>급여 항목</TableCell><TableCell>비고</TableCell><TableCell align="right">작업</TableCell></TableRow></TableHead><TableBody>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>현재 기준</TableCell><TableCell>{effectiveMonth} ~</TableCell><TableCell><Chip size="small" color="success" label="적용 예정" /></TableCell><TableCell>{items.length}개</TableCell><TableCell>복합 계산 단위를 편집 중인 기준</TableCell><TableCell align="right"><Button size="small" onClick={() => setTab(0)}>편집</Button></TableCell></TableRow>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>기존 기준</TableCell><TableCell>최초 적용 ~ 현재</TableCell><TableCell><Chip size="small" variant="outlined" label="사용 중" /></TableCell><TableCell>기본급·고정수당·변동수당</TableCell><TableCell>현재 서버에 저장된 기존 기준</TableCell><TableCell align="right"><Button size="small" disabled>조회</Button></TableCell></TableRow>
      </TableBody></Table></TableContainer></Paper>}

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>급여 항목 추가</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField autoFocus label="항목명" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="예: 자격수당" />
      <FormControl fullWidth size="small"><InputLabel>급여 구분</InputLabel><Select label="급여 구분" value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></FormControl>
      {calculationFields(draft, (field, value) => setDraft((prev) => ({ ...prev, [field]: value })))}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>취소</Button><Button variant="contained" onClick={addItem} disabled={!draft.name.trim()}>추가</Button></DialogActions></Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
