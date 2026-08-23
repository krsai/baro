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
import FunctionsIcon from '@mui/icons-material/Functions';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';

const PAY_TYPES = {
  GENERAL: { label: '일반', color: 'primary' },
  OUTPUT: { label: '수당', color: 'warning' },
};
const PAY_TYPE_ORDER = ['GENERAL', 'OUTPUT'];
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
const CALC_TYPES = {
  FORMULA: '계산식 조합', FLAT: '직급별 정액', CONDITIONAL: '조건부 정액', EXTERNAL: '외부 연동',
};
const FORMULA_PARAMETERS = {
  GRADE_RATE: { label: '직급별 단가', unit: 'VND' },
  ACTUAL_WORKDAYS: { label: '실제 근무일수', unit: '일' },
  SCHEDULED_WORKDAYS: { label: '기준 근무일수', unit: '일', hint: '해당 월의 근무요일에서 등록 공휴일을 제외' },
  WORK_HOURS: { label: '근무시간', unit: '시간' },
  OVERTIME_HOURS: { label: '연장근무시간', unit: '시간' },
  HOLIDAY_HOURS: { label: '특근시간', unit: '시간' },
  TENURE_YEARS: { label: '근속연수', unit: '년' },
  PRODUCTION_ALLOWANCE: { label: '생산수당 계산 결과', unit: 'VND' },
};
const FORMULA_OPERATORS = ['+', '−', '×', '÷', '(', ')', 'MIN', 'MAX'];
const DEFAULT_FORMULA = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
const DEFAULT_DRAFT = { name: '', category: 'FIXED', payTypes: ['GENERAL', 'OUTPUT'], calcType: 'FORMULA', formula: ['GRADE_RATE'], rateBasis: 'PER_MONTH', payCycle: 'MONTHLY', condition: 'NONE', capValue: '' };
const item = (id, name, category, rateBasis, payCycle = 'MONTHLY', condition = 'NONE', extra = {}) =>
  ({ id, name, category, payTypes: ['GENERAL', 'OUTPUT'], calcType: 'FORMULA', formula: ['GRADE_RATE'], rateBasis, payCycle, condition, capValue: '', ...extra });
