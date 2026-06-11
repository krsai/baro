import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
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

// 2~, 20~ 숨김 처리
const HIDDEN_BUCKETS = new Set([2, 20]);
const VISIBLE_BUCKETS = ST_STANDARD_BUCKETS.filter((q) => !HIDDEN_BUCKETS.has(q));

const BORDER = '1px solid rgba(17,24,39,0.1)';
const ST_CELL_W = 76;

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

const dk = (id, qty) => `${id}::${qty}`;
const getAccent = (i) => PROCESS_GROUP_ACCENTS[Math.abs(i) % PROCESS_GROUP_ACCENTS.length];

// ── StyleTimeMatrix ─────────────────────────────────────────────────────────

const StyleTimeMatrix = ({ processes = [], onProcessesChange = null }) => {
  const { languageCode } = useLanguage();
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [stDrafts, setStDrafts] = useState({});

  const msg = languageCode === 'vi'
    ? { title: 'ST/AT theo so luong (giay)', process: 'Cong doan', ptHint: 'PT: thoi gian co ban (khong sua)', stHint: 'ST: co the chinh sua', atHint: 'AT: tu dong hoc tu ban ghi', unit: 'Don vi: giay / 1 san pham', empty: 'Chua co cong doan.' }
    : languageCode === 'en'
    ? { title: 'ST / AT by Quantity (sec)', process: 'Process', ptHint: 'PT: base physical time (read-only)', stHint: 'ST: editable standard time per quantity bucket', atHint: 'AT: auto-learned from work records', unit: 'Unit: seconds / per piece', empty: 'No processes registered.' }
    : { title: '수량별 ST / AT (초)', process: '공정', ptHint: 'PT: 공정 정보에서 입력한 기본 물리 시간 (수정 불가)', stHint: 'ST: 수량 구간별 표준 시간 (이 페이지에서 수동 입력 가능)', atHint: 'AT: 작업기록으로 자동 학습한 실제 시간 (참고용)', unit: '단위: 초 / 1장 기준', empty: '등록된 공정이 없습니다.' };

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

  const colCount = 2 + VISIBLE_BUCKETS.length; // 공정명 + ST/AT라벨 + 수량열

  const totalStByBucket = useMemo(() =>
    VISIBLE_BUCKETS.map((q) =>
      safeProcesses.reduce((sum, process) => {
        const st = resolveProcessStPerPieceSeconds(process, q);
        return sum + (st != null ? st : 0);
      }, 0)
    ),
  [safeProcesses]);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* 헤더 */}
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{msg.title}</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Tooltip title={msg.stHint} placement="top">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, backgroundColor: '#DBEAFE', border: '1.5px solid #3B82F6' }} />
              <Typography variant="caption" color="text.secondary">ST 수동 입력</Typography>
            </Box>
          </Tooltip>
          <Tooltip title={msg.atHint} placement="top">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, backgroundColor: '#DCFCE7', border: '1.5px solid #22C55E' }} />
              <Typography variant="caption" color="text.secondary">AT 참고</Typography>
            </Box>
          </Tooltip>
          <Typography variant="caption" color="text.disabled">{msg.unit}</Typography>
        </Stack>
      </Box>

      {/* 테이블 */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table
          size="small"
          sx={{
            minWidth: 240 + 56 + VISIBLE_BUCKETS.length * (ST_CELL_W + 8),
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            '& .MuiTableCell-root': { borderBottom: BORDER, borderRight: 'none' },
          }}
        >
          <TableHead>
            <TableRow sx={{ backgroundColor: '#F8FAFC' }}>
              <TableCell sx={{ width: 240, fontWeight: 700, fontSize: 12, pl: 2 }}>
                {msg.process}
              </TableCell>
              <TableCell sx={{ width: 40, fontWeight: 700, fontSize: 12 }} />
              {VISIBLE_BUCKETS.map((q) => (
                <TableCell
                  key={q}
                  align="center"
                  sx={{ width: ST_CELL_W + 8, fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                >
                  {`${formatNumberWithCommas(q, { maximumFractionDigits: 0 })}~`}
                </TableCell>
              ))}
            </TableRow>
            <TableRow sx={{ backgroundColor: '#FFFBEB' }}>
              <TableCell sx={{ pl: 2, py: 0.75, fontWeight: 700, fontSize: 11, color: '#92400E' }}>
                {languageCode === 'vi' ? 'Tong ST' : languageCode === 'en' ? 'Total ST' : '합계 ST'}
              </TableCell>
              <TableCell sx={{ py: 0.75, fontSize: 11, color: '#92400E', fontWeight: 700 }}>
                {languageCode === 'vi' ? '(giay)' : languageCode === 'en' ? '(sec)' : '(초)'}
              </TableCell>
              {totalStByBucket.map((total, i) => (
                <TableCell
                  key={VISIBLE_BUCKETS[i]}
                  align="center"
                  sx={{ py: 0.75, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: total > 0 ? '#92400E' : 'text.disabled' }}
                >
                  {total > 0 ? fmtSec(total) : '-'}
                </TableCell>
              ))}
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
                const accent = getAccent(pIdx);
                const id = process?.instanceId || process?.id || process?.code || `P${pIdx + 1}`;
                const label = formatProcessNameWithQuantity(
                  resolveLocalizedProcessName(process, languageCode) || process?.name || process?.code || '-',
                  process?.timesPerPiece ?? process?.quantity
                ) || '-';
                const pt = Number.isFinite(Number(process?.pt)) ? Number(process.pt) : null;

                const stValues = VISIBLE_BUCKETS.map((q) => resolveProcessStPerPieceSeconds(process, q));
                const validSt = stValues.filter((v) => v != null);
                const minSt = validSt.length ? Math.min(...validSt) : null;
                const maxSt = validSt.length ? Math.max(...validSt) : null;
                const isUniform = validSt.length === 0 || Math.abs((maxSt ?? 0) - (minSt ?? 0)) < 1e-9;

                const rowBorderTop = pIdx > 0
                  ? `2px solid ${alpha(accent, 0.25)}`
                  : `1px solid ${alpha(accent, 0.15)}`;

                // 공통 셀 sx
                const nameColSx = {
                  borderLeft: `3px solid ${accent}`,
                  verticalAlign: 'middle',
                  pl: 1.5,
                  backgroundColor: alpha(accent, 0.04),
                };

                return (
                  <React.Fragment key={id}>
                    {/* ST 행 */}
                    <TableRow
                      sx={{
                        '& td': { borderTop: rowBorderTop },
                        '&:hover td': { backgroundColor: alpha(accent, 0.03) },
                      }}
                    >
                      {/* 공정명 — ST+AT 2행 rowSpan */}
                      <TableCell
                        rowSpan={2}
                        sx={nameColSx}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
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
                            <Typography variant="caption" sx={{ color: '#92400E', backgroundColor: '#FEF9C3', px: 0.5, borderRadius: 0.5, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                              {fmtSec(minSt)} ~ {fmtSec(maxSt)}
                            </Typography>
                          </Box>
                        )}
                      </TableCell>

                      {/* ST 라벨 */}
                      <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#1D4ED8', backgroundColor: '#EFF6FF', py: 0.5 }}>
                        ST
                      </TableCell>

                      {/* ST 값 셀 */}
                      {VISIBLE_BUCKETS.map((qty) => {
                        const draftK = dk(id, qty);
                        const entry = resolveStEntry(process, qty);
                        const resolved = resolveProcessStPerPieceSeconds(process, qty);
                        const manual = isManualSt(entry);
                        const isVariant = !isUniform && resolved != null && roundTo(resolved, 4) !== roundTo(stValues[0], 4);
                        const value = Object.prototype.hasOwnProperty.call(stDrafts, draftK)
                          ? stDrafts[draftK]
                          : toEditText(resolved);

                        return (
                          <TableCell key={qty} align="center" sx={{ py: '4px', px: '4px', backgroundColor: '#EFF6FF' }}>
                            <TextField
                              value={value}
                              onChange={(e) => handleStChange(id, qty, e.target.value)}
                              onBlur={(e) => handleStBlur(pIdx, id, qty, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                              size="small"
                              inputProps={{ inputMode: 'decimal' }}
                              sx={{
                                width: ST_CELL_W,
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
                                  backgroundColor: isVariant ? '#DBEAFE' : (manual ? '#EFF6FF' : '#FAFAFA'),
                                  '& fieldset': {
                                    borderColor: manual ? (isVariant ? '#2563EB' : alpha('#3B82F6', 0.5)) : 'rgba(17,24,39,0.15)',
                                    borderWidth: isVariant ? 1.5 : 1,
                                  },
                                  '&:hover fieldset': { borderColor: '#3B82F6' },
                                  '&.Mui-focused fieldset': { borderColor: '#1D4ED8', borderWidth: 1.5 },
                                },
                              }}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* AT 행 */}
                    <TableRow sx={{ '& td': { borderBottom: `1px solid ${alpha(accent, 0.15)}` } }}>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#15803D', backgroundColor: '#F0FDF4', py: 0.5 }}>
                        AT
                      </TableCell>
                      {VISIBLE_BUCKETS.map((qty) => {
                        const atVal = resolveProcessAtPerPieceSeconds(process, qty);
                        return (
                          <TableCell key={qty} align="center" sx={{ py: '4px', backgroundColor: '#F0FDF4' }}>
                            <Box sx={{
                              width: ST_CELL_W,
                              mx: 'auto',
                              height: 28,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontVariantNumeric: 'tabular-nums',
                              color: atVal != null ? '#15803D' : 'rgba(156,163,175,0.8)',
                              fontWeight: atVal != null ? 700 : 400,
                              fontStyle: atVal == null ? 'italic' : 'normal',
                            }}>
                              {atVal != null ? fmtSec(atVal) : '-'}
                            </Box>
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
  );
};

export default StyleTimeMatrix;
