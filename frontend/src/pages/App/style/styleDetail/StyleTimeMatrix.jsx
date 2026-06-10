import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
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
import { alpha } from '@mui/material/styles';
import { useLanguage } from '../../../../context/LanguageContext';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';
import {
  ST_STANDARD_BUCKETS,
  normalizeProcess,
  normalizeProcesses,
  resolveProcessAtPerPieceSeconds,
  resolveProcessStPerPieceSeconds,
  resolveStBucketQuantity,
} from '../../../../utils/processTime';
import {
  formatProcessNameWithQuantity,
  resolveLocalizedProcessName,
} from '../../../../utils/processDisplay';

const MANUAL_ST_SET_BY = new Set(['MANUAL', 'LEGACY', 'ASSIGNMENT_DETAIL']);
const PROCESS_GROUP_ACCENTS = ['#3B82F6', '#10B981', '#F97316', '#A855F7', '#0EA5E9', '#E11D48'];
const MATRIX_BORDER = '1px solid rgba(17,24,39,0.1)';
const ST_CELL_WIDTH = 78;

// ── helpers ────────────────────────────────────────────────────────────────

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
  const q = resolveStBucketQuantity(quantity);
  const buckets = Array.isArray(process?.stBuckets)
    ? process.stBuckets
    : Array.isArray(process?.stValues) ? process.stValues : [];
  return buckets.find((e) => Number(e?.bucketQuantity ?? e?.quantity) === Number(q)) || null;
};

const isManualSt = (entry) => {
  if (!entry) return false;
  const s = String(entry?.setBy || '').trim().toUpperCase();
  return !s || MANUAL_ST_SET_BY.has(s);
};

const upsertStBuckets = (process, quantity, seconds) => {
  const norm = normalizeProcess(process);
  const q = resolveStBucketQuantity(quantity);
  const next = (Array.isArray(norm?.stBuckets) ? norm.stBuckets : [])
    .filter((e) => Number(e?.bucketQuantity ?? e?.quantity) !== q);
  if (seconds != null) {
    next.push({ bucketQuantity: q, bucketStSeconds: seconds, setBy: 'MANUAL', setAt: null, updatedAt: null });
  }
  next.sort((a, b) => Number(a.bucketQuantity) - Number(b.bucketQuantity));
  return normalizeProcess({ ...norm, stBuckets: next, ct: null, stManual: false });
};

const draftKey = (id, qty) => `${id}::${qty}`;

const getAccent = (i) => PROCESS_GROUP_ACCENTS[Math.abs(i) % PROCESS_GROUP_ACCENTS.length];

// ── StCell ─────────────────────────────────────────────────────────────────

