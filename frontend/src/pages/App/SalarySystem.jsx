import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormHelperText, IconButton, InputAdornment, InputLabel, ListItemText, MenuItem, Paper, Select, Stack,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FunctionsIcon from '@mui/icons-material/Functions';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { salaryText } from './salarySystemI18n';
import { labelChipSx } from '../../theme/labelPalette';
import { CURRENCY_CODES, currencySymbol } from '../../constants/currencies';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';
import { resolveFactoryManagementStartDateKey } from '../../utils/factoryManagementStart';

const PAY_TYPES = {
  GENERAL: { label: '일반', palette: 'blue' },
  OUTPUT: { label: '생산', palette: 'orange' },
};
const PAY_TYPE_ORDER = ['GENERAL', 'OUTPUT'];
const CATEGORIES = { BASE: '기본급', ALLOWANCE: '급여 수당', INCENTIVE: '성과급' };
const CATEGORY_PALETTES = { BASE: 'blue', ALLOWANCE: 'green', INCENTIVE: 'orange' };
const PAY_CYCLES = {
  MONTHLY: '1개월', QUARTERLY: '3개월', SEMIANNUAL: '6개월', ANNUAL: '12개월',
};
const PAYMENT_MONTHS_BY_CYCLE = {
  MONTHLY: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  QUARTERLY: [3, 6, 9, 12],
  SEMIANNUAL: [6, 12],
  ANNUAL: [12],
};
// 파라미터를 성격별로 묶어서 보여준다 (단가/근속 -> 근무일수 -> 근무시간 -> 조건·외부 계산값).
const FORMULA_PARAMETERS = {
  GRADE_RATE: { label: '직급별 단가', currencyUnit: true, hint: '직원의 급여 타입과 직급에 지정된 이 급여 항목의 단가입니다.' },
  TENURE_YEARS: { label: '근속연수', unit: '년', hint: '급여 정산월 말일을 기준으로 계산한 직원의 근속연수입니다.' },
  ACTUAL_WORKDAYS: { label: '실제 근무일수', unit: '일', hint: '주말과 휴일 메뉴에 등록된 휴일을 제외한 정규 근무일 중 4시간 이상 근무한 날짜 수입니다. 휴일 근무는 포함하지 않습니다.' },
  SCHEDULED_WORKDAYS: { label: '기준 근무일수', unit: '일', hint: '생산 급여 타입은 일요일과 등록 휴일을, 일반 급여 타입은 토·일요일과 등록 휴일을 제외한 해당 월의 날짜 수입니다.' },
  HOLIDAY_WORKDAYS: { label: '휴일 근무일수', unit: '일', hint: '급여 타입별 주말 또는 휴일 메뉴에 등록된 휴일 중 4시간 이상 근무한 날짜 수입니다. 실제 근무일수와 만근 여부에는 포함하지 않습니다.' },
  WORK_HOURS: { label: '정규 근무시간', unit: '시간', hint: '휴일이 아닌 정규 근무일에 기록된 근무시간입니다.' },
  OVERTIME_HOURS: { label: '연장근무시간', unit: '시간', hint: '하루 기준 근무시간을 초과해 인정된 근무시간입니다. 최소 인정 단위와 승인 규칙은 추후 확정합니다.' },
  HOLIDAY_HOURS: { label: '휴일 특근시간', unit: '시간', hint: '급여 타입별 주말 또는 휴일 메뉴에 등록된 휴일에 기록된 근무시간입니다.' },
  FULL_ATTENDANCE_FACTOR: { label: '만근 여부', unit: '1 또는 0', hint: '실제 근무일수가 기준 근무일수 이상이면 1, 아니면 0입니다. 휴일 근무일수는 만근 판정에 포함하지 않습니다.' },
  PRODUCTION_ALLOWANCE: { label: '생산수당 계산 결과', currencyUnit: true, hint: '작업 기록과 공장 생산수당 단가로 별도 계산된 해당 월의 생산수당 금액입니다.' },
};
const formulaParameterUnit = (parameter, currencyCode) => parameter.currencyUnit ? currencyCode : parameter.unit;
const hasValidPaymentMonths = (item) => {
  const months = Array.isArray(item.paymentMonths) ? item.paymentMonths : [];
  const expectedCount = PAYMENT_MONTHS_BY_CYCLE[item.payCycle]?.length;
  return Boolean(expectedCount) && months.length === expectedCount && new Set(months).size === months.length && months.every((month) => Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12);
};
const FORMULA_PARAMETER_GROUPS = [
  { label: '단가·근속', keys: ['GRADE_RATE', 'TENURE_YEARS'] },
  { label: '근무일수', keys: ['ACTUAL_WORKDAYS', 'SCHEDULED_WORKDAYS', 'HOLIDAY_WORKDAYS'] },
  { label: '근무시간', keys: ['WORK_HOURS', 'OVERTIME_HOURS', 'HOLIDAY_HOURS'] },
  { label: '조건', keys: ['FULL_ATTENDANCE_FACTOR'] },
];
const FORMULA_OPERATORS = ['+', '−', '×', '÷', '(', ')'];
const DEFAULT_FORMULA = ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS', '÷', 'SCHEDULED_WORKDAYS'];
// 새 항목의 최초 급여 타입만 카테고리 기준으로 정하고, 이후에는 항목 목록의 체크박스로 직접 편집한다.
const defaultPayTypesForCategory = (category) => (category === 'INCENTIVE' ? ['OUTPUT'] : ['GENERAL', 'OUTPUT']);
const DEFAULT_DRAFT = { name: '', nameKo: '', nameEn: '', nameVi: '', category: 'ALLOWANCE', formula: ['GRADE_RATE'], payCycle: 'MONTHLY', paymentMonths: PAYMENT_MONTHS_BY_CYCLE.MONTHLY, capValue: '' };
const item = (id, name, category, payCycle = 'MONTHLY', extra = {}) =>
  ({ id, name, nameKo: name, nameEn: name, nameVi: name, category, payTypes: defaultPayTypesForCategory(category), formula: ['GRADE_RATE'], payCycle, paymentMonths: PAYMENT_MONTHS_BY_CYCLE[payCycle], capValue: '', ...extra });
