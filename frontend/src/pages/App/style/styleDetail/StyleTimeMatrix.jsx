import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  GlobalStyles,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useLanguage } from '../../../../context/LanguageContext';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';
import {
  ST_STANDARD_BUCKETS,
  applyMonotonicStBucketEdit,
  normalizeProcess,
  normalizeProcesses,
  resolveProcessAtCellState,
  resolveProcessAtPerPieceSeconds,
  resolveProcessStPerPieceSeconds,
} from '../../../../utils/processTime';
import {
  formatProcessNameWithQuantity,
  resolveLocalizedProcessName,
} from '../../../../utils/processDisplay';

const BORDER = '1px solid rgba(17,24,39,0.1)';
const PROCESS_CELL_W = 240;
const METRIC_CELL_W = 40;
const ST_CELL_W = 76;
const GROUP_BORDER = '2px solid #CBD5E1';
const GROUP_BOTTOM_BORDER = '1px solid #CBD5E1';
const PAIR_DIVIDER = '1px dashed rgba(100,116,139,0.2)';
const STICKY_COLUMN_DIVIDER = '1px solid rgba(100,116,139,0.22)';
const AT_TONE_COLORS = {
  'st-fallback': '#D32F2F',
  fitted: '#374151',
  extrapolated: '#6D28D9',
  provisional: '#B45309',
  'provisional-extrapolated': '#B45309',
  empty: 'rgba(156,163,175,0.7)',
};

const resolveAtToneColor = (tone, shouldDisplayValue = true) => {
  if (!shouldDisplayValue) return AT_TONE_COLORS.empty;
  return AT_TONE_COLORS[tone] || AT_TONE_COLORS.fitted;
};

const resolveAtAggregateTone = (states = []) => {
  const displayStates = states.filter((state) => state?.shouldDisplayValue);
  if (displayStates.length === 0) return 'empty';
  if (displayStates.some((state) => state.tone === 'st-fallback')) return 'st-fallback';
  if (displayStates.some((state) =>
    state.tone === 'provisional' || state.tone === 'provisional-extrapolated'
  )) return 'provisional';
  if (displayStates.some((state) => state.tone === 'extrapolated')) return 'extrapolated';
  return 'fitted';
};

const resolveLegendItems = (languageCode) => {
  if (languageCode === 'en') {
    return [
      {
        key: 'atStFallback',
        color: AT_TONE_COLORS['st-fallback'],
        label: 'AT from ST · review',
        tooltip: 'No valid AT observation exists for this process, so its ST is shown only as a provisional AT placeholder for the total. It is not AT training data.',
      },
      {
        key: 'stReview',
        color: '#D32F2F',
        label: 'ST copied — needs review',
        tooltip:
          'This ST was copied from a smaller quantity bucket when the new bucket was added. Please confirm or edit the actual value.',
      },
      {
        key: 'fitted',
        color: AT_TONE_COLORS.fitted,
        label: 'AT fitted curve',
        tooltip:
          'Calculated from a regression curve learned across quantities using real work records.',
      },
      {
        key: 'extrapolated',
        color: AT_TONE_COLORS.extrapolated,
        label: 'AT extrapolated',
        tooltip:
          'This quantity is outside the range actually observed in work records — the value is extrapolated from the fitted formula, not a directly observed quantity.',
      },
      {
        key: 'provisional',
        color: AT_TONE_COLORS.provisional,
        label: 'AT provisional',
        tooltip:
          'Not enough quantity variation yet to fit a per-quantity curve, so this shows the plain average of observed times (same value regardless of quantity). It comes from real work records, unlike PT.',
      },
    ];
  }
  if (languageCode === 'vi') {
    return [
      {
        key: 'atStFallback',
        color: AT_TONE_COLORS['st-fallback'],
        label: 'AT tạm từ ST · cần duyệt',
        tooltip: 'Công đoạn này chưa có quan sát AT hợp lệ, nên ST chỉ được hiển thị tạm làm AT để tính tổng. Giá trị này không được dùng làm dữ liệu học AT.',
      },
      {
        key: 'stReview',
        color: '#D32F2F',
        label: 'ST sao chep - can duyet',
        tooltip:
          'ST nay duoc sao chep tu bucket so luong nho hon khi them bucket moi. Vui lòng xac nhan hoac sua lai gia tri thuc te.',
      },
      {
        key: 'fitted',
        color: AT_TONE_COLORS.fitted,
        label: 'AT duong hoc',
        tooltip:
          'Gia tri tinh tu duong hoi quy da hoc theo so luong tu ban ghi thuc te.',
      },
      {
        key: 'extrapolated',
        color: AT_TONE_COLORS.extrapolated,
        label: 'AT ngoai vung',
        tooltip:
          'Số lượng nay nam ngoai vung du lieu da quan sat - gia tri duoc suy dien tu cong thuc da hoc, khong phai so luong da tung lam thuc te.',
      },
      {
        key: 'provisional',
        color: AT_TONE_COLORS.provisional,
        label: 'AT tam tinh',
        tooltip:
          'Chưa đủ bien thien so luong de hoc duong rieng, nen hien thi gia tri trung binh quan sat duoc (giong nhau moi so luong). Day la du lieu thuc te, khac voi PT.',
      },
    ];
  }
  return [
    {
      key: 'atStFallback',
      color: AT_TONE_COLORS['st-fallback'],
      label: 'AT ST 대체값·검토 필요',
      tooltip: '이 공정은 유효한 AT 관측이 없어 합계 계산을 위해 ST를 임시 AT로 표시합니다. 이 값은 AT 학습 데이터로 사용되지 않습니다.',
    },
    {
      key: 'stReview',
      color: '#D32F2F',
      label: 'ST 자동복사·검토 필요',
      tooltip:
        '새 수량 구간을 추가할 때 더 작은 구간의 ST를 그대로 복사해 채운 값입니다. 실제 시간을 확인해 값을 확정해 주세요.',
    },
    {
      key: 'fitted',
      color: AT_TONE_COLORS.fitted,
      label: 'AT 학습 곡선',
      tooltip: '실제 작업기록으로 수량별 시간 변화를 학습해 계산한 값입니다.',
    },
    {
      key: 'extrapolated',
      color: AT_TONE_COLORS.extrapolated,
      label: 'AT 범위 밖 추정',
      tooltip:
        '이 수량은 학습에 쓰인 작업기록 범위 밖입니다. 실제로 이 수량을 작업한 기록은 없고, 학습된 공식으로 계산만 한 값입니다.',
    },
    {
      key: 'provisional',
      color: AT_TONE_COLORS.provisional,
      label: 'AT 임시값',
      tooltip:
        '작업기록의 수량이 다양하지 않아 수량별 곡선을 아직 학습하지 못했습니다. 그래서 관측된 실제 시간의 평균을 수량과 무관하게 동일하게 보여주는 임시값입니다. PT처럼 사람이 입력한 값이 아니라 실제 작업기록에서 나온 값입니다.',
    },
  ];
};

