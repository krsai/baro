import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FunctionsIcon from '@mui/icons-material/Functions';
import HistoryIcon from '@mui/icons-material/History';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { salaryText } from './salarySystemI18n';

const PAY_TYPES = {
  GENERAL: { label: '일반', color: 'primary' },
  OUTPUT: { label: '수당', color: 'warning' },
};
const PAY_TYPE_ORDER = ['GENERAL', 'OUTPUT'];
const CATEGORIES = { BASE: '기본급', ALLOWANCE: '급여 수당', INCENTIVE: '성과급' };
const CATEGORY_COLORS = { BASE: 'primary', ALLOWANCE: 'success', INCENTIVE: 'warning' };
const PAY_CYCLES = {
  MONTHLY: '1개월', QUARTERLY: '3개월', SEMIANNUAL: '6개월', ANNUAL: '12개월',
};
// 파라미터를 성격별로 묶어서 보여준다 (단가/근속 -> 근무일수 -> 근무시간 -> 조건·외부 계산값).
const FORMULA_PARAMETERS = {
  GRADE_RATE: { label: '직급별 단가', unit: 'VND' },
  TENURE_YEARS: { label: '근속연수', unit: '년' },
  ACTUAL_WORKDAYS: { label: '실제 근무일수', unit: '일' },
  SCHEDULED_WORKDAYS: { label: '기준 근무일수', unit: '일', hint: '해당 월의 근무요일에서 등록 공휴일을 제외하고 서버가 계산합니다.' },
  WORK_HOURS: { label: '정규 근무시간', unit: '시간' },
  OVERTIME_HOURS: { label: '연장근무시간', unit: '시간' },
  HOLIDAY_HOURS: { label: '휴일 특근시간', unit: '시간' },
  FULL_ATTENDANCE_FACTOR: { label: '만근 충족값', unit: '1 또는 0', hint: '만근을 채우면 1, 아니면 0으로 계산됩니다.' },
  PRODUCTION_ALLOWANCE: { label: '생산수당 계산 결과', unit: 'VND' },
};
const FORMULA_PARAMETER_GROUPS = [
  { label: '단가·근속', keys: ['GRADE_RATE', 'TENURE_YEARS'] },
  { label: '근무일수', keys: ['ACTUAL_WORKDAYS', 'SCHEDULED_WORKDAYS'] },
  { label: '근무시간', keys: ['WORK_HOURS', 'OVERTIME_HOURS', 'HOLIDAY_HOURS'] },
  { label: '조건·외부 계산값', keys: ['FULL_ATTENDANCE_FACTOR', 'PRODUCTION_ALLOWANCE'] },
];
const FORMULA_OPERATORS = ['+', '−', '×', '÷', '(', ')'];
const DEFAULT_FORMULA = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
// 일반(GENERAL) 급여 타입과 수당(OUTPUT) 급여 타입의 유일한 차이는 생산수당 유무이므로,
// 적용 대상 급여 타입은 항목별로 따로 선택하지 않고 급여 구분(카테고리)에서 자동으로 정해진다.
const defaultPayTypesForCategory = (category) => (category === 'INCENTIVE' ? ['OUTPUT'] : ['GENERAL', 'OUTPUT']);
const DEFAULT_DRAFT = { name: '', category: 'ALLOWANCE', formula: ['GRADE_RATE'], payCycle: 'MONTHLY', capValue: '' };
const item = (id, name, category, payCycle = 'MONTHLY', extra = {}) =>
  ({ id, name, category, payTypes: defaultPayTypesForCategory(category), formula: ['GRADE_RATE'], payCycle, capValue: '', ...extra });