const DEFAULT_ITEMS = [
  item('baseSalary', '기본급', 'BASE', 'MONTHLY', { required: true, formula: DEFAULT_FORMULA }),
  item('lunch', '점심수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'ACTUAL_WORKDAYS'] }),
  item('phone', '통신비', 'ALLOWANCE'),
  item('transport', '교통비', 'ALLOWANCE'),
  item('position', '직책수당', 'ALLOWANCE'),
  item('housing', '주거수당', 'ALLOWANCE'),
  item('language', '어학수당', 'ALLOWANCE'),
  item('holiday', '휴일근무수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'HOLIDAY_WORKDAYS'] }),
  item('attendance', '만근수당', 'ALLOWANCE', 'MONTHLY', { formula: ['GRADE_RATE', '×', 'FULL_ATTENDANCE_FACTOR'] }),
  item('seniority', '근속수당', 'ALLOWANCE', 'SEMIANNUAL', { formula: ['GRADE_RATE', '×', 'TENURE_YEARS'], capValue: '5' }),
  item('incentiveTotal', '성과급', 'INCENTIVE', 'MONTHLY', { formula: ['PRODUCTION_ALLOWANCE'], required: true }),
];

const money = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '0';
};
const optionalMoney = (value) => {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const salaryStateSignature = ({ currencyCode, items, rates }) => {
  const normalizedItems = items.map((item) => ({
    id: String(item.id),
    nameKo: String(item.nameKo || '').trim(),
    nameEn: String(item.nameEn || '').trim(),
    nameVi: String(item.nameVi || '').trim(),
    category: item.category,
    payTypes: PAY_TYPE_ORDER.filter((payType) => (item.payTypes || []).includes(payType)),
    formula: Array.isArray(item.formula) ? item.formula : [],
    payCycle: item.payCycle,
    paymentMonths: [...(item.paymentMonths || PAYMENT_MONTHS_BY_CYCLE[item.payCycle] || [])].map(Number).sort((a, b) => a - b),
    capValue: item.capValue === '' || item.capValue == null
      ? null
      : Number.isFinite(Number(item.capValue)) ? Number(item.capValue) : String(item.capValue),
    required: item.required === true,
  }));
  const activeItems = new Map(normalizedItems.filter((item) => item.category !== 'INCENTIVE').map((item) => [item.id, item]));
  const normalizedRates = Object.entries(rates).flatMap(([key, itemRates]) => {
    const [payType, gradeId] = key.split(':');
    return Object.entries(itemRates || {}).flatMap(([itemId, value]) => {
      const amount = Number(String(value).replace(/,/g, '')) || 0;
      const item = activeItems.get(String(itemId));
      return amount !== 0 && item?.payTypes.includes(payType)
        ? [{ payType, gradeId: Number(gradeId), itemId: String(itemId), amount }]
        : [];
    });
  }).sort((left, right) => `${left.payType}:${left.gradeId}:${left.itemId}`.localeCompare(`${right.payType}:${right.gradeId}:${right.itemId}`));
  return JSON.stringify({ currencyCode, items: normalizedItems, rates: normalizedRates });
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const VERSION_GRAPH_COLORS = ['#1976d2', '#9c27b0', '#2e7d32', '#ed6c02', '#d32f2f', '#0288d1', '#6d4c41', '#5e35b1'];
const monthRange = (startMonth, endMonth) => {
  const months = [];
  const cursor = new Date(`${startMonth}-01T00:00:00Z`);
  const end = new Date(`${endMonth}-01T00:00:00Z`);
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
};
const gradeName = (grade, language) => language === 'en' ? grade.nameEn : language === 'vi' ? grade.nameVi : grade.nameKo;
const salaryItemName = (row, language) => language === 'en' ? row.nameEn : language === 'vi' ? row.nameVi : row.nameKo;
const calculationLabel = (row, t) => `${t(PAY_CYCLES[row.payCycle]) || ''}${row.payCycle === 'MONTHLY' ? '' : ` · ${(row.paymentMonths || []).map((month) => `${month}${t('월')}`).join(', ')}`}`;
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
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();
  const t = useCallback((text) => salaryText(text, languageCode), [languageCode]);
  const [grades, setGrades] = useState([]);
  const [factories, setFactories] = useState([]);
  const [factoryId, setFactoryId] = useState(null);
  const [rates, setRates] = useState({});
  const [currencyCode, setCurrencyCode] = useState('VND');
  const [items, setItems] = useState(DEFAULT_ITEMS);
  const [selectedId, setSelectedId] = useState('baseSalary');
  const [dialogOpen, setDialogOpen] = useState(false);
  // 저장(=버전 확정)할 때마다 그 시점의 항목/단가 스냅샷이 쌓인다. 공정 버전 관리처럼
  // 버전 목록을 훑어보고, 하나를 고르면 그 시점 스냅샷을 읽기 전용으로 볼 수 있다.
  const [versions, setVersions] = useState([]);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionBoundaries, setVersionBoundaries] = useState({});
  const [savedVersionBoundaries, setSavedVersionBoundaries] = useState({});
  const [versionBusy, setVersionBusy] = useState(false);
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

  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    requestJSON(`/factories${buildQueryString({ orgId: activeOrgId })}`).then((rows) => {
      if (cancelled) return;
      const nextFactories = Array.isArray(rows) ? rows : [];
      setFactories(nextFactories);
      setFactoryId((current) => nextFactories.some((factory) => Number(factory.id) === Number(current)) ? current : (nextFactories[0]?.id || null));
    }).catch((error) => { if (!cancelled) setMessage({ severity: 'error', text: error?.message || 'Failed to load factories.' }); });
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const load = useCallback(async () => {
    if (!activeOrgId || !factoryId) return;
    try {
      const [sets, salarySystem] = await Promise.all([
        requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`),
        requestJSON(`/salary-system${buildQueryString({ orgId: activeOrgId, factoryId })}`),
      ]);
      setGrades((Array.isArray(sets) ? sets : []).flatMap((set) => set.grades || []).filter((grade) => grade.isActive));
      const loadedItems = (Array.isArray(salarySystem?.items) && salarySystem.items.length ? salarySystem.items : DEFAULT_ITEMS).map((row) => row.category === 'INCENTIVE'
        ? { ...row, name: '성과급', nameKo: '성과급', nameEn: 'Performance Pay', nameVi: 'Thưởng năng suất', payTypes: ['OUTPUT'], formula: ['PRODUCTION_ALLOWANCE'], payCycle: 'MONTHLY', paymentMonths: PAYMENT_MONTHS_BY_CYCLE.MONTHLY, capValue: '', required: true }
        : { ...row, nameKo: row.nameKo || row.name, nameEn: row.nameEn || row.name, nameVi: row.nameVi || row.name, paymentMonths: Array.isArray(row.paymentMonths) ? row.paymentMonths : PAYMENT_MONTHS_BY_CYCLE[row.payCycle], capValue: optionalMoney(row.capValue) });
      const next = {};
      (Array.isArray(salarySystem?.rates) ? salarySystem.rates : []).forEach((row) => {
        const key = `${row.payType}:${row.gradeId}`;
        next[key] = { ...next[key], [row.salaryItemCode]: money(row.amount) };
      });
      setItems(loadedItems);
      const loadedCurrencyCode = CURRENCY_CODES.includes(salarySystem?.currencyCode) ? salarySystem.currencyCode : 'VND';
      setCurrencyCode(loadedCurrencyCode);
      setVersions(Array.isArray(salarySystem?.versions) ? salarySystem.versions : []);
      setRates(next);
      setSavedSnapshot(salaryStateSignature({ currencyCode: loadedCurrencyCode, items: loadedItems, rates: next }));
      return salarySystem;
    } catch (error) {
      setMessage({ severity: 'error', text: error?.message || t('급여 기준을 불러오지 못했습니다.') });
      return null;
    }
  }, [activeOrgId, factoryId, t]);
  useEffect(() => { load(); }, [load]);

  const isDirty = useMemo(
    () => savedSnapshot !== null && salaryStateSignature({ currencyCode, items, rates }) !== savedSnapshot,
    [currencyCode, items, rates, savedSnapshot]
  );

  const selected = items.find((row) => row.id === selectedId) || items[0];
  const isFixedIncentive = selected.category === 'INCENTIVE';
  const counts = useMemo(() => items.reduce((map, row) => ({ ...map, [row.category]: (map[row.category] || 0) + 1 }), {}), [items]);
  const updateSelected = (field, value) => setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, [field]: value } : row));
  const toggleItemPayType = (itemRow, payType) => {
    if (itemRow.category === 'INCENTIVE') return;
    const current = itemRow.payTypes || [];
    if (current.includes(payType) && current.length === 1) return;
    if (current.includes(payType)) {
      setRates((previous) => Object.fromEntries(Object.entries(previous).map(([key, itemRates]) => {
        if (!key.startsWith(`${payType}:`)) return [key, itemRates];
        const nextItemRates = { ...itemRates };
        delete nextItemRates[itemRow.id];
        return [key, nextItemRates];
      })));
    }
    const next = current.includes(payType) ? current.filter((value) => value !== payType) : [...current, payType];
    setItems((rows) => rows.map((row) => row.id === itemRow.id ? { ...row, payTypes: PAY_TYPE_ORDER.filter((value) => next.includes(value)) } : row));
  };
  const getRate = (payType, gradeId) => rates[`${payType}:${gradeId}`]?.[selected.id] || '0';
  const changeRate = (payType, gradeId, value) => {
    const key = `${payType}:${gradeId}`;
    setRates((prev) => ({ ...prev, [key]: { ...prev[key], [selected.id]: money(value) } }));
  };
  const addItem = () => {
    if ([draft.nameKo, draft.nameEn, draft.nameVi].some((name) => !name.trim())) return;
    const next = { ...draft, name: draft.nameKo.trim(), nameKo: draft.nameKo.trim(), nameEn: draft.nameEn.trim(), nameVi: draft.nameVi.trim(), id: `draft-${Date.now()}`, payTypes: defaultPayTypesForCategory(draft.category) };
    setItems((rows) => [...rows, next]);
    setSelectedId(next.id);
    setDialogOpen(false);
    setDraft(DEFAULT_DRAFT);
    showNotification(t('급여 항목을 추가했습니다. 저장하면 새 버전으로 등록됩니다.'), 'info');
  };
  const reorderItems = ({ source, destination }) => {
    if (!destination || source.droppableId !== destination.droppableId || source.index === destination.index) return;
    const category = source.droppableId.replace('salary-items:', '');
    setItems((rows) => {
      const categoryItems = rows.filter((row) => row.category === category);
      const [moved] = categoryItems.splice(source.index, 1);
      if (!moved) return rows;
      categoryItems.splice(destination.index, 0, moved);
      let categoryIndex = 0;
      return rows.map((row) => row.category === category ? categoryItems[categoryIndex++] : row);
    });
  };
  const saveDraft = async () => {
    try {
      const editableItems = new Map(items.filter((itemRow) => itemRow.category !== 'INCENTIVE').map((itemRow) => [String(itemRow.id), itemRow]));
      const rateRows = Object.entries(rates).flatMap(([key, itemRates]) => {
        const [payType, gradeId] = key.split(':');
        return Object.entries(itemRates || {}).filter(([salaryItemCode]) => editableItems.get(String(salaryItemCode))?.payTypes?.includes(payType)).map(([salaryItemCode, amount]) => ({ payType, gradeId: Number(gradeId), salaryItemCode, amount: Number(String(amount).replace(/,/g, '')) || 0 }));
      });
      await requestJSON(`/salary-system${buildQueryString({ orgId: activeOrgId, factoryId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currencyCode, items: items.map((row) => ({ ...row, code: row.code || row.id, capValue: row.capValue === '' || row.capValue == null ? null : Number(String(row.capValue).replace(/,/g, '')) })), rates: rateRows }) });
      await requestJSON(`/salary-system/versions${buildQueryString({ orgId: activeOrgId, factoryId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId: activeOrgId, source: 'salary-system-version-create' });
      const refreshed = await load();
      showNotification(t('급여 체계를 저장하고 새 버전을 등록했습니다. 적용 월은 버전 관리에서 지정할 수 있습니다.'), 'success');
      openVersionDialog(Array.isArray(refreshed?.versions) ? refreshed.versions : versions);
    } catch (error) {
      showNotification(error?.message || 'Failed to save salary system.', 'error');
    }
  };
  const openVersionDialog = (versionRows = versions) => {
    const sourceVersions = Array.isArray(versionRows) ? versionRows : versions;
    const next = {};
    sourceVersions.forEach((version) => { if (version.versionNumber > 1 && version.effectiveMonth) next[version.id] = version.effectiveMonth; });
    setVersionBoundaries(next);
    setSavedVersionBoundaries(next);
    setVersionDialogOpen(true);
  };
  const selectedFactory = useMemo(
    () => factories.find((factory) => Number(factory.id) === Number(factoryId)) || null,
    [factories, factoryId]
  );
  const managementStartMonth = useMemo(
    () => resolveFactoryManagementStartDateKey(selectedFactory).slice(0, 7),
    [selectedFactory]
  );
  const managedMonths = useMemo(() => monthRange(managementStartMonth, monthKey()), [managementStartMonth]);
  const colorByVersionId = useMemo(() => new Map([...versions].sort((a, b) => a.versionNumber - b.versionNumber).map((version, index) => [version.id, VERSION_GRAPH_COLORS[index % VERSION_GRAPH_COLORS.length]])), [versions]);
  const versionForMonth = useCallback((month) => {
    const applicable = versions.filter((version) => version.versionNumber === 1 || (versionBoundaries[version.id] && versionBoundaries[version.id] <= month));
    return applicable.sort((a, b) => a.versionNumber - b.versionNumber).at(-1) || null;
  }, [versionBoundaries, versions]);
  const assignVersionToMonth = (version, month) => {
    if (version.versionNumber === 1) return;
    setVersionBoundaries((current) => {
      const next = { ...current, [version.id]: month };
      versions.forEach((other) => {
        if (other.id === version.id || other.versionNumber === 1 || !next[other.id]) return;
        const conflicts = other.versionNumber < version.versionNumber ? next[other.id] >= month : next[other.id] <= month;
        if (conflicts) delete next[other.id];
      });
      return next;
    });
  };
  const saveVersionBoundaries = async () => {
    setVersionBusy(true);
    try {
      const response = await requestJSON(`/salary-system/version-boundaries${buildQueryString({ orgId: activeOrgId, factoryId })}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boundaries: Object.entries(versionBoundaries).map(([versionId, startMonth]) => ({ versionId: Number(versionId), startMonth })) }) });
      setVersions(Array.isArray(response?.versions) ? response.versions : versions);
      setSavedVersionBoundaries(versionBoundaries);
      emitWorkspaceDataChanged({ topics: [WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS], orgId: activeOrgId, source: 'salary-system-version-boundaries' });
      setVersionDialogOpen(false);
      showNotification(t('급여 버전 적용 구간을 저장했습니다.'), 'success');
    } catch (error) {
      showNotification(error?.message || t('급여 버전 적용 구간을 저장하지 못했습니다.'), 'error');
    } finally { setVersionBusy(false); }
  };
  const hasVersionBoundaryChanges = JSON.stringify(versionBoundaries) !== JSON.stringify(savedVersionBoundaries);
  const removeItem = () => {
    if (selected.required || isFixedIncentive) return;
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
    const names = { nameKo: formulaSettingsDraft.nameKo.trim(), nameEn: formulaSettingsDraft.nameEn.trim(), nameVi: formulaSettingsDraft.nameVi.trim() };
    setItems((rows) => rows.map((row) => row.id === selected.id ? { ...row, ...formulaSettingsDraft, ...names, name: names.nameKo, formula: formulaDraft } : row));
    setFormulaDialogOpen(false);
  };

  const calculationFields = (value, onChange) => <>
    <FormControl fullWidth size="small"><InputLabel>{t('정산 주기')}</InputLabel><Select label={t('정산 주기')} value={value.payCycle} onChange={(e) => { onChange('payCycle', e.target.value); onChange('paymentMonths', PAYMENT_MONTHS_BY_CYCLE[e.target.value]); }}>
      {Object.entries(PAY_CYCLES).map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}
    </Select></FormControl>
    <FormControl fullWidth size="small" disabled={value.payCycle === 'MONTHLY'} error={(value.paymentMonths || []).length !== PAYMENT_MONTHS_BY_CYCLE[value.payCycle].length}>
      <InputLabel>{t('지급 월')}</InputLabel>
      <Select multiple label={t('지급 월')} value={value.paymentMonths || []} renderValue={(selectedMonths) => value.payCycle === 'MONTHLY' ? t('매월') : selectedMonths.map((month) => `${month}${t('월')}`).join(', ')} onChange={(event) => { const months = event.target.value.map(Number).sort((a, b) => a - b); if (months.length <= PAYMENT_MONTHS_BY_CYCLE[value.payCycle].length) onChange('paymentMonths', months); }}>
        {PAYMENT_MONTHS_BY_CYCLE.MONTHLY.map((month) => <MenuItem key={month} value={month}><Checkbox size="small" checked={(value.paymentMonths || []).includes(month)} /><ListItemText primary={`${month}${t('월')}`} /></MenuItem>)}
      </Select>
      {value.payCycle !== 'MONTHLY' && <FormHelperText>{t(`${PAYMENT_MONTHS_BY_CYCLE[value.payCycle].length}개 월을 선택하세요.`)}</FormHelperText>}
    </FormControl>
    <TextField size="small" label={t('상한값 (선택)')} value={value.capValue || ''} onChange={(e) => onChange('capValue', optionalMoney(e.target.value))} placeholder={t('계산 결과 최대 금액')} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment> }} />
  </>;

  return <AppPageContainer><Box sx={{ p: 2, width: '100%' }}>
    <Stack direction="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" rowGap={1.5} sx={{ mb: 2, width: '100%' }}>
      <Typography variant="h5" fontWeight={700}>{t('급여 체계')}</Typography>
      <FormControl size="small" sx={{ minWidth: 120 }}><InputLabel>{t('통화')}</InputLabel><Select label={t('통화')} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>{CURRENCY_CODES.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}</Select></FormControl>
    </Stack>
    {factories.length > 0 && <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Tabs value={factoryId} onChange={(_event, value) => { setSavedSnapshot(null); setSelectedId('baseSalary'); setFactoryId(value); }} sx={{ flex: 1, minWidth: 0 }}>
        {factories.map((factory) => <Tab key={factory.id} value={factory.id} label={languageCode === 'ko' ? (factory.nameKo || factory.name) : languageCode === 'vi' ? (factory.nameVi || factory.name) : factory.name} />)}
      </Tabs>
      <Stack direction="row" spacing={1} sx={{ pb: 0.75, flexShrink: 0 }}>
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={openVersionDialog}>{t('버전 관리')}</Button>
        <SaveButton onClick={saveDraft} disabled={!isDirty}>{t('저장')}</SaveButton>
      </Stack>
    </Stack>}
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert>}

    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { xs: '100%', lg: 350 }, flexShrink: 0 }}>
        <Stack direction="row" alignItems="flex-start" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box><Typography fontWeight={700}>{t('급여 항목')}</Typography><Typography variant="caption" color="text.secondary">{t('항목을 선택해 계산 방식과 직급별 단가를 설정하세요.')}</Typography></Box>
          <Tooltip title={t('항목 추가')}><IconButton size="small" color="primary" sx={{ ml: 'auto' }} onClick={() => setDialogOpen(true)}><AddIcon /></IconButton></Tooltip>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 42px 42px', alignItems: 'center', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
          <span />
          <Typography variant="caption" color="text.secondary" fontWeight={700}>{t('항목명')}</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={700} textAlign="center">{t('일반')}</Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={700} textAlign="center">{t('생산')}</Typography>
        </Box>
        <DragDropContext onDragEnd={reorderItems}>
          {Object.entries(CATEGORIES).map(([category, label]) => <Box key={category} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 0.5, mb: 1 }}><Chip size="small" variant="outlined" label={t(label)} sx={labelChipSx(CATEGORY_PALETTES[category])} /><Typography variant="caption" color="text.secondary">{languageCode === 'ko' ? `${counts[category] || 0}${t('개')}` : `${counts[category] || 0} ${t('개')}`}</Typography></Stack>
            <Droppable droppableId={`salary-items:${category}`}>
              {(dropProvided) => <Stack ref={dropProvided.innerRef} {...dropProvided.droppableProps} spacing={0.5}>
                {items.filter((row) => row.category === category).map((row, index) => <Draggable key={row.id} draggableId={String(row.id)} index={index}>
                  {(dragProvided, snapshot) => <Stack ref={dragProvided.innerRef} {...dragProvided.draggableProps} direction="row" alignItems="center" sx={{ bgcolor: snapshot.isDragging ? 'action.hover' : 'transparent', borderRadius: 1 }}>
                    <IconButton {...dragProvided.dragHandleProps} size="small" aria-label="순서 변경" sx={{ flexShrink: 0, cursor: 'grab', color: 'text.disabled', '&:active': { cursor: 'grabbing' } }}><DragIndicatorIcon fontSize="small" /></IconButton>
                    <Box role="button" tabIndex={0} onClick={() => setSelectedId(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(row.id); } }} sx={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 42px 42px', alignItems: 'center', pl: 1.5, pr: 0.25, py: 0.65, borderRadius: 1, cursor: 'pointer', bgcolor: selectedId === row.id ? 'primary.main' : 'transparent', color: selectedId === row.id ? 'primary.contrastText' : 'text.primary', '&:hover': { bgcolor: selectedId === row.id ? 'primary.dark' : 'action.hover' } }}>
                      <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={600} noWrap>{salaryItemName(row, languageCode)}</Typography><Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>{t(PAY_CYCLES[row.payCycle])}</Typography></Box>
                      {PAY_TYPE_ORDER.map((payType) => { const active = (row.payTypes || []).includes(payType); const fixed = row.category === 'INCENTIVE'; const isLastActiveType = active && (row.payTypes || []).length === 1; return <Checkbox key={payType} size="small" checked={active} disabled={fixed || isLastActiveType} onClick={(event) => event.stopPropagation()} onChange={() => toggleItemPayType(row, payType)} inputProps={{ 'aria-label': `${salaryItemName(row, languageCode)} ${t(PAY_TYPES[payType]?.label || payType)}` }} sx={{ justifySelf: 'center', p: 0.5, color: selectedId === row.id ? 'rgba(255,255,255,.72)' : undefined, '&.Mui-checked': { color: selectedId === row.id ? 'common.white' : undefined } }} />; })}
                    </Box>
                  </Stack>}
                </Draggable>)}
                {dropProvided.placeholder}
              </Stack>}
            </Droppable>
          </Box>)}
        </DragDropContext>
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Box><Typography variant="h6" fontWeight={700}>{salaryItemName(selected, languageCode)}</Typography><Typography variant="body2" color="text.secondary">{calculationLabel(selected, t)}</Typography></Box>
          {!isFixedIncentive && <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}><Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={openFormulaDialog}>{t('수정')}</Button><Tooltip title={t(selected.required ? '기본급은 삭제할 수 없습니다.' : '항목 삭제')}><span><IconButton color="error" disabled={selected.required} onClick={removeItem}><DeleteOutlineIcon /></IconButton></span></Tooltip></Stack>}</Stack>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.5} alignItems="center"><Typography variant="body2" fontWeight={700}>{t('정산 설정')}</Typography><Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap"><Chip size="small" variant="outlined" label={t(PAY_CYCLES[selected.payCycle])} />{selected.payCycle !== 'MONTHLY' && <Chip size="small" variant="outlined" label={(selected.paymentMonths || []).map((month) => `${month}${t('월')}`).join(' · ')} />}{selected.capValue && <Chip size="small" variant="outlined" label={`${t('상한')} ${money(selected.capValue)} ${currencyCode}`} />}</Stack></Stack>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2, bgcolor: 'action.hover', borderColor: 'divider' }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ flex: 1 }}><Typography variant="h6" fontWeight={700}>{salaryItemName(selected, languageCode)}</Typography><Typography variant="h6" color="primary.main" fontWeight={700}>=</Typography><Typography fontWeight={700}>{isFixedIncentive ? t('공장 초당 단가 × CT × 작업 수량') : formulaLabel(selected.formula, t) || t('계산식이 비어 있습니다.')}</Typography></Stack></Stack></Paper>
        </Box>
        {isFixedIncentive
          ? <Alert severity="info" icon={false} sx={{ m: 2 }}>{t('성과급은 작업 기록을 기준으로 자동 계산되며 급여 체계에서 수정할 수 없습니다.')}</Alert>
          : <><Box sx={{ px: 2, py: 1.5 }}><Typography fontWeight={700}>{t('급여 타입·직급별 단가')}</Typography><Typography variant="body2" color="text.secondary">{t('권한이나 직무와 관계없이 직원에게 지정된 급여 타입과 직급으로 단가를 결정합니다.')}</Typography></Box>
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t('급여 타입')}</TableCell><TableCell>{t('직급')}</TableCell><TableCell align="right">{t('단가')}/{t(PAY_CYCLES[selected.payCycle])} ({currencyCode})</TableCell></TableRow></TableHead><TableBody>
              {PAY_TYPE_ORDER.flatMap((payType) => { const active = (selected.payTypes || []).includes(payType); return grades.map((grade, index) => <TableRow key={`${payType}:${grade.id}`} hover={active} sx={{ opacity: active ? 1 : 0.48 }}>{index === 0 && <TableCell rowSpan={grades.length} sx={{ verticalAlign: 'top', pt: 2 }}><Chip size="small" variant="outlined" label={t(PAY_TYPES[payType].label)} sx={labelChipSx(PAY_TYPES[payType].palette, active)} /><Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>{payType}</Typography></TableCell>}<TableCell>{gradeName(grade, languageCode)} ({grade.code})</TableCell>
                <TableCell align="right"><TextField size="small" disabled={!active} value={getRate(payType, grade.id)} onFocus={(e) => e.target.select()} onChange={(e) => changeRate(payType, grade.id, e.target.value)} inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }} InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment> }} sx={{ width: 170 }} /></TableCell></TableRow>); })}
            </TableBody></Table></TableContainer></>}
      </Paper>
    </Stack>

    <Dialog open={formulaDialogOpen} onClose={() => setFormulaDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('계산 방식 설정')} · {salaryItemName(selected, languageCode)}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
        <TextField size="small" required label="Item Name (English)" value={formulaSettingsDraft.nameEn || ''} onChange={(e) => setFormulaSettingsDraft((prev) => ({ ...prev, nameEn: e.target.value }))} />
        <TextField size="small" required label="항목명 (한국어)" value={formulaSettingsDraft.nameKo || ''} onChange={(e) => setFormulaSettingsDraft((prev) => ({ ...prev, nameKo: e.target.value }))} />
        <TextField size="small" required label="Tên khoản mục (Tiếng Việt)" value={formulaSettingsDraft.nameVi || ''} onChange={(e) => setFormulaSettingsDraft((prev) => ({ ...prev, nameVi: e.target.value }))} />
      </Box></Paper>
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
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{group.keys.map((key) => {
                const unit = formulaParameterUnit(FORMULA_PARAMETERS[key], currencyCode);
                return <Stack key={key} direction="row" spacing={0.25} alignItems="center">
                  <Button size="small" variant="outlined" disabled={!canInsertTokenAt(formulaDraft, cursorIndex, key)} onClick={() => insertFormulaToken(key)}>{t(FORMULA_PARAMETERS[key].label)} · {t(unit)}</Button>
                  <Tooltip arrow title={t(FORMULA_PARAMETERS[key].hint || unit)}>
                    <IconButton size="small" aria-label={`${t(FORMULA_PARAMETERS[key].label)} ${t('설명')}`} sx={{ color: 'text.secondary' }}><InfoOutlinedIcon sx={{ fontSize: 17 }} /></IconButton>
                  </Tooltip>
                </Stack>;
              })}</Stack>
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
    </Stack></DialogContent><DialogActions><Button variant="contained" onClick={saveFormula} disabled={formulaDraft.length === 0 || !hasValidPaymentMonths(formulaSettingsDraft) || [formulaSettingsDraft.nameKo, formulaSettingsDraft.nameEn, formulaSettingsDraft.nameVi].some((name) => !String(name || '').trim())}>{t('계산식 적용')}</Button></DialogActions></Dialog>

    <Dialog open={versionDialogOpen} onClose={versionBusy ? undefined : () => setVersionDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('급여 체계 버전 관리')}</DialogTitle><DialogContent dividers>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Box sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
          <Stack spacing={0.75} sx={{ maxHeight: 434, overflowY: 'auto', pr: 0.5 }}>
            {[...versions].sort((a, b) => a.versionNumber - b.versionNumber).map((version) => {
              const versionColor = colorByVersionId.get(version.id) || '#9e9e9e';
              const draggable = version.versionNumber > 1;
              return <Box key={version.id} draggable={draggable} onDragStart={(event) => { if (!draggable) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(version.id)); }} sx={{ display: 'flex', alignItems: 'center', minHeight: 38, px: 0.75, border: 1, borderColor: 'divider', borderLeft: 4, borderLeftColor: versionColor, borderRadius: 1, cursor: draggable ? 'grab' : 'default', bgcolor: 'background.paper', '&:active': { cursor: draggable ? 'grabbing' : 'default' } }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: versionColor, mr: 0.75, flexShrink: 0 }} />
                <DragIndicatorIcon sx={{ mr: 0.5, color: draggable ? 'text.secondary' : 'text.disabled', fontSize: 18 }} />
                <Typography variant="body2" fontWeight={700} sx={{ flex: 1, fontSize: '.78rem' }}>{version.confirmedAt} · Ver.{version.versionNumber}</Typography>
                <Chip size="small" variant="outlined" label={`${version.items?.length || 0}${t('개')}`} sx={{ height: 22, fontSize: '.7rem' }} />
              </Box>;
            })}
            {versions.length === 0 && <Typography variant="body2" color="text.secondary">{t('아직 확정된 버전이 없습니다. 저장하면 새 버전으로 기록됩니다.')}</Typography>}
          </Stack>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{managementStartMonth} ~ {monthKey()}</Typography>
          <Box sx={{ position: 'relative', maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>
            {[...managedMonths].reverse().map((month, index, displayMonths) => {
              const activeVersion = versionForMonth(month);
              const versionColor = activeVersion ? colorByVersionId.get(activeVersion.id) || '#9e9e9e' : '#9e9e9e';
              const isBoundary = Object.values(versionBoundaries).includes(month);
              const isNewest = index === 0;
              const dotSize = isNewest ? 20 : isBoundary ? 16 : 12;
              const olderVersion = index < displayMonths.length - 1 ? versionForMonth(displayMonths[index + 1]) : null;
              const olderColor = olderVersion ? colorByVersionId.get(olderVersion.id) || '#9e9e9e' : '#9e9e9e';
              return <Box key={month} onDragEnter={(event) => { event.preventDefault(); event.currentTarget.dataset.dragover = 'true'; }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) delete event.currentTarget.dataset.dragover; }} onDrop={(event) => { delete event.currentTarget.dataset.dragover; const version = versions.find((item) => item.id === Number(event.dataTransfer.getData('text/plain'))); if (version) assignVersionToMonth(version, month); }} sx={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 34, pl: 3.5, pr: 0.5, borderRadius: 1, transition: 'background-color .15s', '&[data-dragover="true"]': { bgcolor: 'action.hover' } }}>
                {index > 0 && <Box sx={{ position: 'absolute', zIndex: 0, left: 11, top: 0, height: '50%', width: 2, bgcolor: versionColor }} />}
                {index < displayMonths.length - 1 && <Box sx={{ position: 'absolute', zIndex: 0, left: 11, top: '50%', height: '50%', width: 2, bgcolor: olderColor }} />}
                <Box sx={{ position: 'absolute', zIndex: 1, left: 12 - dotSize / 2, width: dotSize, height: dotSize, borderRadius: '50%', bgcolor: versionColor, border: 2, borderColor: versionColor, boxShadow: isNewest || isBoundary ? `0 0 0 3px ${versionColor}26` : 'none' }} />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, fontSize: '.78rem' }}>{month}</Typography>
                  <Chip size="small" variant="outlined" label={activeVersion ? `Ver.${activeVersion.versionNumber}` : t('미지정')} sx={{ height: 22, fontSize: '.7rem', color: versionColor, borderColor: versionColor }} />
                </Stack>
              </Box>;
            })}
          </Box>
        </Box>
      </Stack>
    </DialogContent><DialogActions><Button variant="contained" onClick={saveVersionBoundaries} disabled={versionBusy || !hasVersionBoundaryChanges}>{t('저장')}</Button></DialogActions></Dialog>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('급여 항목 추가')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
        <TextField autoFocus required label="Item Name (English)" value={draft.nameEn} onChange={(e) => setDraft((prev) => ({ ...prev, nameEn: e.target.value }))} placeholder="e.g. Qualification Allowance" />
        <TextField required label="항목명 (한국어)" value={draft.nameKo} onChange={(e) => setDraft((prev) => ({ ...prev, nameKo: e.target.value }))} placeholder="예: 자격수당" />
        <TextField required label="Tên khoản mục (Tiếng Việt)" value={draft.nameVi} onChange={(e) => setDraft((prev) => ({ ...prev, nameVi: e.target.value }))} placeholder="Ví dụ: Phụ cấp chứng chỉ" />
      </Box>
      <FormControl fullWidth size="small"><InputLabel>{t('급여 구분')}</InputLabel><Select label={t('급여 구분')} value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>{Object.entries(CATEGORIES).filter(([key]) => key !== 'INCENTIVE').map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}</Select></FormControl>
      {calculationFields(draft, (field, value) => setDraft((prev) => ({ ...prev, [field]: value })))}
    </Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)}>{t('취소')}</Button><Button variant="contained" onClick={addItem} disabled={!hasValidPaymentMonths(draft) || [draft.nameKo, draft.nameEn, draft.nameVi].some((name) => !name.trim())}>{t('추가')}</Button></DialogActions></Dialog>
  </Box></AppPageContainer>;
};

export default SalarySystem;