// ── utils ──────────────────────────────────────────────────────────────────

const roundTo = (v, d = 4) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const fmtSec = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return formatNumberWithCommas(roundTo(n, 4), { fallback: '-', maximumFractionDigits: 4 });
};

const fmtRoundedSec = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n);
  if (n > 0 && rounded === 0) return '<1';
  return formatNumberWithCommas(rounded, { fallback: '-', maximumFractionDigits: 0 });
};

const toEditText = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(roundTo(n, 4)).replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
};

const parseStInput = (v) => {
  const t = String(v ?? '').replace(/,/g, '').trim();
  if (!t) return { ok: true, seconds: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, seconds: null };
  return { ok: true, seconds: roundTo(Math.max(0, n), 4) };
};

const resolveStEntry = (process, quantity) => {
  const q = Number(quantity);
  const buckets = Array.isArray(process?.stBuckets)
    ? process.stBuckets
    : Array.isArray(process?.stValues) ? process.stValues : [];
  return buckets.find((e) => Number(e?.bucketQuantity ?? e?.quantity) === Number(q)) || null;
};

const resolveAtCellState = (process, quantity, languageCode) => {
  const atParams = process?.atParams && typeof process.atParams === 'object'
    ? process.atParams
    : null;
  if (!atParams) {
    return { tone: 'empty', title: '' };
  }
  const isProvisional =
    atParams.isProvisional === true || String(atParams.fitStatus || '') === 'USED_PROVISIONAL';
  if (isProvisional) {
    return {
      tone: 'provisional',
      title: languageCode === 'vi'
        ? 'Gia tri tam tinh: chua du bien thien so luong de hoi quy.'
        : languageCode === 'en'
          ? 'Provisional value: not enough quantity variation for a fitted AT curve.'
          : '임시 AT입니다. 아직 수량 변화 데이터가 부족해 평균값으로 표시됩니다.',
    };
  }
  const minQuantity = Number(atParams.minQuantity);
  const maxQuantity = Number(atParams.maxQuantity);
  if (
    Number.isFinite(minQuantity) &&
    Number.isFinite(maxQuantity) &&
    (quantity < minQuantity || quantity > maxQuantity)
  ) {
    return {
      tone: 'extrapolated',
      title: languageCode === 'vi'
        ? 'Nam ngoai pham vi du lieu da hoc.'
        : languageCode === 'en'
          ? 'Outside the observed training quantity range.'
          : '학습된 수량 범위 밖의 추정값입니다.',
    };
  }
  return {
    tone: 'fitted',
    title: languageCode === 'vi'
      ? 'Gia tri AT da hoc tu ban ghi.'
      : languageCode === 'en'
        ? 'Fitted AT from work records.'
        : '작업기록으로 학습된 AT입니다.',
  };
};

