import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import FunctionsIcon from '@mui/icons-material/Functions';
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
  MONTHLY: '매월', QUARTERLY: '3개월마다', SEMIANNUAL: '6개월마다',
  ANNUAL: '매년', ONCE: '1회 지급',
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
// 일반(GENERAL)/수당(OUTPUT) 항목의 급여는 결국 직급별 단가에서 출발하므로, 생산수당처럼
// 외부에서 이미 계산된 값을 그대로 지급하는 항목(INCENTIVE)이 아니면 계산식의 첫 토큰을
// 직급별 단가로 고정한다.
const ensureFormulaStartsWithGradeRate = (formula, category) => {
  const normalized = Array.isArray(formula) ? formula : [];
  if (category === 'INCENTIVE' || normalized[0] === 'GRADE_RATE') return normalized;
  return ['GRADE_RATE', ...normalized];
};

const SalarySystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const t = useCallback((text) => salaryText(text, languageCode), [languageCode]);
  const [grades, setGrades] = useState([]);
  const [rates, setRates] = useState({});
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [selectedId, setSelectedId] = useState('baseSalary');
  const [effectiveMonth, setEffectiveMonth] = useState(monthKey());
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [message, setMessage] = useState(null);
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState([]);
  const [formulaSettingsDraft, setFormulaSettingsDraft] = useState(DEFAULT_DRAFT);
  const [constantDraft, setConstantDraft] = useState('');
  // 마지막으로 불러오거나(저장을 흉내낸) 저장한 시점의 스냅샷. 현재 상태와 다르면 미저장 변경으로 본다.
  const [savedSnapshot, setSavedSnapshot] = useState(null);

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
        const payType = row.orgRole === 'WORKER' ? 'OUTPUT' : 'GENERAL';
        const key = `${payType}:${row.gradeId}`;
        if (!next[key]) {
          next[key] = {
            baseSalary: money(row.baseSalary), allowanceTotal: money(row.allowance), incentiveTotal: money(row.incentive),
          };
        }
      });
      setRates(next);
      setSavedSnapshot(JSON.stringify({ items: DEFAULT_ITEMS, rates: next, effectiveMonth: monthKey() }));
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
  const saveDraft = () => {
    setSavedSnapshot(JSON.stringify({ items, rates, effectiveMonth }));
    setMessage({ severity: 'info', text: t('화면 시안 상태이며 서버 저장 기능은 아직 연결되지 않았습니다. 백엔드 구현 후 실제로 저장됩니다.') });
  };
  const removeItem = () => {
    if (selected.required) return;
    setItems((rows) => rows.filter((row) => row.id !== selected.id));
    setSelectedId('baseSalary');
  };
  const openFormulaDialog = () => {
    setFormulaDraft(ensureFormulaStartsWithGradeRate(selected.formula, selected.category));
    setFormulaSettingsDraft({ ...selected });
    setConstantDraft('');
    setFormulaDialogOpen(true);
  };
  const isFirstTokenLocked = selected.category !== 'INCENTIVE';
  const appendFormulaToken = (token) => setFormulaDraft((tokens) => [...tokens, token]);
  const removeFormulaToken = (index) => setFormulaDraft((tokens) => tokens.filter((_token, tokenIndex) => tokenIndex !== index));
  const appendFormulaConstant = () => {
    const normalized = String(constantDraft || '').trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) return;
    appendFormulaToken(`CONST:${normalized}`);
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
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
      <Box><Typography variant="h5" fontWeight={700}>{t('급여 체계')}</Typography><Typography variant="body2" color="text.secondary">{t('급여 항목, 복합 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.')}</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}><TextField label={t('적용 시작월')} type="month" size="small" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab(1)}>{t('적용 이력')}</Button><Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>{t('항목 추가')}</Button><SaveButton onClick={saveDraft} disabled={!isDirty}>{t('저장')}</SaveButton></Stack>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>{t('UI 시안입니다. 제한된 계산식 모듈과 월별 근무 캘린더 값은 아직 서버에 저장되지 않습니다.')}</Alert>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    <Paper variant="outlined" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ px: 1 }}><Tab label={t('급여 항목 및 단가')} /><Tab label={t('적용 이력')} /></Tabs></Paper>

    {tab === 0 ? <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 350 }, flexShrink: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700}>{t('급여 항목')}</Typography><Typography variant="caption" color="text.secondary">{t('항목을 선택해 계산 방식과 직급별 단가를 설정하세요.')}</Typography></Box>
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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Typography variant="body2" fontWeight={700}>{t('지급 설정')}</Typography><Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">{(selected.payTypes || []).map((payType) => <Chip key={payType} size="small" color={PAY_TYPES[payType]?.color} label={t(PAY_TYPES[payType]?.label || payType)} />)}<Chip size="small" variant="outlined" label={t(PAY_CYCLES[selected.payCycle])} />{selected.capValue && <Chip size="small" variant="outlined" label={`${t('상한')} ${selected.capValue}`} />}</Stack><Button size="small" color="inherit" onClick={openFormulaDialog} sx={{ ml: { md: 'auto' } }}>{t('설정')}</Button></Stack>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2, bgcolor: 'action.hover', borderColor: 'divider' }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ flex: 1 }}><Typography variant="h6" fontWeight={700}>{t(selected.name)}</Typography><Typography variant="h6" color="primary.main" fontWeight={700}>=</Typography><Typography fontWeight={700}>{formulaLabel(selected.formula, t) || t('계산식이 비어 있습니다.')}</Typography></Stack><Button variant="outlined" startIcon={<FunctionsIcon />} onClick={openFormulaDialog}>{t('수정')}</Button></Stack></Paper>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}><Typography fontWeight={700}>{languageCode === 'ko' ? `${effectiveMonth}부터 적용할 급여 타입·직급별 단가` : languageCode === 'vi' ? `Đơn giá theo loại lương và cấp bậc áp dụng từ ${effectiveMonth}` : `Pay type and grade rates effective ${effectiveMonth}`}</Typography><Typography variant="body2" color="text.secondary">{t('권한이나 직무와 관계없이 직원에게 지정된 급여 타입과 직급으로 단가를 결정합니다.')}</Typography></Box>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t('급여 타입')}</TableCell><TableCell>{t('직급')}</TableCell><TableCell align="right">{t('단가')}</TableCell></TableRow></TableHead><TableBody>
          {PAY_TYPE_ORDER.filter((payType) => (selected.payTypes || []).includes(payType)).flatMap((payType) => grades.map((grade, index) => <TableRow key={`${payType}:${grade.id}`} hover>{index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2 }}><Chip size="small" color={PAY_TYPES[payType].color} label={t(PAY_TYPES[payType].label)} /><Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{payType}</Typography></TableCell>}<TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
            <TableCell align="right"><TextField size="small" value={getRate(payType, grade.id)} onChange={(e) => changeRate(payType, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 170 }} /></TableCell></TableRow>))}
        </TableBody></Table></TableContainer>
      </Paper>
    </Stack> : <Paper variant="outlined"><Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h6" fontWeight={700}>{t('급여체계 적용 이력')}</Typography><Typography variant="body2" color="text.secondary">{t('적용 시점별 급여 기준을 조회하고 새 버전의 기준으로 복사합니다.')}</Typography></Box>
      <TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t('버전')}</TableCell><TableCell>{t('적용 기간')}</TableCell><TableCell>{t('상태')}</TableCell><TableCell>{t('급여 항목')}</TableCell><TableCell>{t('비고')}</TableCell><TableCell align="right">{t('작업')}</TableCell></TableRow></TableHead><TableBody>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>{t('현재 기준')}</TableCell><TableCell>{effectiveMonth} ~</TableCell><TableCell><Chip size="small" color="success" label={t('적용 예정')} /></TableCell><TableCell>{languageCode === 'ko' ? `${items.length}개` : `${items.length} ${t('개')}`}</TableCell><TableCell>{t('일반·수당 대상과 복합 계산 단위를 편집 중인 기준')}</TableCell><TableCell align="right"><Button size="small" onClick={() => setTab(0)}>{t('편집')}</Button></TableCell></TableRow>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>{t('기존 기준')}</TableCell><TableCell>{t('최초 적용 ~ 현재')}</TableCell><TableCell><Chip size="small" variant="outlined" label={t('사용 중')} /></TableCell><TableCell>{t('기본급·수당·성과급')}</TableCell><TableCell>{t('현재 서버에 저장된 기존 기준')}</TableCell><TableCell align="right"><Button size="small" disabled>{t('조회')}</Button></TableCell></TableRow>
      </TableBody></Table></TableContainer></Paper>}

    <Dialog open={formulaDialogOpen} onClose={() => setFormulaDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('계산 방식 설정')} · {t(selected.name)}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">{t('모든 지급 방식은 아래 모듈의 조합으로 만듭니다. 기준 근무일수는 선택 월의 근무요일에서 등록 공휴일을 제외해 서버가 계산합니다.')}</Alert>

      <Paper variant="outlined" sx={{ p: 2.5, minHeight: 96, bgcolor: 'action.hover', borderStyle: 'dashed' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <FunctionsIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle2" fontWeight={700}>{t('계산식')}</Typography>
          <Tooltip title={t('전체 지우기')}><span style={{ marginLeft: 'auto' }}>
            <IconButton size="small" disabled={formulaDraft.length === 0} onClick={() => setFormulaDraft(isFirstTokenLocked ? ['GRADE_RATE'] : [])}><ClearAllIcon fontSize="small" /></IconButton>
          </span></Tooltip>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
          {formulaDraft.length === 0
            ? <Typography color="text.secondary" variant="body2">{t('아래 모듈을 눌러 계산식을 만드세요.')}</Typography>
            : formulaDraft.map((token, index) => {
                const operand = isOperandToken(token);
                const removable = !(index === 0 && isFirstTokenLocked);
                return <Chip
                  key={`${token}-${index}`}
                  label={formulaTokenLabel(token, t)}
                  onDelete={removable ? () => removeFormulaToken(index) : undefined}
                  color={operand ? 'primary' : 'default'}
                  variant={operand ? 'filled' : 'outlined'}
                  sx={operand
                    ? { fontWeight: 600 }
                    : { fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper' }}
                />;
              })}
        </Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={700} sx={{ mb: 1.5 }}>{t('파라미터 모듈')}</Typography>
          <Stack spacing={1.5}>
            {FORMULA_PARAMETER_GROUPS.map((group) => <Box key={group.label}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t(group.label)}</Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{group.keys.map((key) => <Tooltip key={key} title={t(FORMULA_PARAMETERS[key].hint || FORMULA_PARAMETERS[key].unit)}><span>
                <Button size="small" variant="outlined" disabled={!canAppendOperand(formulaDraft)} onClick={() => appendFormulaToken(key)}>{t(FORMULA_PARAMETERS[key].label)} · {t(FORMULA_PARAMETERS[key].unit)}</Button>
              </span></Tooltip>)}</Stack>
            </Box>)}
          </Stack>
        </Paper>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>{t('연산자')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
              {FORMULA_OPERATORS.map((operator) => <Button key={operator} size="small" variant="outlined" disabled={!canAppendOperatorToken(formulaDraft, operator)} onClick={() => appendFormulaToken(operator)}>{operator}</Button>)}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('숫자 상수')}</Typography>
            <Stack spacing={1}>
              <TextField fullWidth size="small" value={constantDraft} onChange={(e) => setConstantDraft(e.target.value)} placeholder={t('예: 할증률 1.5')} inputProps={{ inputMode: 'decimal' }} />
              <Button fullWidth variant="outlined" disabled={!canAppendOperand(formulaDraft) || !/^\d+(\.\d+)?$/.test(String(constantDraft || '').trim())} onClick={appendFormulaConstant}>{t('상수 추가')}</Button>
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>{calculationFields(formulaSettingsDraft, (field, value) => setFormulaSettingsDraft((prev) => ({ ...prev, [field]: value })))}</Stack>
          </Paper>
        </Stack>
      </Box>
    </Stack></DialogContent><DialogActions><Button variant="contained" onClick={saveFormula} disabled={formulaDraft.length === 0}>{t('계산식 적용')}</Button></DialogActions></Dialog>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{t('급여 항목 추가')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField autoFocus label={t('항목명')} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('예: 자격수당')} />
      <FormControl fullWidth size="small"><InputLabel>{t('급여 구분')}</InputLabel><Select label={t('급여 구분')} value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}</Select></FormControl>
      {calculationFields(draft, (field, value) => setDraft((prev) => ({ ...prev, [field]: value })))}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>{t('취소')}</Button><Button variant="contained" onClick={addItem} disabled={!draft.name.trim()}>{t('추가')}</Button></DialogActions></Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
