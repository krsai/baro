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

const MESSAGES = {
  ko: {
    title: '\uC218\uB7C9\uBCC4 PT/ST/AT (\uCD08)',
    processColumn: '\uACF5\uC815',
    metricColumn: '\uAD6C\uBD84',
    pt: 'PT',
    st: 'ST',
    at: 'AT',
    ptLegend: 'PT: \uACF5\uC815 \uC815\uBCF4\uC5D0\uC11C \uC785\uB825\uD55C \uAE30\uBCF8 \uC2DC\uAC04 (\uC218\uC815 \uBD88\uAC00)',
    stInputLegend: 'ST: \uC774 \uD398\uC774\uC9C0\uC5D0\uC11C \uC218\uB3D9 \uC785\uB825 \uAC00\uB2A5',
    atLegend: 'AT: \uC791\uC5C5\uAE30\uB85D\uC73C\uB85C \uC790\uB3D9 \uD559\uC2B5\uB41C \uC2E4\uC81C \uC2DC\uAC04',
    unitLegend: '\uBAA8\uB4E0 \uAC12 \uB2E8\uC704: \uCD08',
    empty: '\uB4F1\uB85D\uB41C \uACF5\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  },
  en: {
    title: 'PT/ST/AT by Quantity (sec)',
    processColumn: 'Process',
    metricColumn: 'Metric',
    pt: 'PT',
    st: 'ST',
    at: 'AT',
    ptLegend: 'PT: fixed base time from process setup (read-only)',
    stInputLegend: 'ST: editable on this page',
    atLegend: 'AT: auto-learned from work records',
    unitLegend: 'All values are in seconds',
    empty: 'No process rows registered.',
  },
  vi: {
    title: 'PT/ST/AT theo so luong (giay)',
    processColumn: 'Cong doan',
    metricColumn: 'Muc',
    pt: 'PT',
    st: 'ST',
    at: 'AT',
    ptLegend: 'PT: thoi gian co ban tu thiet lap cong doan (khong sua)',
    stInputLegend: 'ST: co the nhap tay tren trang nay',
    atLegend: 'AT: tu dong hoc tu ban ghi lam viec',
    unitLegend: 'Tat ca gia tri deu tinh theo giay',
    empty: 'Chua co cong doan nao.',
  },
};

const resolveMessage = (languageCode, key) => {
  const locale =
    languageCode === 'ko' || languageCode === 'vi' || languageCode === 'en'
      ? languageCode
      : 'en';
  return MESSAGES[locale]?.[key] || MESSAGES.en[key] || '';
};

const roundToScale = (value, digits = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const resolveProcessLabel = (process, languageCode) => {
  const localizedName = resolveLocalizedProcessName(process, languageCode);
  return (
    formatProcessNameWithQuantity(
      localizedName || process?.name || process?.code || '-',
      process?.timesPerPiece ?? process?.quantity
    ) || '-'
  );
};

const resolveExactStEntry = (process, quantity) => {
  const bucketQuantity = resolveStBucketQuantity(quantity);
  const stBuckets = Array.isArray(process?.stBuckets)
    ? process.stBuckets
    : Array.isArray(process?.stValues)
      ? process.stValues
      : [];
  return (
    stBuckets.find(
      (entry) => Number(entry?.bucketQuantity ?? entry?.quantity) === Number(bucketQuantity)
    ) ||
    null
  );
};

const isManualStEntry = (entry) => {
  if (!entry) return false;
  const setBy = String(entry?.setBy || '')
    .trim()
    .toUpperCase();
  if (!setBy) return true;
  return MANUAL_ST_SET_BY.has(setBy);
};

const formatSecondsPlain = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return formatNumberWithCommas(roundToScale(parsed, 4), {
    fallback: '-',
    maximumFractionDigits: 4,
  });
};

const toEditableSecondsText = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  const rounded = roundToScale(parsed, 4);
  return String(rounded)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');
};

const parseStInput = (value) => {
  const text = String(value ?? '')
    .replace(/,/g, '')
    .trim();
  if (!text) {
    return { isValid: true, seconds: null };
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { isValid: false, seconds: null };
  }
  return {
    isValid: true,
    seconds: roundToScale(Math.max(0, parsed), 4),
  };
};