const resolveAtCellTitle = (cellState, languageCode) => {
  switch (cellState?.tone) {
    case 'st-fallback':
      return languageCode === 'vi'
        ? 'Chưa có quan sát AT hợp lệ. ST đang được hiển thị tạm làm AT để tính tổng và không được dùng để học AT.'
        : languageCode === 'en'
          ? 'No valid AT observation exists. ST is shown as a provisional AT placeholder for totals and is not used for AT training.'
          : '유효한 AT 관측이 없어 합계 계산용으로 ST를 임시 AT로 표시합니다. AT 학습에는 사용되지 않습니다.';
    case 'provisional':
      return languageCode === 'vi'
        ? 'Gia tri tam tinh: chua du bien thien so luong de hoi quy.'
        : languageCode === 'en'
          ? 'Provisional value: not enough quantity variation for a fitted AT curve.'
          : '임시 AT입니다. 아직 수량 변화 데이터가 부족해 관측 평균으로 표시합니다.';
    case 'provisional-extrapolated':
      return languageCode === 'vi'
        ? 'Gia tri tam tinh ngoai vung so luong da quan sat.'
        : languageCode === 'en'
          ? 'Provisional estimate outside the observed quantity bucket range.'
          : '관측 수량 구간 밖의 임시 AT입니다. 숫자는 표시하지만 신뢰도는 낮습니다.';
    case 'extrapolated':
      return languageCode === 'vi'
        ? 'Nam ngoai pham vi du lieu da hoc.'
        : languageCode === 'en'
          ? 'Outside the observed training quantity range.'
          : '학습된 수량 범위 밖의 추정값입니다.';
    case 'fitted':
      return languageCode === 'vi'
        ? 'Gia tri AT da hoc tu ban ghi.'
        : languageCode === 'en'
          ? 'Fitted AT from work records.'
          : '작업기록으로 학습된 AT입니다.';
    default:
      return '';
  }
};

const hasValidAtObservation = (process) =>
  (Array.isArray(process?.atV2Observations) ? process.atV2Observations : [])
    .some((row) => Number(row?.quantity) > 0 && Number(row?.allocatedLaborInputSeconds) > 0);

const resolveAtDisplayValue = (process, quantity, bucketQuantities) => {
  const at = resolveProcessAtPerPieceSeconds(process, quantity);
  const state = resolveProcessAtCellState(process, quantity, bucketQuantities);
  if (at != null && state.shouldDisplayValue) return { value: at, state };
  if (hasValidAtObservation(process) || process?.atStFallbackApproved !== true) {
    return { value: null, state };
  }
  const st = resolveProcessStPerPieceSeconds(process, quantity, bucketQuantities);
  if (!Number.isFinite(st) || st <= 0) return { value: null, state };
  return {
    value: st,
    state: {
      ...state,
      tone: 'st-fallback',
      shouldDisplayValue: true,
      isProvisional: true,
    },
  };
};