const StCell = React.memo(({ processIndex, processInstanceId, quantity, process, stDrafts, onStChange, onStBlur, isVariant }) => {
  const dk = draftKey(processInstanceId, quantity);
  const entry = resolveStEntry(process, quantity);
  const resolved = resolveProcessStPerPieceSeconds(process, quantity);
  const manual = isManualSt(entry);
  const value = Object.prototype.hasOwnProperty.call(stDrafts, dk) ? stDrafts[dk] : toEditText(resolved);

  return (
    <TableCell key={dk} align="center" sx={{ p: '4px 3px', border: 'none' }}>
      <TextField
        value={value}
        onChange={(e) => onStChange(processInstanceId, quantity, e.target.value)}
        onBlur={(e) => onStBlur(processIndex, processInstanceId, quantity, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        size="small"
        inputProps={{ inputMode: 'decimal' }}
        sx={{
          width: ST_CELL_WIDTH,
          '& .MuiInputBase-input': {
            textAlign: 'center',
            px: 0.5,
            py: 0.5,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: manual ? 700 : 400,
          },
          '& .MuiOutlinedInput-root': {
            borderRadius: 1,
            backgroundColor: manual
              ? (isVariant ? '#DBEAFE' : '#EFF6FF')
              : '#FAFAFA',
            '& fieldset': {
              borderColor: manual
                ? (isVariant ? '#3B82F6' : alpha('#3B82F6', 0.45))
                : 'rgba(17,24,39,0.13)',
              borderWidth: manual ? (isVariant ? 1.5 : 1) : 1,
            },
            '&:hover fieldset': { borderColor: '#3B82F6' },
            '&.Mui-focused fieldset': { borderColor: '#1D4ED8', borderWidth: 1.5 },
          },
        }}
      />
    </TableCell>
  );
});

// ── StyleTimeMatrix ─────────────────────────────────────────────────────────

const StyleTimeMatrix = ({ processes = [], onProcessesChange = null }) => {
  const { languageCode } = useLanguage();
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [stDrafts, setStDrafts] = useState({});
  const [showAt, setShowAt] = useState(false);

  // detect if any process has real AT data
  const hasAnyAt = useMemo(() =>
    safeProcesses.some((p) =>
      ST_STANDARD_BUCKETS.some((q) => resolveProcessAtPerPieceSeconds(p, q) != null)
    ), [safeProcesses]);

  const handleStChange = useCallback((id, qty, val) => {
    setStDrafts((prev) => ({ ...prev, [draftKey(id, qty)]: val }));
  }, []);

  const handleStBlur = useCallback((pIdx, id, qty, val) => {
    const dk = draftKey(id, qty);
    if (!Object.prototype.hasOwnProperty.call(stDrafts, dk)) return;
    setStDrafts((prev) => { const n = { ...prev }; delete n[dk]; return n; });
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

  const msg = (key) => ({
    ko: { title: '수량별 ST (초)', pt: 'PT', st: 'ST', at: 'AT', uniform: '전 구간 동일', showAt: 'AT 표시', hideAt: 'AT 숨기기', empty: '등록된 공정이 없습니다.', ptHint: 'PT: 공정 정보에서 입력한 기본 물리 시간 (수정 불가)', stHint: 'ST: 수량 구간별 표준 시간 (수동 입력 가능)', atHint: 'AT: 작업기록에서 자동 학습한 실제 시간', unitHint: '단위: 초 / 1장 기준' },
    en: { title: 'ST by Quantity (sec)', pt: 'PT', st: 'ST', at: 'AT', uniform: 'Uniform', showAt: 'Show AT', hideAt: 'Hide AT', empty: 'No processes.', ptHint: 'PT: base physical time from process setup (read-only)', stHint: 'ST: standard time per quantity bucket (editable)', atHint: 'AT: auto-learned from work records', unitHint: 'Unit: seconds / per piece' },
    vi: { title: 'ST theo so luong (giay)', pt: 'PT', st: 'ST', at: 'AT', uniform: 'Dong deu', showAt: 'Hien AT', hideAt: 'An AT', empty: 'Chua co cong doan.', ptHint: 'PT: thoi gian co ban (khong sua)', stHint: 'ST: thoi gian chuan theo so luong (co the sua)', atHint: 'AT: tu dong hoc tu ban ghi lam viec', unitHint: 'Don vi: giay / 1 san pham' },
  }[languageCode === 'vi' ? 'vi' : languageCode === 'en' ? 'en' : 'ko'][key]);

  if (safeProcesses.length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 2, p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{msg('empty')}</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: MATRIX_BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{msg('title')}</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Tooltip title={msg('ptHint')} placement="top">
            <Chip label="PT" size="small" variant="outlined" sx={{ fontSize: 11, height: 20, color: 'text.secondary', borderColor: 'divider', cursor: 'default' }} />
          </Tooltip>
          <Tooltip title={msg('stHint')} placement="top">
            <Chip label="ST 수동 입력" size="small" sx={{ fontSize: 11, height: 20, backgroundColor: '#DBEAFE', color: '#1D4ED8', cursor: 'default' }} />
          </Tooltip>
          {hasAnyAt && (
            <Tooltip title={msg('atHint')} placement="top">
              <Chip
                label={showAt ? msg('hideAt') : msg('showAt')}
                size="small"
                onClick={() => setShowAt((v) => !v)}
                sx={{ fontSize: 11, height: 20, backgroundColor: showAt ? '#DCFCE7' : undefined, color: showAt ? '#15803D' : 'text.secondary', cursor: 'pointer' }}
              />
            </Tooltip>
          )}
          <Typography variant="caption" color="text.disabled">{msg('unitHint')}</Typography>
        </Stack>
      </Box>

      {/* Process cards */}
      <Stack spacing={0} divider={<Box sx={{ borderBottom: MATRIX_BORDER }} />}>
        {safeProcesses.map((process, pIdx) => {
          const accent = getAccent(pIdx);
          const id = process?.instanceId || process?.id || process?.code || `P${pIdx + 1}`;
          const label = formatProcessNameWithQuantity(
            resolveLocalizedProcessName(process, languageCode) || process?.name || process?.code || '-',
            process?.timesPerPiece ?? process?.quantity
          ) || '-';
          const pt = Number.isFinite(Number(process?.pt)) ? Number(process.pt) : null;

          // check if ST varies across buckets
          const stValues = ST_STANDARD_BUCKETS.map((q) => resolveProcessStPerPieceSeconds(process, q));
          const uniqueStValues = new Set(stValues.filter((v) => v != null).map((v) => roundTo(v, 4)));
          const isUniform = uniqueStValues.size <= 1;
          const minSt = Math.min(...stValues.filter((v) => v != null));
          const maxSt = Math.max(...stValues.filter((v) => v != null));

          // AT data
          const atValues = ST_STANDARD_BUCKETS.map((q) => resolveProcessAtPerPieceSeconds(process, q));
          const hasAt = atValues.some((v) => v != null);

          return (
            <Box key={id}>
              {/* Process header row */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                px: 2,
                py: 1,
                gap: 1.5,
                backgroundColor: alpha(accent, 0.04),
                borderLeft: `3px solid ${accent}`,
              }}>
                <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                  {label}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
                  {pt != null && (
                    <Tooltip title={msg('ptHint')} placement="top">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>PT</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtSec(pt)}
                        </Typography>
                      </Box>
                    </Tooltip>
                  )}
                  {isUniform ? (
                    <Chip
                      label={`${msg('uniform')} · ${fmtSec(stValues.find((v) => v != null))}`}
                      size="small"
                      sx={{ fontSize: 11, height: 20, backgroundColor: alpha(accent, 0.12), color: accent, fontVariantNumeric: 'tabular-nums' }}
                    />
                  ) : (
                    <Chip
                      label={`${fmtSec(minSt)} ~ ${fmtSec(maxSt)}`}
                      size="small"
                      sx={{ fontSize: 11, height: 20, backgroundColor: '#FEF9C3', color: '#92400E', fontVariantNumeric: 'tabular-nums' }}
                    />
                  )}
                </Stack>
              </Box>

              {/* ST grid */}
              <Box sx={{ overflowX: 'auto', borderLeft: `3px solid ${alpha(accent, 0.3)}` }}>
                <Table size="small" sx={{ tableLayout: 'fixed', minWidth: ST_STANDARD_BUCKETS.length * (ST_CELL_WIDTH + 6) + 60 }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { py: '3px', px: '3px', fontSize: 11, fontWeight: 600, textAlign: 'center', backgroundColor: alpha(accent, 0.06), color: 'text.secondary', border: 'none', borderBottom: MATRIX_BORDER } }}>
                      <TableCell sx={{ width: 40, textAlign: 'left !important', pl: '10px !important' }}>
                        {msg('st')}
                      </TableCell>
                      {ST_STANDARD_BUCKETS.map((q) => (
                        <TableCell key={q} sx={{ width: ST_CELL_WIDTH + 6 }}>
                          {`${formatNumberWithCommas(q, { maximumFractionDigits: 0 })}~`}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {/* ST row */}
                    <TableRow sx={{ '& td': { py: '4px' } }}>
                      <TableCell sx={{ width: 40, border: 'none', pl: '8px' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#1D4ED8', fontSize: 11 }}>ST</Typography>
                      </TableCell>
                      {ST_STANDARD_BUCKETS.map((qty, qIdx) => {
                        const stVal = resolveProcessStPerPieceSeconds(process, qty);
                        const isVariant = !isUniform && stVal != null && stVal !== stValues[0];
                        return (
                          <StCell
                            key={qty}
                            processIndex={pIdx}
                            processInstanceId={id}
                            quantity={qty}
                            process={process}
                            stDrafts={stDrafts}
                            onStChange={handleStChange}
                            onStBlur={handleStBlur}
                            isVariant={isVariant}
                          />
                        );
                      })}
                    </TableRow>

                    {/* AT row — only when showAt and has data */}
                    <Collapse in={showAt && hasAt} component="tr" sx={{ display: showAt && hasAt ? undefined : 'none' }}>
                      <TableCell sx={{ border: 'none', pl: '8px' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#15803D', fontSize: 11 }}>AT</Typography>
                      </TableCell>
                      {ST_STANDARD_BUCKETS.map((qty) => {
                        const atVal = resolveProcessAtPerPieceSeconds(process, qty);
                        return (
                          <TableCell key={qty} align="center" sx={{ border: 'none', p: '2px 3px' }}>
                            <Box sx={{
                              width: ST_CELL_WIDTH,
                              height: 26,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontVariantNumeric: 'tabular-nums',
                              color: atVal != null ? '#15803D' : 'text.disabled',
                              fontStyle: atVal == null ? 'italic' : 'normal',
                              fontWeight: atVal != null ? 600 : 400,
                            }}>
                              {atVal != null ? fmtSec(atVal) : '·'}
                            </Box>
                          </TableCell>
                        );
                      })}
                    </Collapse>
                  </TableBody>
                </Table>
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};

export default StyleTimeMatrix;