const upsertProcessStBuckets = (process, quantity, seconds, setBy = 'MANUAL') => {
  const normalized = normalizeProcess(process);
  const resolvedQuantity = resolveStBucketQuantity(quantity);
  const nextBuckets = (Array.isArray(normalized?.stBuckets) ? normalized.stBuckets : []).filter(
    (value) => Number(value?.bucketQuantity ?? value?.quantity) !== resolvedQuantity
  );

  if (seconds != null) {
    nextBuckets.push({
      bucketQuantity: resolvedQuantity,
      bucketStSeconds: seconds,
      setBy,
      setAt: null,
      updatedAt: null,
    });
  }

  nextBuckets.sort((left, right) => Number(left.bucketQuantity) - Number(right.bucketQuantity));
  return normalizeProcess({
    ...normalized,
    stBuckets: nextBuckets,
    ct: null,
    stManual: false,
  });
};

const buildDraftKey = (processInstanceId, quantity) =>
  `${String(processInstanceId || '')}::${String(quantity)}`;
const SECONDS_CELL_WIDTH = 82;
const MATRIX_BORDER_WIDTH = 0.75;
const MATRIX_BORDER_COLOR = alpha('#111827', 0.16);
const PROCESS_GROUP_ACCENTS = ['#3B82F6', '#10B981', '#F97316', '#A855F7', '#0EA5E9', '#E11D48'];
const BASE_MATRIX_INPUT_SX = {
  width: SECONDS_CELL_WIDTH,
  minWidth: 0,
  '& .MuiInputBase-input': {
    textAlign: 'right',
    px: 0.75,
    py: 0.625,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.25,
  },
  '& .MuiOutlinedInput-root': {
    minHeight: 32,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
    '& .MuiOutlinedInput-notchedOutline': {
      borderWidth: MATRIX_BORDER_WIDTH,
      borderColor: MATRIX_BORDER_COLOR,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha('#1F2937', 0.26),
    },
  },
};

const resolveProcessGroupPalette = (processIndex = 0) => {
  const safeIndex = Number.isFinite(Number(processIndex)) ? Math.abs(Number(processIndex)) : 0;
  const accent = PROCESS_GROUP_ACCENTS[safeIndex % PROCESS_GROUP_ACCENTS.length];
  return {
    accent,
    rowBackground: alpha(accent, 0.055),
    rowBorder: alpha(accent, 0.14),
    processCellBackground: alpha(accent, 0.12),
    metricCellBackground: alpha(accent, 0.08),
  };
};

const renderPtBox = (value) => {
  const hasValue = value != null;
  const displayValue = hasValue ? formatSecondsPlain(value) : '-';
  return (
    <Box
      sx={{
        width: SECONDS_CELL_WIDTH,
        minWidth: 0,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        px: 0.75,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: hasValue ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
        color: hasValue ? 'rgba(55, 65, 81, 0.8)' : 'rgba(156, 163, 175, 0.7)',
        userSelect: 'none',
      }}
    >
      {displayValue}
    </Box>
  );
};