const upsertStBuckets = (process, quantity, seconds) => {
  const norm = normalizeProcess(process);
  const q = Number(quantity);
  const adjustment = applyMonotonicStBucketEdit(norm?.stBuckets, q, seconds);
  const updateQuantities = Array.from(new Set([
    ...(Array.isArray(norm?.stBucketUpdateQuantities) ? norm.stBucketUpdateQuantities : []),
    ...adjustment.changedQuantities,
  ])).filter((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return normalizeProcess({
    ...norm,
    stBuckets: adjustment.stBuckets,
    stBucketWriteMode: 'MANUAL_EDIT',
    stBucketUpdateQuantities: updateQuantities,
    ct: null,
    stManual: false,
  });
};

const snapshotProcessStState = (process) => ({
  stBuckets: Array.isArray(process?.stBuckets)
    ? process.stBuckets.map((bucket) => ({ ...bucket }))
    : [],
  stBucketWriteMode: process?.stBucketWriteMode,
  stBucketUpdateQuantities: Array.isArray(process?.stBucketUpdateQuantities)
    ? [...process.stBucketUpdateQuantities]
    : [],
  ct: process?.ct,
  stManual: process?.stManual,
});

const restoreProcessStState = (process, snapshot) => normalizeProcess({
  ...process,
  stBuckets: snapshot?.stBuckets ?? [],
  stBucketWriteMode: snapshot?.stBucketWriteMode,
  stBucketUpdateQuantities: snapshot?.stBucketUpdateQuantities ?? [],
  ct: snapshot?.ct,
  stManual: snapshot?.stManual,
});

const dk = (id, qty) => `${id}::${qty}`;
// 공정 하나(ST행+AT행)를 한 블록으로 인식하도록 같은 배경을 쓰고,
// 홀수/짝수 공정끼리는 뚜렷이 구분되도록 대비를 준다.
const PROCESS_GROUP_TONES = [
  { bg: '#FFFFFF' },
  { bg: '#EAF0F6' },
];

// ── StyleTimeMatrix ─────────────────────────────────────────────────────────

const StyleTimeMatrix = ({
  processes = [],
  onProcessesChange = null,
  bucketQuantities = ST_STANDARD_BUCKETS,
  styleCode = '',
  styleName = '',
}) => {
  const { languageCode } = useLanguage();
  const visibleBuckets = useMemo(
    () => {
      const normalized =
        [...new Set((Array.isArray(bucketQuantities) ? bucketQuantities : [])
        .map(Number)
        .filter((quantity) => Number.isInteger(quantity) && quantity > 0))]
          .sort((left, right) => left - right);
      return normalized;
    },
    [bucketQuantities]
  );
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [stDrafts, setStDrafts] = useState({});
  const [stRestoreSnapshot, setStRestoreSnapshot] = useState(null);

  const msg = languageCode === 'vi'
    ? { title: 'ST/AT theo số lượng (giây)', process: 'Công đoạn', ptHint: 'PT: thời gian cơ bản (không sửa)', stHint: 'ST của số lượng nhỏ phải bằng hoặc lớn hơn số lượng lớn. Các nhóm liên quan sẽ tự động điều chỉnh.', atHint: 'AT: tự động học từ nhật ký công việc', unit: 'Đơn vị: giây / 1 sản phẩm', empty: 'Chưa có công đoạn.' }
    : languageCode === 'en'
    ? { title: 'ST / AT by Quantity (sec)', process: 'Process', ptHint: 'PT: base physical time (read-only)', stHint: 'ST for a smaller quantity must be equal to or greater than larger quantities. Related buckets adjust automatically.', atHint: 'AT: auto-learned from work records', unit: 'Unit: seconds / per piece', empty: 'No processes registered.' }
    : { title: '수량별 ST / AT (초)', process: '공정', ptHint: 'PT: 공정 정보에서 입력한 기본 물리 시간 (수정 불가)', stHint: '작은 수량의 ST는 큰 수량과 같거나 커야 합니다. 필요한 버킷은 자동으로 함께 조정됩니다.', atHint: 'AT: 작업기록으로 자동 학습한 실제 시간 (참고용)', unit: '단위: 초 / 1장 기준', empty: '등록된 공정이 없습니다.' };

  const handleStChange = useCallback((id, qty, val) => {
    setStDrafts((prev) => ({ ...prev, [dk(id, qty)]: val }));
  }, []);

  const handleStBlur = useCallback((pIdx, id, qty, val) => {
    const key = dk(id, qty);
    if (!Object.prototype.hasOwnProperty.call(stDrafts, key)) return;
    setStDrafts((prev) => { const n = { ...prev }; delete n[key]; return n; });
    const parsed = parseStInput(val);
    if (!parsed.ok || typeof onProcessesChange !== 'function') return;
    const target = safeProcesses[pIdx];
    if (!target) return;
    const cur = resolveStEntry(target, qty);
    const curSec = cur ? Number(cur.bucketStSeconds ?? cur.seconds) : null;
    const nxt = parsed.seconds;
    if (curSec == null && nxt == null) return;
    if (curSec != null && nxt != null && Math.abs(curSec - nxt) < 1e-9) return;
    onProcessesChange(safeProcesses.map((p, i) => i === pIdx ? upsertStBuckets(p, qty, nxt) : p));
  }, [onProcessesChange, safeProcesses, stDrafts]);

  const automationLabels = languageCode === 'vi'
    ? { apply: 'Áp dụng 50% chenh lech AT', restore: 'Khoi phuc ST' }
    : languageCode === 'en'
      ? { apply: 'Apply 50% of AT gap', restore: 'Restore ST' }
      : { apply: 'AT 차이 50% 반영', restore: 'ST 원상복귀' };

  const printLabel = languageCode === 'vi' ? 'In' : languageCode === 'en' ? 'Print' : '인쇄';

  const hasApplicableAtBucket = useMemo(() =>
    safeProcesses.some((process) =>
      visibleBuckets.some((quantity) => {
        const st = resolveProcessStPerPieceSeconds(process, quantity, visibleBuckets);
        const at = resolveProcessAtPerPieceSeconds(process, quantity);
        return (
          Number.isFinite(st) &&
          Number.isFinite(at) &&
          resolveProcessAtCellState(process, quantity, visibleBuckets).shouldDisplayValue
        );
      })
    ),
  [safeProcesses]);

  const handleApplyAtGap = useCallback(() => {
    if (typeof onProcessesChange !== 'function') return;
    if (stRestoreSnapshot === null) {
      setStRestoreSnapshot(safeProcesses.map(snapshotProcessStState));
    }
    const nextProcesses = safeProcesses.map((process) => {
      let nextProcess = process;
      visibleBuckets.forEach((quantity) => {
        const st = resolveProcessStPerPieceSeconds(process, quantity, visibleBuckets);
        const at = resolveProcessAtPerPieceSeconds(process, quantity);
        const atState = resolveProcessAtCellState(process, quantity, visibleBuckets);
        if (!Number.isFinite(st) || !Number.isFinite(at) || !atState.shouldDisplayValue) return;
        nextProcess = upsertStBuckets(nextProcess, quantity, roundTo((st + at) / 2, 4));
      });
      return nextProcess;
    });
    setStDrafts({});
    onProcessesChange(nextProcesses);
  }, [onProcessesChange, safeProcesses, stRestoreSnapshot]);

  const handleRestoreSt = useCallback(() => {
    if (typeof onProcessesChange !== 'function' || stRestoreSnapshot === null) return;
    const restoredProcesses = safeProcesses.map((process, index) =>
      restoreProcessStState(process, stRestoreSnapshot[index])
    );
    setStDrafts({});
    setStRestoreSnapshot(null);
    onProcessesChange(restoredProcesses);
  }, [onProcessesChange, safeProcesses, stRestoreSnapshot]);

  const handlePrint = useCallback(() => {
    const originalTitle = document.title;
    const printableStyleName = String(styleName || styleCode || 'Style')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-');
    document.title = `${printableStyleName} Standard Time Table`;
    let fallbackTimer = null;
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('focus', restoreAfterDialog);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
    const restoreAfterDialog = () => {
      window.setTimeout(restoreTitle, 1000);
    };
    window.addEventListener('focus', restoreAfterDialog, { once: true });
    fallbackTimer = window.setTimeout(restoreTitle, 5 * 60 * 1000);
    window.print();
  }, [styleCode, styleName]);

  const colCount = 2 + visibleBuckets.length; // 공정명 + ST/AT라벨 + 수량열

  const totalStByBucket = useMemo(() =>
    visibleBuckets.map((q) =>
      safeProcesses.reduce((sum, process) => {
        const st = resolveProcessStPerPieceSeconds(process, q, visibleBuckets);
        return sum + (st != null ? st : 0);
      }, 0)
    ),
  [safeProcesses]);

  const totalAtByBucket = useMemo(() =>
    visibleBuckets.map((q) => {
      const states = [];
      let displayCount = 0;
      const total = safeProcesses.reduce((sum, process) => {
        const { value: at, state } = resolveAtDisplayValue(process, q, visibleBuckets);
        states.push(state);
        if (at == null || !state.shouldDisplayValue) return sum;
        displayCount += 1;
        return sum + at;
      }, 0);
      return {
        total: displayCount === safeProcesses.length ? total : null,
        displayCount,
        isComplete: safeProcesses.length > 0 && displayCount === safeProcesses.length,
        tone: resolveAtAggregateTone(states),
      };
    }),
  [safeProcesses]);
  const legendItems = useMemo(
    () => resolveLegendItems(languageCode),
    [languageCode]
  );

  return (
    <>
      <GlobalStyles styles={{
        '@media print': {
          '@page': { size: 'A4 landscape', margin: '8mm' },
          'html, body, #root': {
            height: 'auto !important',
            maxHeight: 'none !important',
            overflow: 'visible !important',
          },
          'body *': { visibility: 'hidden' },
          'body *:has(.style-time-matrix-print)': {
            height: 'auto !important',
            maxHeight: 'none !important',
            overflow: 'visible !important',
          },
          '.style-time-matrix-print, .style-time-matrix-print *': { visibility: 'visible' },
          '.style-time-matrix-print': {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: 'auto !important',
            maxHeight: 'none !important',
            overflow: 'visible !important',
            border: 'none !important',
            boxShadow: 'none !important',
          },
          '.style-time-matrix-print-actions': { display: 'none !important' },
          '.style-time-matrix-print-title': { display: 'block !important' },
          '.style-time-matrix-screen-st-input': { display: 'none !important' },
          '.style-time-matrix-print-st-value': { display: 'block !important' },
          '.style-time-matrix-print .MuiTableContainer-root': { overflow: 'visible !important' },
          '.style-time-matrix-print table': { minWidth: '0 !important', width: '100% !important' },
          '.style-time-matrix-print thead': { display: 'table-header-group' },
          '.style-time-matrix-print tr': { breakInside: 'avoid', pageBreakInside: 'avoid' },
          '.style-time-matrix-print .MuiTableCell-root': {
            position: 'static !important',
            fontSize: '8pt !important',
            padding: '3px 5px !important',
          },
        },
      }} />
      <Paper
        className="style-time-matrix-print"
        variant="outlined"
        sx={{ borderRadius: 1, overflow: 'hidden', borderColor: '#D7DEE8' }}
      >
      <Box className="style-time-matrix-print-title" sx={{ display: 'none', px: 1, pb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {[styleCode, styleName].filter(Boolean).join(' · ') || msg.title}
        </Typography>
      </Box>
      {/* 헤더 */}
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: BORDER, backgroundColor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{msg.title}</Typography>
        <Stack className="style-time-matrix-print-actions" direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintOutlinedIcon />}
            onClick={handlePrint}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            {printLabel}
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={!hasApplicableAtBucket || typeof onProcessesChange !== 'function'}
            onClick={handleApplyAtGap}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            {automationLabels.apply}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={stRestoreSnapshot === null || typeof onProcessesChange !== 'function'}
            onClick={handleRestoreSt}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            {automationLabels.restore}
          </Button>
          {legendItems.map((item) => (
            <Tooltip key={item.key} title={item.tooltip}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: item.color,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
              </Box>
            </Tooltip>
          ))}
          <Typography variant="caption" color="text.disabled">{msg.unit}</Typography>
        </Stack>
      </Box>

      {/* 테이블 */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table
          size="small"
          sx={{
            minWidth: PROCESS_CELL_W + METRIC_CELL_W + visibleBuckets.length * (ST_CELL_W + 8),
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
            '& .MuiTableCell-root': { borderBottom: BORDER, borderRight: 'none' },
          }}
        >
          <colgroup>
            <col style={{ width: PROCESS_CELL_W }} />
            <col style={{ width: METRIC_CELL_W }} />
            {visibleBuckets.map((quantity) => (
              <col key={quantity} style={{ width: ST_CELL_W + 8 }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#EEF2F6' }}>
              <TableCell
                sx={{
                  width: PROCESS_CELL_W,
                  minWidth: PROCESS_CELL_W,
                  fontWeight: 700,
                  fontSize: 12,
                  pl: 2,
                  position: 'sticky',
                  left: 0,
                  zIndex: 4,
                  backgroundColor: '#EEF2F6',
                  borderRight: STICKY_COLUMN_DIVIDER,
                  borderBottom: '2px solid #B8C2CF',
                }}
              >
                {msg.process}
              </TableCell>
              <TableCell
                sx={{
                  width: METRIC_CELL_W,
                  minWidth: METRIC_CELL_W,
                  fontWeight: 700,
                  fontSize: 12,
                  position: 'sticky',
                  left: PROCESS_CELL_W,
                  zIndex: 4,
                  backgroundColor: '#EEF2F6',
                  borderRight: STICKY_COLUMN_DIVIDER,
                  borderBottom: '2px solid #B8C2CF',
                }}
              />
              {visibleBuckets.map((q) => (
                <TableCell
                  key={q}
                  align="right"
                  sx={{ width: ST_CELL_W + 8, fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums', pr: 1.5, borderBottom: '2px solid #B8C2CF' }}
                >
                  {`${formatNumberWithCommas(q, { maximumFractionDigits: 0 })}~`}
                </TableCell>
              ))}
            </TableRow>
            <TableRow sx={{ backgroundColor: '#FFFBEB' }}>
              <TableCell
                sx={{
                  pl: 2,
                  py: 0.75,
                  fontWeight: 700,
                  fontSize: 11,
                  color: '#92400E',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  backgroundColor: '#FFFBEB',
                  borderRight: STICKY_COLUMN_DIVIDER,
                }}
              >
                {languageCode === 'vi' ? 'Tong ST' : languageCode === 'en' ? 'Total ST' : '합계 ST'}
              </TableCell>
              <TableCell
                sx={{
                  py: 0.75,
                  fontSize: 11,
                  color: '#92400E',
                  fontWeight: 700,
                  position: 'sticky',
                  left: PROCESS_CELL_W,
                  zIndex: 3,
                  backgroundColor: '#FFFBEB',
                  borderRight: STICKY_COLUMN_DIVIDER,
                }}
              >
                {languageCode === 'vi' ? '(giây)' : languageCode === 'en' ? '(sec)' : '(초)'}
              </TableCell>
              {totalStByBucket.map((total, i) => (
                <TableCell
                  key={visibleBuckets[i]}
                  align="right"
                  sx={{ py: 0.75, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: total > 0 ? '#92400E' : 'text.disabled', pr: 1.5 }}
                >
                  {total > 0 ? fmtSec(total) : '-'}
                </TableCell>
              ))}
            </TableRow>
            <TableRow sx={{ backgroundColor: '#F5F3FF' }}>
              <TableCell
                sx={{
                  pl: 2,
                  py: 0.75,
                  fontWeight: 700,
                  fontSize: 11,
                  color: '#374151',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  backgroundColor: '#F5F3FF',
                  borderRight: STICKY_COLUMN_DIVIDER,
                  borderBottom: '3px solid #94A3B8',
                }}
              >
                {languageCode === 'vi' ? 'Tong AT' : languageCode === 'en' ? 'Total AT' : '합계 AT'}
              </TableCell>
              <TableCell
                sx={{
                  py: 0.75,
                  fontSize: 11,
                  color: '#6B7280',
                  fontWeight: 700,
                  position: 'sticky',
                  left: PROCESS_CELL_W,
                  zIndex: 3,
                  backgroundColor: '#F5F3FF',
                  borderRight: STICKY_COLUMN_DIVIDER,
                  borderBottom: '3px solid #94A3B8',
                }}
              >
                {languageCode === 'vi' ? '(giây)' : languageCode === 'en' ? '(sec)' : '(초)'}
              </TableCell>
              {totalAtByBucket.map((item, i) => {
                const hasValue = item.isComplete && item.total > 0;
                return (
                  <TableCell
                    key={visibleBuckets[i]}
                    align="right"
                    sx={{
                      py: 0.75,
                      fontSize: 12,
                      fontWeight: hasValue ? 700 : 400,
                      fontVariantNumeric: 'tabular-nums',
                      color: hasValue
                        ? resolveAtToneColor(item.tone)
                        : AT_TONE_COLORS.empty,
                      pr: 1.5,
                      borderBottom: '3px solid #94A3B8',
                    }}
                  >
                    {hasValue ? fmtRoundedSec(item.total) : '-'}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>

          <TableBody>
            {safeProcesses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  {msg.empty}
                </TableCell>
              </TableRow>
            ) : (
              safeProcesses.map((process, pIdx) => {
                const groupTone = PROCESS_GROUP_TONES[pIdx % PROCESS_GROUP_TONES.length];
                const id = process?.instanceId || process?.id || process?.code || `P${pIdx + 1}`;
                const label = formatProcessNameWithQuantity(
                  resolveLocalizedProcessName(process, languageCode) || process?.name || process?.code || '-',
                  process?.timesPerPiece ?? process?.quantity
                ) || '-';
                const pt = Number.isFinite(Number(process?.pt)) ? Number(process.pt) : null;

                const stValues = visibleBuckets.map((q) =>
                  resolveProcessStPerPieceSeconds(process, q, visibleBuckets)
                );
                const validSt = stValues.filter((v) => v != null);
                const minSt = validSt.length ? Math.min(...validSt) : null;
                const maxSt = validSt.length ? Math.max(...validSt) : null;
                const isUniform = validSt.length === 0 || Math.abs((maxSt ?? 0) - (minSt ?? 0)) < 1e-9;
                const groupTopBorder = pIdx === 0 ? 'none' : GROUP_BORDER;

                const nameColSx = {
                  verticalAlign: 'middle',
                  width: PROCESS_CELL_W,
                  minWidth: PROCESS_CELL_W,
                  pl: 2,
                  py: 1,
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  backgroundColor: groupTone.bg,
                  borderTop: groupTopBorder,
                  borderBottom: GROUP_BOTTOM_BORDER,
                  borderRight: STICKY_COLUMN_DIVIDER,
                  boxShadow: 'inset 3px 0 0 #94A3B8',
                };
                const metricBaseSx = {
                  width: METRIC_CELL_W,
                  minWidth: METRIC_CELL_W,
                  position: 'sticky',
                  left: PROCESS_CELL_W,
                  zIndex: 2,
                  borderRight: STICKY_COLUMN_DIVIDER,
                  fontWeight: 700,
                  fontSize: 10.5,
                  letterSpacing: 0,
                  textAlign: 'center',
                };

                return (
                  <React.Fragment key={id}>
                    {/* ST 행 */}
                    <TableRow>
                      {/* 공정명 — ST+AT 2행 rowSpan */}
                      <TableCell rowSpan={2} sx={nameColSx}>
                        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4, color: '#111827' }}>
                          {label}
                        </Typography>
                        {pt != null && (
                          <Tooltip title={msg.ptHint} placement="right">
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.disabled', fontVariantNumeric: 'tabular-nums', cursor: 'default', userSelect: 'none' }}
                            >
                              PT {fmtSec(pt)}
                            </Typography>
                          </Tooltip>
                        )}
                        {!isUniform && minSt != null && (
                          <Box sx={{ mt: 0.25 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                              {fmtSec(minSt)} ~ {fmtSec(maxSt)}
                            </Typography>
                          </Box>
                        )}
                      </TableCell>

                      {/* ST 라벨 */}
                      <TableCell
                        sx={{
                          ...metricBaseSx,
                          color: '#475569',
                          backgroundColor: groupTone.bg,
                          py: 0.5,
                          borderTop: groupTopBorder,
                          borderBottom: PAIR_DIVIDER,
                        }}
                      >
                        <Tooltip title={msg.stHint} placement="right">
                          <Box component="span">ST</Box>
                        </Tooltip>
                      </TableCell>

                      {/* ST 값 셀 */}
                      {visibleBuckets.map((qty) => {
                        const draftK = dk(id, qty);
                        const resolved = resolveProcessStPerPieceSeconds(
                          process,
                          qty,
                          visibleBuckets
                        );
                        const stEntry = resolveStEntry(process, qty);
                        const requiresReview =
                          stEntry?.setBy === 'BUCKET_INHERITED_REVIEW';
                        const value = Object.prototype.hasOwnProperty.call(stDrafts, draftK)
                          ? stDrafts[draftK]
                          : toEditText(resolved);

                        return (
                          <TableCell
                            key={qty}
                            align="right"
                            sx={{
                              py: '4px',
                              px: '4px',
                              backgroundColor: groupTone.bg,
                              borderTop: groupTopBorder,
                              borderBottom: PAIR_DIVIDER,
                            }}
                          >
                            <TextField
                              className="style-time-matrix-screen-st-input"
                              value={value}
                              onChange={(e) => handleStChange(id, qty, e.target.value)}
                              onBlur={(e) => handleStBlur(pIdx, id, qty, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                              size="small"
                              inputProps={{
                                inputMode: 'decimal',
                                title: msg.stHint,
                                'aria-label': `${label} ST ${qty}`,
                              }}
                              sx={{
                                width: ST_CELL_W,
                                '& .MuiInputBase-input': {
                                  textAlign: 'right',
                                  px: 0.75,
                                  py: 0.5,
                                  fontSize: 12,
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: 400,
                                  color: requiresReview ? 'error.main' : 'text.primary',
                                },
                                '& .MuiOutlinedInput-root': {
                                  borderRadius: 1,
                                  backgroundColor: 'transparent',
                                  '& fieldset': { borderColor: 'transparent' },
                                  '&:hover fieldset': { borderColor: 'rgba(17,24,39,0.28)' },
                                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                                },
                              }}
                            />
                            <Box
                              className="style-time-matrix-print-st-value"
                              sx={{
                                display: 'none',
                                color: requiresReview ? 'error.main' : 'text.primary',
                                fontSize: 12,
                                fontVariantNumeric: 'tabular-nums',
                                textAlign: 'right',
                              }}
                            >
                              {value === '' ? '-' : value}
                            </Box>
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* AT 행 */}
                    <TableRow>
                      <TableCell
                        sx={{
                          ...metricBaseSx,
                          color: '#64748B',
                          backgroundColor: groupTone.bg,
                          py: 0.5,
                          borderBottom: GROUP_BOTTOM_BORDER,
                        }}
                      >
                        AT
                      </TableCell>
                      {visibleBuckets.map((qty) => {
                        const { value: atVal, state: atCellState } = resolveAtDisplayValue(
                          process, qty, visibleBuckets
                        );
                        const shouldDisplayAtVal =
                          atVal != null && atCellState.shouldDisplayValue;
                        const atCellTitle = resolveAtCellTitle(atCellState, languageCode);
                        const atColor = resolveAtToneColor(
                          atCellState.tone,
                          shouldDisplayAtVal
                        );
                        const atContent = (
                          <Box sx={{
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            fontSize: 12,
                            fontVariantNumeric: 'tabular-nums',
                            color: atColor,
                            fontStyle: shouldDisplayAtVal ? 'normal' : 'italic',
                            fontWeight: 400,
                          }}>
                            {shouldDisplayAtVal ? fmtRoundedSec(atVal) : '-'}
                          </Box>
                        );
                        return (
                          <TableCell
                            key={qty}
                            align="right"
                            sx={{
                              py: '4px',
                              pr: 1.5,
                              backgroundColor: groupTone.bg,
                              borderBottom: GROUP_BOTTOM_BORDER,
                            }}
                          >
                            {atVal != null && atCellTitle ? (
                              <Tooltip title={atCellTitle} placement="top">
                                {atContent}
                              </Tooltip>
                            ) : atContent}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      </Paper>
    </>
  );
};

export default StyleTimeMatrix;
