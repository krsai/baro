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
    stInputLegend: '\uD30C\uB780 \uD14C\uB450\uB9AC ST\uB294 \uC785\uB825 \uCE78',
    ptReadonlyLegend: 'PT\uB294 \uC77D\uAE30 \uC804\uC6A9',
    atAutoLegend: 'AT\uB294 \uC790\uB3D9 \uACC4\uC0B0(\uC77D\uAE30 \uC804\uC6A9)',
    manualLegend: '\uC5F0\uD55C \uD30C\uB780 ST\uB294 \uC218\uB3D9 \uC785\uB825\uAC12',
    readonlyBadge: '\uC77D\uAE30 \uC804\uC6A9',
    autoBadge: '\uC790\uB3D9',
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
    stInputLegend: 'Blue outlined ST is editable',
    ptReadonlyLegend: 'PT is read-only',
    atAutoLegend: 'AT is auto-calculated (read-only)',
    manualLegend: 'Light-blue ST means manual input',
    readonlyBadge: 'READ ONLY',
    autoBadge: 'AUTO',
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
    stInputLegend: 'ST vien xanh la o nhap',
    ptReadonlyLegend: 'PT la gia tri chi doc',
    atAutoLegend: 'AT la gia tri tu dong (chi doc)',
    manualLegend: 'ST xanh nhat la gia tri nhap tay',
    readonlyBadge: 'CHI DOC',
    autoBadge: 'AUTO',
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
      process?.quantity
    ) || '-'
  );
};