const renderAtBox = (value) => {
  const hasValue = value != null;
  const displayValue = hasValue ? formatSecondsPlain(value) : '-';
  return (
    <Box
      sx={{
        width: SECONDS_CELL_WIDTH,
        minWidth: 0,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        px: 0.75,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: hasValue ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
        color: hasValue ? 'rgba(21, 128, 61, 0.85)' : 'rgba(156, 163, 175, 0.55)',
        fontStyle: hasValue ? 'normal' : 'italic',
        userSelect: 'none',
      }}
    >
      {displayValue}
    </Box>
  );
};
const StyleTimeMatrix = ({ processes = [], onProcessesChange = null }) => {
  const { languageCode } = useLanguage();
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const quantityBuckets = ST_STANDARD_BUCKETS;
  const [stDraftValues, setStDraftValues] = useState({});

  const handleStInputChange = useCallback((processInstanceId, quantity, value) => {
    const draftKey = buildDraftKey(processInstanceId, quantity);
    setStDraftValues((prev) => ({
      ...prev,
      [draftKey]: value,
    }));
  }, []);

  const handleStInputBlur = useCallback(
    (processIndex, processInstanceId, quantity, value) => {
      const draftKey = buildDraftKey(processInstanceId, quantity);
      const hasDraftValue = Object.prototype.hasOwnProperty.call(stDraftValues, draftKey);
      if (!hasDraftValue) return;

      setStDraftValues((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });

      const parsed = parseStInput(value);
      if (!parsed.isValid || typeof onProcessesChange !== 'function') return;

      const targetProcess = safeProcesses[processIndex];
      if (!targetProcess) return;
      const currentExactSt = resolveExactStEntry(targetProcess, quantity);
      const currentExactSeconds = currentExactSt
        ? Number(currentExactSt.bucketStSeconds ?? currentExactSt.seconds)
        : null;
      const nextSeconds = parsed.seconds;

      if (currentExactSeconds == null && nextSeconds == null) return;
      if (
        currentExactSeconds != null &&
        nextSeconds != null &&
        Math.abs(currentExactSeconds - nextSeconds) < 1e-9
      ) {
        return;
      }

      const nextProcesses = safeProcesses.map((processItem, index) =>
        index === processIndex
          ? upsertProcessStBuckets(processItem, quantity, nextSeconds, 'MANUAL')
          : processItem
      );
      onProcessesChange(nextProcesses);
    },
    [onProcessesChange, safeProcesses, stDraftValues]
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 1.25,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {resolveMessage(languageCode, 'title')}
        </Typography>
        <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" sx={{ color: 'rgba(55, 65, 81, 0.65)', fontStyle: 'italic' }}>
              PT
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {resolveMessage(languageCode, 'ptLegend').replace(/^PT:\s*/, '')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">·</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.75,
                border: '1.5px solid #2563EB',
                backgroundColor: '#EAF2FF',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {resolveMessage(languageCode, 'stInputLegend')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">·</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="caption" sx={{ color: 'rgba(21, 128, 61, 0.75)', fontStyle: 'italic' }}>
              AT
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {resolveMessage(languageCode, 'atLegend').replace(/^AT:\s*/, '')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            · {resolveMessage(languageCode, 'unitLegend')}
          </Typography>
        </Stack>
      </Stack>

      <TableContainer
        sx={{
          border: `${MATRIX_BORDER_WIDTH}px solid`,
          borderColor: MATRIX_BORDER_COLOR,
          borderRadius: 1.5,
        }}
      >
        <Table
          size="small"
          sx={{
            minWidth: Math.max(1040, 300 + quantityBuckets.length * 96),
            tableLayout: 'fixed',
            '& .MuiTableCell-root': {
              fontVariantNumeric: 'tabular-nums',
              borderBottom: `${MATRIX_BORDER_WIDTH}px solid`,
              borderBottomColor: MATRIX_BORDER_COLOR,
            },
            '& .MuiTableCell-head': {
              backgroundColor: '#F8FAFC',
              borderBottom: `${MATRIX_BORDER_WIDTH}px solid`,
              borderBottomColor: MATRIX_BORDER_COLOR,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 240, width: 240, fontWeight: 700 }}>
                {resolveMessage(languageCode, 'processColumn')}
              </TableCell>
              <TableCell sx={{ width: 72, minWidth: 72, fontWeight: 700 }}>
                {resolveMessage(languageCode, 'metricColumn')}
              </TableCell>
              {quantityBuckets.map((quantity) => (
                <TableCell key={`quantity-${quantity}`} align="center" sx={{ fontWeight: 700 }}>
                  {`${formatNumberWithCommas(quantity, {
                    fallback: String(quantity),
                    maximumFractionDigits: 0,
                  })}~`}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {safeProcesses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2 + quantityBuckets.length}
                  align="center"
                  sx={{ py: 4, color: 'text.secondary' }}
                >
                  {resolveMessage(languageCode, 'empty')}
                </TableCell>
              </TableRow>
            ) : (
              safeProcesses.map((process, processIndex) => {
                const processLabel = resolveProcessLabel(process, languageCode);
                const ptPerPiece = Number.isFinite(Number(process?.pt)) ? Number(process.pt) : null;
                const processInstanceId =
                  process?.instanceId || process?.id || process?.code || `PROCESS-${processIndex + 1}`;
                const groupPalette = resolveProcessGroupPalette(processIndex);
                const processRowSx = {
                  '& > td': {
                    backgroundColor: groupPalette.rowBackground,
                    borderBottomColor: groupPalette.rowBorder,
                  },
                };

                return (
                  <React.Fragment key={processInstanceId}>
                    <TableRow sx={processRowSx}>
                      <TableCell
                        rowSpan={3}
                        sx={{
                          fontWeight: 700,
                          verticalAlign: 'middle',
                          borderLeft: `2px solid ${groupPalette.accent}`,
                          backgroundColor: `${groupPalette.processCellBackground} !important`,
                        }}
                      >
                        {processLabel}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          backgroundColor: `${groupPalette.metricCellBackground} !important`,
                        }}
                      >
                        {resolveMessage(languageCode, 'pt')}
                      </TableCell>
                      {quantityBuckets.map((quantity) => (
                        <TableCell key={`${processInstanceId}-pt-${quantity}`} align="center">
                          {renderPtBox(ptPerPiece)}
                        </TableCell>
                      ))}
                    </TableRow>

                    <TableRow sx={processRowSx}>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          color: '#1D4ED8',
                          backgroundColor: '#EEF4FF !important',
                        }}
                      >
                        {resolveMessage(languageCode, 'st')}
                      </TableCell>
                      {quantityBuckets.map((quantity) => {
                        const draftKey = buildDraftKey(processInstanceId, quantity);
                        const exactStEntry = resolveExactStEntry(process, quantity);
                        const resolvedStPerPiece = resolveProcessStPerPieceSeconds(process, quantity);
                        const hasManualSt = isManualStEntry(exactStEntry);
                        const inputValue = Object.prototype.hasOwnProperty.call(stDraftValues, draftKey)
                          ? stDraftValues[draftKey]
                          : toEditableSecondsText(resolvedStPerPiece);

                        return (
                          <TableCell key={`${processInstanceId}-st-${quantity}`} align="center">
                            <TextField
                              value={inputValue}
                              onChange={(event) =>
                                handleStInputChange(processInstanceId, quantity, event.target.value)
                              }
                              onBlur={(event) =>
                                handleStInputBlur(
                                  processIndex,
                                  processInstanceId,
                                  quantity,
                                  event.target.value
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  event.currentTarget.blur();
                                }
                              }}
                              size="small"
                              inputProps={{
                                inputMode: 'decimal',
                              }}
                              sx={{
                                ...BASE_MATRIX_INPUT_SX,
                                '& .MuiInputBase-input': {
                                  ...BASE_MATRIX_INPUT_SX['& .MuiInputBase-input'],
                                  fontWeight: hasManualSt ? 600 : 500,
                                },
                                '& .MuiOutlinedInput-root': {
                                  ...BASE_MATRIX_INPUT_SX['& .MuiOutlinedInput-root'],
                                  backgroundColor: hasManualSt ? '#EAF2FF' : '#FFFFFF',
                                  '& .MuiOutlinedInput-notchedOutline': {
                                    borderWidth: MATRIX_BORDER_WIDTH,
                                    borderColor: hasManualSt ? '#3B82F6' : alpha('#3B82F6', 0.38),
                                  },
                                  '&:hover .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#2563EB',
                                  },
                                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#1D4ED8',
                                    borderWidth: 1.2,
                                  },
                                },
                              }}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    <TableRow sx={processRowSx}>
                      <TableCell
                        sx={{
                          fontWeight: 700,
                          color: 'rgba(21, 128, 61, 0.75)',
                          backgroundColor: '#F0FDF4 !important',
                        }}
                      >
                        {resolveMessage(languageCode, 'at')}
                      </TableCell>
                      {quantityBuckets.map((quantity) => {
                        const atPerPiece = resolveProcessAtPerPieceSeconds(process, quantity);
                        return (
                          <TableCell key={`${processInstanceId}-at-${quantity}`} align="center">
                            {renderAtBox(atPerPiece)}
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