const DEFAULT_ITEMS = [
  item('baseSalary', '기본급', 'BASE', 'MONTHLY', { required: true, formula: DEFAULT_FORMULA }),
  item('lunch', '점심수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS'] }),
  item('phone', '통신비', 'ALLOWANCE'),
  item('transport', '교통비', 'ALLOWANCE'),
  item('position', '직책수당', 'ALLOWANCE'),
  item('housing', '주거수당', 'ALLOWANCE'),
  item('language', '어학수당', 'ALLOWANCE'),
  item('holiday', '휴일근무수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'HOLIDAY_HOURS', '×', 'CONST:1.5'] }),
  item('attendance', '만근수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'FULL_ATTENDANCE_FACTOR'] }),
  item('seniority', '근속수당', 'ALLOWANCE', 'SEMIANNUAL', { formula: ['GRADE_RATE', '×', 'TENURE_YEARS'], capValue: '5' }),
  item('overPlan', '생산 목표 초과 달성 성과급', 'INCENTIVE', 'MONTHLY', { formula: ['PRODUCTION_ALLOWANCE'] }),
];

const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const gradeName = (grade, language) => language === 'en' ? grade.nameEn : language === 'vi' ? grade.nameVi : grade.nameKo;
const calculationLabel = (row, t) => t(PAY_CYCLES[row.payCycle]) || '';
const formulaTokenLabel = (token, t) => token.startsWith('CONST:')
  ? token.slice(6)
  : t(FORMULA_PARAMETERS[token]?.label || token);
const formulaLabel = (formula = [], t) => formula.map((token) => formulaTokenLabel(token, t)).join(' ');

// 계산식은 "파라미터/상수(피연산자) - 연산자 - 파라미터/상수 - 연산자 ..." 순서만 허용한다.
// 상수는 파라미터와 같은 피연산자 취급이라 서로 자리를 대신할 수 있다.
const isOperandToken = (token) => typeof token === 'string' && (token.startsWith('CONST:') || Boolean(FORMULA_PARAMETERS[token]));
const isOperatorSymbolToken = (token) => token === '+' || token === '−' || token === '×' || token === '÷';
const canAppendOperand = (formula) => {
  const last = formula[formula.length - 1];
  return formula.length === 0 || isOperatorSymbolToken(last) || last === '(';
};
const canAppendOperatorToken = (formula, token) => {
  if (token === '(') return canAppendOperand(formula);
  if (formula.length === 0) return false;
  const last = formula[formula.length - 1];
  return isOperandToken(last) || last === ')';
};
// 커서 위치(cursorIndex)에 토큰을 끼워 넣어도 좌우 모두 올바른 순서를 유지하는지 검사한다.
// 왼쪽은 "커서 앞부분 배열에 이 토큰을 이어붙일 수 있는가", 오른쪽은 "커서 뒤에 있던 토큰이
// 방금 끼운 토큰 다음에 와도 되는가"를 같은 canAppendOperand/canAppendOperatorToken으로 검사한다.
const canInsertTokenAt = (formula, cursorIndex, token) => {
  const left = formula.slice(0, cursorIndex);
  const right = formula[cursorIndex];
  const leftOk = (token === '(' || isOperandToken(token))
    ? canAppendOperand(left)
    : canAppendOperatorToken(left, token);
  if (!leftOk) return false;
  if (right === undefined) return true;
  const hypothetical = [...left, token];
  return (isOperandToken(right) || right === '(')
    ? canAppendOperand(hypothetical)
    : canAppendOperatorToken(hypothetical, right);
};
// 일반(GENERAL)/수당(OUTPUT) 항목의 급여는 결국 직급별 단가에서 출발하므로, 생산수당처럼
// 외부에서 이미 계산된 값을 그대로 지급하는 항목(INCENTIVE)이 아니면 계산식의 첫 토큰을
// 직급별 단가로 고정한다.
const ensureFormulaStartsWithGradeRate = (formula, category) => {
  const normalized = Array.isArray(formula) ? formula : [];
  if (category === 'INCENTIVE' || normalized[0] === 'GRADE_RATE') return normalized;
  return ['GRADE_RATE', ...normalized];
};

// 계산식 칩 사이사이에 놓이는 삽입 위치 표시. 클릭하면 그 자리가 커서가 되고, 다음 모듈/연산자
// 클릭은 항상 이 위치에 끼워진다. 현재 커서는 굵은 파란 막대로, 나머지는 옅은 클릭 영역으로 보인다.
const FormulaCursorSlot = ({ position, active, onSelect }) => (
  <Box
    onClick={() => onSelect(position)}
    sx={{
      width: active ? 3 : 10,
      height: 32,
      mx: 0.375,
      borderRadius: 1,
      flexShrink: 0,
      cursor: 'pointer',
      bgcolor: active ? 'primary.main' : 'transparent',
      transition: 'background-color .12s, width .12s',
      '&:hover': { bgcolor: active ? 'primary.main' : 'action.selected' },
    }}
  />
);

const SalarySystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const t = useCallback((text) => salaryText(text, languageCode), [languageCode]);
  const [grades, setGrades] = useState([]);
  const [rates, setRates] = useState({});
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [selectedId, setSelectedId] = useState('baseSalary');
  const [effectiveMonth, setEffectiveMonth] = useState(monthKey());
  const [dialogOpen, setDialogOpen] = useState(false);
  // 저장(=버전 확정)할 때마다 그 시점의 항목/단가 스냅샷이 쌓인다. 공정 버전 관리처럼
  // 버전 목록을 훑어보고, 하나를 고르면 그 시점 스냅샷을 읽기 전용으로 볼 수 있다.
  const [versions, setVersions] = useState([]);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [message, setMessage] = useState(null);
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState([]);
  // 새 토큰이 끼워질 위치. 항상 이 인덱스 앞에 삽입되고, 삽입 후에는 그 다음 자리로 한 칸 이동한다.
  const [cursorIndex, setCursorIndex] = useState(0);
  const [formulaSettingsDraft, setFormulaSettingsDraft] = useState(DEFAULT_DRAFT);
  const [constantDraft, setConstantDraft] = useState('');
  // 마지막으로 불러오거나(저장을 흉내낸) 저장한 시점의 스냅샷. 현재 상태와 다르면 미저장 변경으로 본다.
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [sets, salarySystem] = await Promise.all([
        requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`),
        requestJSON(`/salary-system${buildQueryString({ orgId: activeOrgId })}`),
      ]);
      setGrades((Array.isArray(sets) ? sets : []).flatMap((set) => set.grades || []).filter((grade) => grade.isActive));
      const loadedItems = Array.isArray(salarySystem?.items) && salarySystem.items.length ? salarySystem.items : DEFAULT_ITEMS;
      const next = {};
      (Array.isArray(salarySystem?.rates) ? salarySystem.rates : []).forEach((row) => {
        const key = `${row.payType}:${row.gradeId}`;
        next[key] = { ...next[key], [row.salaryItemCode]: money(row.amount) };
      });
      setItems(loadedItems);
      setVersions(Array.isArray(salarySystem?.versions) ? salarySystem.versions : []);
      setRates(next);
      setSavedSnapshot(JSON.stringify({ items: loadedItems, rates: next, effectiveMonth: monthKey() }));
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || t('급여 기준을 불러오지 못했습니다.') });
    }
  }, [activeOrgId, t]);
  useEffect(() => { load(); }, [load]);

  const isDirty = useMemo(
    () => savedSnapshot !== null && JSON.stringify({ items, rates, effectiveMonth }) !== savedSnapshot,
    [items, rates, effectiveMonth, savedSnapshot]
  );

  const selected = items.find((row) => row.id === selectedId) || items[0];
  const counts = useMemo(() => items.reduce((map, row) => ({ ...map, [row.category]: (map[row.category] || 0) + 1 }), {}), [items]);
  const updateSelected = (field, value) => setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, [field]: value } : row));
  const getRate = (payType, gradeId) => rates[`${payType}:${gradeId}`]?.[selected.id] || '0';
  const changeRate = (payType, gradeId, value) => {
    const key = `${payType}:${gradeId}`;
    setRates((prev) => ({ ...prev, [key]: { ...prev[key], [selected.id]: money(value) } }));
  };
  const addItem = () => {
    if (!draft.name.trim()) return;
    const next = { ...draft, name: draft.name.trim(), id: `draft-${Date.now()}`, payTypes: defaultPayTypesForCategory(draft.category) };
    setItems((rows) => [...rows, next]);
    setSelectedId(next.id);
    setDialogOpen(false);
    setDraft(DEFAULT_DRAFT);
    setMessage({ severity: 'info', text: t('화면 시안에 항목을 추가했습니다. 서버 저장은 백엔드 구현 후 연결됩니다.') });
  };
  const saveDraft = async () => {
    try {
      const rateRows = Object.entries(rates).flatMap(([key, itemRates]) => {
        const [payType, gradeId] = key.split(':');
        return Object.entries(itemRates || {}).map(([salaryItemCode, amount]) => ({ payType, gradeId: Number(gradeId), salaryItemCode, amount: Number(String(amount).replace(/,/g, '')) || 0 }));
      });
      await requestJSON(`/salary-system${buildQueryString({ orgId: activeOrgId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map((row) => ({ ...row, code: row.code || row.id })), rates: rateRows }) });
      await requestJSON(`/salary-system/versions${buildQueryString({ orgId: activeOrgId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ effectiveMonth }) });
      await load();
    setMessage({ severity: 'info', text: t('화면 시안 상태이며 서버 저장 기능은 아직 연결되지 않았습니다. 백엔드 구현 후 실제로 저장됩니다.') });
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || 'Failed to save salary system.' });
    }
  };
  const openVersionDialog = () => {
    setViewingVersion(null);
    setVersionDialogOpen(true);
  };
  const removeItem = () => {
    if (selected.required) return;
    setItems((rows) => rows.filter((row) => row.id !== selected.id));
    setSelectedId('baseSalary');
  };
  const openFormulaDialog = () => {
    const initialFormula = ensureFormulaStartsWithGradeRate(selected.formula, selected.category);
    setFormulaDraft(initialFormula);
    setCursorIndex(initialFormula.length);
    setFormulaSettingsDraft({ ...selected });
    setConstantDraft('');
    setFormulaDialogOpen(true);
  };
  const isFirstTokenLocked = selected.category !== 'INCENTIVE';
  const minCursorIndex = isFirstTokenLocked ? 1 : 0;
  const resetFormulaDraft = () => {
    const resetFormula = isFirstTokenLocked ? ['GRADE_RATE'] : [];
    setFormulaDraft(resetFormula);
    setCursorIndex(resetFormula.length);
  };
  const insertFormulaToken = (token) => {
    setFormulaDraft((tokens) => [...tokens.slice(0, cursorIndex), token, ...tokens.slice(cursorIndex)]);
    setCursorIndex((index) => index + 1);
  };
  const removeFormulaToken = (index) => {
    setFormulaDraft((tokens) => tokens.filter((_token, tokenIndex) => tokenIndex !== index));
    setCursorIndex((current) => {
      const next = index < current ? current - 1 : current;
      return Math.max(minCursorIndex, next);
    });
  };
  const appendFormulaConstant = () => {
    const normalized = String(constantDraft || '').trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) return;
    insertFormulaToken(`CONST:${normalized}`);
    setConstantDraft('');
  };
  const saveFormula = () => {
    setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, ...formulaSettingsDraft, formula: formulaDraft } : row));
    setFormulaDialogOpen(false);
  };

  const calculationFields = (value, onChange) => <>
    <FormControl fullWidth size="small"><InputLabel>{t('정산 주기')}</InputLabel><Select label={t('정산 주기')} value={value.payCycle} onChange={(e) => onChange('payCycle', e.target.value)}>
      {Object.entries(PAY_CYCLES).map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}
    </Select></FormControl>
    <TextField size="small" label={t('상한값 (선택)')} value={value.capValue || ''} onChange={(e) => onChange('capValue', e.target.value)} placeholder={t('계산 결과 최대 금액')} />
  </>;

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Stack direction="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" rowGap={1.5} sx={{ mb: 2, width: '100%' }}>
      <Typography variant="h5" fontWeight={700}>{t('급여 체계')}</Typography>
      <Stack direction="row" spacing={1}><TextField label={t('적용 시작월')} type="month" size="small" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={openVersionDialog}>{t('버전 관리')}</Button>
        <SaveButton onClick={saveDraft} disabled={!isDirty}>{t('저장')}</SaveButton></Stack>
    </Stack>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 350 }, flexShrink: 0 }}>
        <Stack direction="row" alignItems="flex-start" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box><Typography fontWeight={700}>{t('급여 항목')}</Typography><Typography variant="caption" color="text.secondary">{t('항목을 선택해 계산 방식과 직급별 단가를 설정하세요.')}</Typography></Box>
          <Tooltip title={t('항목 추가')}><IconButton size="small" color="primary" sx={{ ml: 'auto' }} onClick={() => setDialogOpen(true)}><AddIcon /></IconButton></Tooltip>
        </Stack>
        {Object.entries(CATEGORIES).map(([category, label]) => <Box key={category} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1 }}><Chip size="small" color={CATEGORY_COLORS[category]} label={t(label)} /><Typography variant="caption" color="text.secondary">{languageCode === 'ko' ? `${counts[category] || 0}${t('개')}` : `${counts[category] || 0} ${t('개')}`}</Typography></Stack>
          <Stack spacing={0.5}>{items.filter((row) => row.category === category).map((row) => <Button key={row.id} variant={selectedId === row.id ? 'contained' : 'text'} color={selectedId === row.id ? 'primary' : 'inherit'} onClick={() => setSelectedId(row.id)} sx={{ display: 'block', textAlign: 'left', px: 1.5 }}>
            <Typography variant="body2" fontWeight={600}>{t(row.name)}</Typography><Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>{(row.payTypes || []).map((payType) => t(PAY_TYPES[payType]?.label || payType)).join(' · ')} · {t(PAY_CYCLES[row.payCycle])}</Typography>
          </Button>)}</Stack>
        </Box>)}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Box><Typography variant="h6" fontWeight={700}>{t(selected.name)}</Typography><Typography variant="body2" color="text.secondary">{calculationLabel(selected, t)}</Typography></Box>
          <Tooltip title={t(selected.required ? '기본급은 삭제할 수 없습니다.' : '항목 삭제')}><span style={{ marginLeft: 'auto' }}><IconButton color="error" disabled={selected.required} onClick={removeItem}><DeleteOutlineIcon /></IconButton></span></Tooltip></Stack>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Typography variant="body2" fontWeight={700}>{t('지급 설정')}</Typography><Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">{(selected.payTypes || []).map((payType) => <Chip key={payType} size="small" color={PAY_TYPES[payType]?.color} label={t(PAY_TYPES[payType]?.label || payType)} />)}<Chip size="small" variant="outlined" label={t(PAY_CYCLES[selected.payCycle])} />{selected.capValue && <Chip size="small" variant="outlined" label={`${t('상한')} ${selected.capValue}`} />}</Stack></Stack>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2, bgcolor: 'action.hover', borderColor: 'divider' }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ flex: 1 }}><Typography variant="h6" fontWeight={700}>{t(selected.name)}</Typography><Typography variant="h6" color="primary.main" fontWeight={700}>=</Typography><Typography fontWeight={700}>{formulaLabel(selected.formula, t) || t('계산식이 비어 있습니다.')}</Typography></Stack><Button variant="outlined" startIcon={<FunctionsIcon />} onClick={openFormulaDialog}>{t('수정')}</Button></Stack></Paper>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}><Typography fontWeight={700}>{languageCode === 'ko' ? `${effectiveMonth}부터 적용할 급여 타입·직급별 단가` : languageCode === 'vi' ? `Đơn giá theo loại lương và cấp bậc áp dụng từ ${effectiveMonth}` : `Pay type and grade rates effective ${effectiveMonth}`}</Typography><Typography variant="body2" color="text.secondary">{t('권한이나 직무와 관계없이 직원에게 지정된 급여 타입과 직급으로 단가를 결정합니다.')}</Typography></Box>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t('급여 타입')}</TableCell><TableCell>{t('직급')}</TableCell><TableCell align="right">{t('단가')}</TableCell></TableRow></TableHead><TableBody>
          {PAY_TYPE_ORDER.filter((payType) => (selected.payTypes || []).includes(payType)).flatMap((payType) => grades.map((grade, index) => <TableRow key={`${payType}:${grade.id}`} hover>{index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2 }}><Chip size="small" color={PAY_TYPES[payType].color} label={t(PAY_TYPES[payType].label)} /><Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{payType}</Typography></TableCell>}<TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
            <TableCell align="right"><TextField size="small" value={getRate(payType, grade.id)} onChange={(e) => changeRate(payType, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 170 }} /></TableCell></TableRow>))}
        </TableBody></Table></TableContainer>
      </Paper>
    </Stack>

    <Dialog open={formulaDialogOpen} onClose={() => setFormulaDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('계산 방식 설정')} · {t(selected.name)}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Paper variant="outlined" sx={{ p: 2.5, minHeight: 96, bgcolor: 'action.hover', borderStyle: 'dashed' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <FunctionsIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle2" fontWeight={700}>{t('계산식')}</Typography>
          <Tooltip title={t('초기화')}><span style={{ marginLeft: 'auto' }}>
            <IconButton size="small" disabled={formulaDraft.length === (isFirstTokenLocked ? 1 : 0)} onClick={resetFormulaDraft}><RestartAltIcon fontSize="small" /></IconButton>
          </span></Tooltip>
        </Stack>
        <Stack direction="row" spacing={0} useFlexGap flexWrap="wrap" alignItems="center">
          {formulaDraft.length === 0
            ? <Typography color="text.secondary" variant="body2">{t('아래 모듈을 눌러 계산식을 만드세요.')}</Typography>
            : <>
              {minCursorIndex === 0 && <FormulaCursorSlot position={0} active={cursorIndex === 0} onSelect={setCursorIndex} />}
              {formulaDraft.map((token, index) => {
                const operand = isOperandToken(token);
                const removable = !(index === 0 && isFirstTokenLocked);
                return <React.Fragment key={`${token}-${index}`}>
                  <Chip
                    label={formulaTokenLabel(token, t)}
                    onDelete={removable ? () => removeFormulaToken(index) : undefined}
                    color={operand ? 'primary' : 'default'}
                    variant="outlined"
                    sx={{ fontWeight: operand ? 600 : 700 }}
                  />
                  <FormulaCursorSlot position={index + 1} active={cursorIndex === index + 1} onSelect={setCursorIndex} />
                </React.Fragment>;
              })}
            </>}
        </Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1.5 }}>{t('파라미터 모듈')}</Typography>
          <Stack spacing={1.5}>
            {FORMULA_PARAMETER_GROUPS.map((group) => <Box key={group.label}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t(group.label)}</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{group.keys.map((key) => <Tooltip key={key} title={t(FORMULA_PARAMETERS[key].hint || FORMULA_PARAMETERS[key].unit)}><span>
                <Button size="small" variant="outlined" disabled={!canInsertTokenAt(formulaDraft, cursorIndex, key)} onClick={() => insertFormulaToken(key)}>{t(FORMULA_PARAMETERS[key].label)} · {t(FORMULA_PARAMETERS[key].unit)}</Button>
              </span></Tooltip>)}</Stack>
            </Box>)}
          </Stack>
        </Paper>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>{t('연산자')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
              {FORMULA_OPERATORS.map((operator) => <Button key={operator} size="small" variant="outlined" disabled={!canInsertTokenAt(formulaDraft, cursorIndex, operator)} onClick={() => insertFormulaToken(operator)}>{operator}</Button>)}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('숫자 상수')}</Typography>
            <Stack spacing={1}>
              <TextField fullWidth size="small" value={constantDraft} onChange={(e) => setConstantDraft(e.target.value)} placeholder={t('예: 할증률 1.5')} inputProps={{ inputMode: 'decimal' }} />
              <Button fullWidth variant="outlined" disabled={!canInsertTokenAt(formulaDraft, cursorIndex, 'CONST:0') || !/^\d+(\.\d+)?$/.test(String(constantDraft || '').trim())} onClick={appendFormulaConstant}>{t('상수 추가')}</Button>
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>{calculationFields(formulaSettingsDraft, (field, value) => setFormulaSettingsDraft((prev) => ({ ...prev, [field]: value })))}</Stack>
          </Paper>
        </Stack>
      </Box>
    </Stack></DialogContent><DialogActions><Button variant="contained" onClick={saveFormula} disabled={formulaDraft.length === 0}>{t('계산식 적용')}</Button></DialogActions></Dialog>

    <Dialog open={versionDialogOpen} onClose={() => setVersionDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('급여 체계 버전 관리')}</DialogTitle><DialogContent>
      {versions.length === 0
        ? <Typography color="text.secondary">{t('아직 확정된 버전이 없습니다. 저장하면 새 버전으로 기록됩니다.')}</Typography>
        : <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ pt: 1 }}>
          <Stack spacing={1} sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}>
            {[...versions].reverse().map((version) => <Paper
              key={version.versionNumber}
              variant="outlined"
              onClick={() => setViewingVersion(version)}
              sx={{
                p: 1.25, cursor: 'pointer',
                borderColor: viewingVersion?.versionNumber === version.versionNumber ? 'primary.main' : 'divider',
                bgcolor: viewingVersion?.versionNumber === version.versionNumber ? 'action.selected' : 'transparent',
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip size="small" color="primary" label={`Ver.${version.versionNumber}`} />
                <Typography variant="caption" color="text.secondary">{version.confirmedAt}</Typography>
              </Stack>
              <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>{version.effectiveMonth} {t('부터 적용')}</Typography>
            </Paper>)}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {!viewingVersion
              ? <Typography color="text.secondary">{t('왼쪽에서 버전을 선택하면 그 시점의 급여 항목을 볼 수 있습니다.')}</Typography>
              : <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={700}>{`Ver.${viewingVersion.versionNumber}`} · {languageCode === 'ko' ? `${viewingVersion.items.length}${t('개')}` : `${viewingVersion.items.length} ${t('개')}`}</Typography>
                {viewingVersion.items.map((row) => <Paper key={row.id} variant="outlined" sx={{ p: 1.25 }}>
                  <Typography variant="body2" fontWeight={600}>{t(row.name)}</Typography>
                  <Typography variant="caption" color="text.secondary">{formulaLabel(row.formula, t) || t('계산식이 비어 있습니다.')}</Typography>
                </Paper>)}
              </Stack>}
          </Box>
        </Stack>}
    </DialogContent><DialogActions><Button onClick={() => setVersionDialogOpen(false)}>{t('닫기')}</Button></DialogActions></Dialog>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{t('급여 항목 추가')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField autoFocus label={t('항목명')} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('예: 자격수당')} />
      <FormControl fullWidth size="small"><InputLabel>{t('급여 구분')}</InputLabel><Select label={t('급여 구분')} value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}</Select></FormControl>
      {calculationFields(draft, (field, value) => setDraft((prev) => ({ ...prev, [field]: value })))}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>{t('취소')}</Button><Button variant="contained" onClick={addItem} disabled={!draft.name.trim()}>{t('추가')}</Button></DialogActions></Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