const resolveExactStEntry = (process, quantity) => {
  const bucketQuantity = resolveStBucketQuantity(quantity);
  const stValues = Array.isArray(process?.stValues) ? process.stValues : [];
  return (
    stValues.find((entry) => Number(entry?.quantity) === Number(bucketQuantity)) ||
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

const upsertProcessStValues = (process, quantity, seconds, setBy = 'MANUAL') => {
  const normalized = normalizeProcess(process);
  const resolvedQuantity = resolveStBucketQuantity(quantity);
  const nextValues = (Array.isArray(normalized?.stValues) ? normalized.stValues : []).filter(
    (value) => Number(value?.quantity) !== resolvedQuantity
  );

  if (seconds != null) {
    nextValues.push({
      quantity: resolvedQuantity,
      seconds,
      setBy,
      setAt: null,
      updatedAt: null,
    });
  }

  nextValues.sort((left, right) => Number(left.quantity) - Number(right.quantity));
  return normalizeProcess({
    ...normalized,
    stValues: nextValues,
    ct: null,
    stManual: false,
  });
};

const buildDraftKey = (processInstanceId, quantity) =>
  `${String(processInstanceId || '')}::${String(quantity)}`;
const SECONDS_CELL_WIDTH = 82;
const PROCESS_GROUP_ACCENTS = ['#3B82F6', '#10B981', '#F97316', '#A855F7', '#0EA5E9', '#E11D48'];

const resolveProcessGroupPalette = (processIndex = 0) => {
  const safeIndex = Number.isFinite(Number(processIndex)) ? Math.abs(Number(processIndex)) : 0;
  const accent = PROCESS_GROUP_ACCENTS[safeIndex % PROCESS_GROUP_ACCENTS.length];
  return {
    accent,
    rowBackground: alpha(accent, 0.055),
    rowBorder: alpha(accent, 0.2),
    processCellBackground: alpha(accent, 0.12),
    metricCellBackground: alpha(accent, 0.08),
  };
};

const SECONDS_DISPLAY_BOX_SX = {
  width: SECONDS_CELL_WIDTH,
  minHeight: 32,
  mx: 'auto',
  px: 1,
  py: 0.6,
  borderRadius: 1,
  border: '1px solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.2,
};

const renderReadonlySecondsBox = (value, type = 'pt') => {
  const hasValue = value != null;
  const isPt = type === 'pt';
  const isAt = type === 'at';
  return (
    <Box
      sx={{
        ...SECONDS_DISPLAY_BOX_SX,
        borderStyle: isAt ? 'dashed' : 'solid',
        borderColor: isAt ? alpha('#111827', 0.16) : alpha('#111827', 0.2),
        backgroundColor: isAt ? '#F8FAFC' : '#F3F5F8',
        boxShadow: isAt ? 'none' : `inset 0 1px 0 ${alpha('#FFFFFF', 0.75)}`,
        color: hasValue ? (isAt ? 'text.secondary' : 'text.primary') : 'text.disabled',
        fontWeight: hasValue ? (isPt ? 600 : 500) : 500,
      }}
    >
      {hasValue ? formatSecondsPlain(value) : '-'}
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
      const currentExactSeconds = currentExactSt ? Number(currentExactSt.seconds) : null;
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
          ? upsertProcessStValues(processItem, quantity, nextSeconds, 'MANUAL')
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
        <Stack direction="row" spacing={0.9} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.75,
                border: '1.5px solid #2563EB',
                backgroundColor: '#FFFFFF',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {resolveMessage(languageCode, 'stInputLegend')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            ·
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.75,
                border: `1px solid ${alpha('#111827', 0.22)}`,
                backgroundColor: '#F3F5F8',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {resolveMessage(languageCode, 'ptReadonlyLegend')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            ·
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.75,
                border: `1px dashed ${alpha('#111827', 0.2)}`,
                backgroundColor: '#F8FAFC',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {resolveMessage(languageCode, 'atAutoLegend')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            ·
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {resolveMessage(languageCode, 'manualLegend')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            · {resolveMessage(languageCode, 'unitLegend')}
          </Typography>
        </Stack>
      </Stack>

      <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table
          size="small"
          sx={{
            minWidth: Math.max(1040, 300 + quantityBuckets.length * 96),
            tableLayout: 'fixed',
            '& .MuiTableCell-root': {
              fontVariantNumeric: 'tabular-nums',
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
                          borderLeft: `4px solid ${groupPalette.accent}`,
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
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Box component="span">{resolveMessage(languageCode, 'pt')}</Box>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.2 }}
                          >
                            {resolveMessage(languageCode, 'readonlyBadge')}
                          </Typography>
                        </Stack>
                      </TableCell>
                      {quantityBuckets.map((quantity) => (
                        <TableCell key={`${processInstanceId}-pt-${quantity}`} align="center">
                          {renderReadonlySecondsBox(ptPerPiece, 'pt')}
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
                                width: SECONDS_CELL_WIDTH,
                                '& .MuiInputBase-input': {
                                  textAlign: 'center',
                                  py: 0.6,
                                  fontSize: '0.8125rem',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: hasManualSt ? 600 : 500,
                                },
                                '& .MuiOutlinedInput-root': {
                                  minHeight: 32,
                                  borderRadius: 1,
                                  backgroundColor: hasManualSt ? '#EAF2FF' : '#FFFFFF',
                                  '& fieldset': {
                                    borderWidth: 1.5,
                                    borderColor: hasManualSt ? '#3B82F6' : alpha('#3B82F6', 0.5),
                                  },
                                  '&:hover fieldset': {
                                    borderColor: '#2563EB',
                                  },
                                  '&.Mui-focused fieldset': {
                                    borderColor: '#1D4ED8',
                                    borderWidth: 2,
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
                          color: 'text.secondary',
                          backgroundColor: '#F5F6F8 !important',
                        }}
                      >
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Box component="span">{resolveMessage(languageCode, 'at')}</Box>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: 0.2 }}
                          >
                            {resolveMessage(languageCode, 'autoBadge')}
                          </Typography>
                        </Stack>
                      </TableCell>
                      {quantityBuckets.map((quantity) => {
                        const atPerPiece = resolveProcessAtPerPieceSeconds(process, quantity);
                        return (
                          <TableCell key={`${processInstanceId}-at-${quantity}`} align="center">
                            {renderReadonlySecondsBox(atPerPiece, 'at')}
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