const DEFAULT_ITEMS = [
  item('baseSalary', '기본급', 'BASE', 'PER_MONTH', 'MONTHLY', 'ACTUAL_WORKDAYS', { required: true, formula: DEFAULT_FORMULA }),
  item('lunch', '점심수당', 'FIXED', 'PER_WORKDAY', 'MONTHLY', 'ACTUAL_WORKDAYS', { formula: ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS'] }),
  item('phone', '통신비', 'FIXED', 'PER_MONTH', 'MONTHLY', 'NONE', { calcType: 'FLAT' }),
  item('transport', '교통비', 'FIXED', 'PER_MONTH', 'MONTHLY', 'NONE', { calcType: 'FLAT' }),
  item('position', '직책수당', 'FIXED', 'PER_MONTH', 'MONTHLY', 'NONE', { calcType: 'FLAT' }),
  item('housing', '주거수당', 'FIXED', 'PER_MONTH', 'MONTHLY', 'NONE', { calcType: 'FLAT' }),
  item('language', '어학수당', 'VARIABLE', 'PER_MONTH', 'MONTHLY', 'NONE', { calcType: 'FLAT' }),
  item('holiday', '휴일근무수당', 'VARIABLE', 'PER_HOLIDAY_DAY', 'MONTHLY', 'NONE', { formula: ['GRADE_RATE', '×', 'HOLIDAY_HOURS', '×', 'CONST:1.5'] }),
  item('attendance', '만근수당', 'VARIABLE', 'PER_MONTH', 'MONTHLY', 'FULL_ATTENDANCE', { calcType: 'CONDITIONAL' }),
  item('seniority', '근속수당', 'VARIABLE', 'PER_TENURE_YEAR', 'SEMIANNUAL', 'TENURE_OVER_12_MONTHS', { formula: ['GRADE_RATE', '×', 'TENURE_YEARS'], capValue: '5' }),
  item('overPlan', '생산 목표 초과 달성 수당', 'VARIABLE', 'PER_EVENT', 'MONTHLY', 'TARGET_100', { payTypes: ['OUTPUT'], calcType: 'EXTERNAL', formula: ['PRODUCTION_ALLOWANCE'] }),
];

const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const gradeName = (grade, language) => language === 'en' ? grade.nameEn : language === 'vi' ? grade.nameVi : grade.nameKo;
const calculationLabel = (row) => [CALC_TYPES[row.calcType], PAY_CYCLES[row.payCycle], row.calcType === 'CONDITIONAL' ? CONDITIONS[row.condition] : null].filter(Boolean).join(' · ');
const formulaTokenLabel = (token) => token.startsWith('CONST:')
  ? token.slice(6)
  : FORMULA_PARAMETERS[token]?.label || token;
const formulaLabel = (formula = []) => formula.map(formulaTokenLabel).join(' ');

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
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState([]);
  const [formulaCalcType, setFormulaCalcType] = useState('FORMULA');
  const [formulaCondition, setFormulaCondition] = useState('NONE');
  const [constantDraft, setConstantDraft] = useState('');

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
            baseSalary: money(row.baseSalary), fixedTotal: money(row.fixedAllowance), variableTotal: money(row.variableAllowance),
          };
        }
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
  const getRate = (payType, gradeId) => rates[`${payType}:${gradeId}`]?.[selected.id] || '0';
  const changeRate = (payType, gradeId, value) => {
    const key = `${payType}:${gradeId}`;
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
  const openFormulaDialog = () => {
    setFormulaDraft([...(selected.formula || [])]);
    setFormulaCalcType(selected.calcType || 'FORMULA');
    setFormulaCondition(selected.condition || 'NONE');
    setConstantDraft('');
    setFormulaDialogOpen(true);
  };
  const appendFormulaToken = (token) => setFormulaDraft((tokens) => [...tokens, token]);
  const removeFormulaToken = (index) => setFormulaDraft((tokens) => tokens.filter((_token, tokenIndex) => tokenIndex !== index));
  const appendFormulaConstant = () => {
    const normalized = String(constantDraft || '').trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) return;
    appendFormulaToken(`CONST:${normalized}`);
    setConstantDraft('');
  };
  const saveFormula = () => {
    setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, calcType: formulaCalcType, condition: formulaCondition, formula: formulaDraft } : row));
    setFormulaDialogOpen(false);
  };

  const calculationFields = (value, onChange) => <>
    <FormControl fullWidth size="small"><InputLabel>적용 급여 타입</InputLabel><Select multiple label="적용 급여 타입" value={value.payTypes || []} onChange={(e) => onChange('payTypes', e.target.value)} renderValue={(selectedValues) => selectedValues.map((key) => PAY_TYPES[key]?.label || key).join(', ')}>
      {Object.entries(PAY_TYPES).map(([key, config]) => <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
    </Select></FormControl>
    <FormControl fullWidth size="small"><InputLabel>정산 주기</InputLabel><Select label="정산 주기" value={value.payCycle} onChange={(e) => onChange('payCycle', e.target.value)}>
      {Object.entries(PAY_CYCLES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </Select></FormControl>
    {value.calcType !== 'EXTERNAL' && <FormControl fullWidth size="small"><InputLabel>단가 기준</InputLabel><Select label="단가 기준" value={value.rateBasis} onChange={(e) => onChange('rateBasis', e.target.value)}>
      {Object.entries(RATE_BASES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
    </Select></FormControl>}
    {value.calcType !== 'EXTERNAL' && <TextField size="small" label="상한값 (선택)" value={value.capValue || ''} onChange={(e) => onChange('capValue', e.target.value)} placeholder="계산 결과 최대 금액" />}
  </>;

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
      <Box><Typography variant="h5" fontWeight={700}>급여 체계</Typography><Typography variant="body2" color="text.secondary">급여 항목, 복합 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}><TextField label="적용 시작월" type="month" size="small" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab(1)}>적용 이력</Button><Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>항목 추가</Button></Stack>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>UI 시안입니다. 계산 방식 종류에 따라 필요한 설정만 표시하며, 계산식 모듈과 월별 근무 캘린더 값은 아직 서버에 저장되지 않습니다.</Alert>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderTop: 3, borderTopColor: 'primary.main' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><Chip size="small" color="primary" label="일반" /><Typography variant="caption" color="text.secondary">GENERAL</Typography></Stack>
        <Typography fontWeight={700}>기본급 + 고정수당 + 변동수당</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>관리자, 운영자, 회계사와 생산 감독에게 적용합니다.</Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderTop: 3, borderTopColor: 'warning.main' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}><Chip size="small" color="warning" label="수당" /><Typography variant="caption" color="text.secondary">OUTPUT</Typography></Stack>
        <Typography fontWeight={700}>기본급 + 고정수당 + 변동수당 + 생산수당</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>감독을 제외한 생산 작업자에게 적용하며, 생산수당은 작업 실적 시스템에서 별도로 계산합니다.</Typography>
      </Paper>
    </Box>
    <Paper variant="outlined" sx={{ mb: 2 }}><Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ px: 1 }}><Tab label="급여 항목 및 단가" /><Tab label="적용 이력" /></Tabs></Paper>

    {tab === 0 ? <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 350 }, flexShrink: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700}>급여 항목</Typography><Typography variant="caption" color="text.secondary">항목을 선택해 계산 방식과 직급별 단가를 설정하세요.</Typography></Box>
        {Object.entries(CATEGORIES).map(([category, label]) => <Box key={category} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1 }}><Chip size="small" color={CATEGORY_COLORS[category]} label={label} /><Typography variant="caption" color="text.secondary">{counts[category] || 0}개</Typography></Stack>
          <Stack spacing={0.5}>{items.filter((row) => row.category === category).map((row) => <Button key={row.id} variant={selectedId === row.id ? 'contained' : 'text'} color={selectedId === row.id ? 'primary' : 'inherit'} onClick={() => setSelectedId(row.id)} sx={{ display: 'block', textAlign: 'left', px: 1.5 }}>
            <Typography variant="body2" fontWeight={600}>{row.name}</Typography><Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>{(row.payTypes || []).map((payType) => PAY_TYPES[payType]?.label || payType).join(' · ')} · {CALC_TYPES[row.calcType]} · {PAY_CYCLES[row.payCycle]}</Typography>
          </Button>)}</Stack>
        </Box>)}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Box><Typography variant="h6" fontWeight={700}>{selected.name}</Typography><Typography variant="body2" color="text.secondary">{calculationLabel(selected)}</Typography></Box>
          <Tooltip title={selected.required ? '기본급은 삭제할 수 없습니다.' : '항목 삭제'}><span style={{ marginLeft: 'auto' }}><IconButton color="error" disabled={selected.required} onClick={removeItem}><DeleteOutlineIcon /></IconButton></span></Tooltip></Stack>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}><Typography fontWeight={700} sx={{ mb: 1.5 }}>적용 및 단가 설정</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(180px, 1fr))', xl: 'repeat(3, minmax(180px, 1fr))' }, gap: 1.5 }}>{calculationFields(selected, updateSelected)}</Box>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.paper' }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Box sx={{ flex: 1 }}><Typography variant="caption" color="text.secondary">{CALC_TYPES[selected.calcType]}</Typography><Typography fontWeight={700}>{selected.calcType === 'FORMULA' || selected.calcType === 'EXTERNAL' ? formulaLabel(selected.formula) || '계산식이 비어 있습니다.' : selected.calcType === 'CONDITIONAL' ? `${CONDITIONS[selected.condition]} 직급별 정액 지급` : '직급별 정액 지급'}</Typography></Box><Button variant="outlined" startIcon={<FunctionsIcon />} onClick={openFormulaDialog}>계산 방식 설정</Button></Stack></Paper>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>{(selected.payTypes || []).map((payType) => <Chip key={payType} size="small" color={PAY_TYPES[payType]?.color} label={PAY_TYPES[payType]?.label || payType} />)}<Chip size="small" label={RATE_BASES[selected.rateBasis]} /><Chip size="small" label={`정산: ${PAY_CYCLES[selected.payCycle]}`} /><Chip size="small" label={`조건: ${CONDITIONS[selected.condition]}`} />{selected.capValue && <Chip size="small" label={`상한: ${selected.capValue}`} />}</Stack>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}><Typography fontWeight={700}>{effectiveMonth}부터 적용할 급여 타입·직급별 단가</Typography><Typography variant="body2" color="text.secondary">권한이나 직무와 관계없이 직원에게 지정된 급여 타입과 직급으로 단가를 결정합니다.</Typography></Box>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>급여 타입</TableCell><TableCell>직급</TableCell><TableCell align="right">단가</TableCell><TableCell>계산 기준</TableCell></TableRow></TableHead><TableBody>
          {PAY_TYPE_ORDER.filter((payType) => (selected.payTypes || []).includes(payType)).flatMap((payType) => grades.map((grade, index) => <TableRow key={`${payType}:${grade.id}`} hover>{index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2 }}><Chip size="small" color={PAY_TYPES[payType].color} label={PAY_TYPES[payType].label} /><Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{payType}</Typography></TableCell>}<TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
            <TableCell align="right"><TextField size="small" value={getRate(payType, grade.id)} onChange={(e) => changeRate(payType, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} sx={{ width: 170 }} /></TableCell><TableCell>{RATE_BASES[selected.rateBasis]}</TableCell></TableRow>))}
        </TableBody></Table></TableContainer>
      </Paper>
    </Stack> : <Paper variant="outlined"><Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h6" fontWeight={700}>급여체계 적용 이력</Typography><Typography variant="body2" color="text.secondary">적용 시점별 급여 기준을 조회하고 새 버전의 기준으로 복사합니다.</Typography></Box>
      <TableContainer><Table size="small"><TableHead><TableRow><TableCell>버전</TableCell><TableCell>적용 기간</TableCell><TableCell>상태</TableCell><TableCell>급여 항목</TableCell><TableCell>비고</TableCell><TableCell align="right">작업</TableCell></TableRow></TableHead><TableBody>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>현재 기준</TableCell><TableCell>{effectiveMonth} ~</TableCell><TableCell><Chip size="small" color="success" label="적용 예정" /></TableCell><TableCell>{items.length}개</TableCell><TableCell>일반·수당 대상과 복합 계산 단위를 편집 중인 기준</TableCell><TableCell align="right"><Button size="small" onClick={() => setTab(0)}>편집</Button></TableCell></TableRow>
        <TableRow><TableCell sx={{ fontWeight: 700 }}>기존 기준</TableCell><TableCell>최초 적용 ~ 현재</TableCell><TableCell><Chip size="small" variant="outlined" label="사용 중" /></TableCell><TableCell>기본급·고정수당·변동수당</TableCell><TableCell>현재 서버에 저장된 기존 기준</TableCell><TableCell align="right"><Button size="small" disabled>조회</Button></TableCell></TableRow>
      </TableBody></Table></TableContainer></Paper>}

    <Dialog open={formulaDialogOpen} onClose={() => setFormulaDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>계산 방식 설정 · {selected.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <FormControl fullWidth size="small"><InputLabel>계산 방식 종류</InputLabel><Select label="계산 방식 종류" value={formulaCalcType} onChange={(e) => setFormulaCalcType(e.target.value)}>{Object.entries(CALC_TYPES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></FormControl>
      {formulaCalcType === 'CONDITIONAL' && <FormControl fullWidth size="small"><InputLabel>지급 조건</InputLabel><Select label="지급 조건" value={formulaCondition} onChange={(e) => setFormulaCondition(e.target.value)}>{Object.entries(CONDITIONS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></FormControl>}
      {formulaCalcType === 'FLAT' && <Alert severity="info">직급별로 설정한 단가를 정산 주기마다 정액으로 지급합니다.</Alert>}
      {formulaCalcType === 'EXTERNAL' && <Alert severity="info">이 항목의 금액은 BARO의 다른 계산 시스템에서 전달받습니다. 현재 연결 값은 {formulaLabel(formulaDraft) || '지정되지 않음'}입니다.</Alert>}
      {formulaCalcType === 'FORMULA' && <><Alert severity="info">기준 근무일수는 고정값이 아니라 선택 월의 근무요일에서 등록 공휴일을 제외해 서버가 계산합니다.</Alert>
      <Paper variant="outlined" sx={{ p: 2, minHeight: 96 }}><Typography variant="subtitle2" sx={{ mb: 1 }}>계산식 작업 영역</Typography><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{formulaDraft.length === 0 ? <Typography color="text.secondary">아래 모듈을 눌러 계산식을 만드세요.</Typography> : formulaDraft.map((token, index) => <Chip key={`${token}-${index}`} label={formulaTokenLabel(token)} onDelete={() => removeFormulaToken(index)} color={FORMULA_PARAMETERS[token] ? 'primary' : 'default'} variant={FORMULA_PARAMETERS[token] ? 'filled' : 'outlined'} />)}</Stack></Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700} sx={{ mb: 1 }}>파라미터 모듈</Typography><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{Object.entries(FORMULA_PARAMETERS).map(([key, parameter]) => <Tooltip key={key} title={parameter.hint || parameter.unit}><Button size="small" variant="outlined" onClick={() => appendFormulaToken(key)}>{parameter.label} · {parameter.unit}</Button></Tooltip>)}</Stack></Paper><Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700} sx={{ mb: 1 }}>연산자</Typography><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{FORMULA_OPERATORS.map((operator) => <Button key={operator} size="small" variant="outlined" onClick={() => appendFormulaToken(operator)}>{operator}</Button>)}</Stack></Paper></Box>
      <Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={700} sx={{ mb: 1 }}>숫자 상수</Typography><Stack direction="row" spacing={1}><TextField size="small" value={constantDraft} onChange={(e) => setConstantDraft(e.target.value)} placeholder="예: 할증률 1.5" inputProps={{ inputMode: 'decimal' }} /><Button variant="outlined" onClick={appendFormulaConstant}>상수 추가</Button><Button color="inherit" onClick={() => setFormulaDraft([])}>전체 지우기</Button></Stack></Paper>
      <Box><Typography variant="caption" color="text.secondary">완성된 식</Typography><Typography variant="h6">{formulaLabel(formulaDraft) || '-'}</Typography></Box></>}
    </Stack></DialogContent><DialogActions><Button onClick={() => setFormulaDialogOpen(false)}>취소</Button><Button variant="contained" onClick={saveFormula} disabled={formulaCalcType === 'FORMULA' && formulaDraft.length === 0}>계산 방식 적용</Button></DialogActions></Dialog>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm"><DialogTitle>급여 항목 추가</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <TextField autoFocus label="항목명" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="예: 자격수당" />
      <FormControl fullWidth size="small"><InputLabel>급여 구분</InputLabel><Select label="급여 구분" value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></FormControl>
      {calculationFields(draft, (field, value) => setDraft((prev) => ({ ...prev, [field]: value })))}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>취소</Button><Button variant="contained" onClick={addItem} disabled={!draft.name.trim()}>추가</Button></DialogActions></Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
