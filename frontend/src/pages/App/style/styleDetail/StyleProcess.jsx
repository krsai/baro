import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchableSelect from '../../../../components/SearchableSelect';
import { fetchProcessAttributes } from '../../../../utils/attributeApi';
import {
  AT_RELIABILITY_STATUS,
  DEFAULT_TIME_REF_QUANTITY,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcess,
  normalizeProcesses,
  parseOptionalSecondsInput,
  resolveProcessActualTime,
  resolveProcessAtPerPieceSeconds,
  resolveProcessAtReliability,
  resolveStyleAtReliability,
  resolveProcessStPerPieceSeconds,
} from '../../../../utils/processTime';

const createEmptyDraft = () => ({
  process: null,
  pt: '',
  st: '',
  stManual: false,
});

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const roundToScale = (value, digits = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const toOptionalSeconds = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : parsed;
};

const toDraftNumberText = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(roundToScale(parsed, 4));
};

// 생산계획 카드 상태 라벨과 동일한 커스텀 팔레트 사용 (공유 팔레트 — agent.md 참조)
const AT_RELIABILITY_PALETTE = {
  [AT_RELIABILITY_STATUS.COLLECTING]:     { bg: '#EBEBF0', text: '#747484' },
  [AT_RELIABILITY_STATUS.FALLBACK]:       { bg: '#F7DCC8', text: '#AC6424' },
  [AT_RELIABILITY_STATUS.LOW_SENSITIVITY]:{ bg: '#F7DCC8', text: '#AC6424' },
  [AT_RELIABILITY_STATUS.LEARNING]:       { bg: '#BFEAD0', text: '#268444' },
  [AT_RELIABILITY_STATUS.STABLE]:         { bg: '#C8DFF7', text: '#3674B4' },
};

const AT_RELIABILITY_CHIP_SX = {
  height: 18,
  '& .MuiChip-label': {
    px: 0.75,
    fontSize: '0.65rem',
    lineHeight: 1.1,
  },
};

const resolveAtReliabilityPalette = (reliability) =>
  AT_RELIABILITY_PALETTE[reliability?.status] ||
  AT_RELIABILITY_PALETTE[AT_RELIABILITY_STATUS.COLLECTING];

const resolveAtReliabilityPercentLabel = (reliability) => {
  const percent = Number(reliability?.percent);
  if (!Number.isFinite(percent)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
};

const normalizeProcessOption = (item) => {
  const code = String(item?.code ?? '')
    .trim()
    .toUpperCase();
  const name = String(item?.name ?? '').trim();
  if (!code && !name) return null;
  return {
    id: item?.id ?? null,
    code: code || name,
    name: name || code,
    description: String(item?.description ?? '').trim(),
    actualTime: item?.actualTime ?? null,
  };
};

const getProcessIdentity = (process) => {
  if (!process || typeof process !== 'object') return '';
  if (process.id !== null && process.id !== undefined && process.id !== '') {
    return `id:${String(process.id)}`;
  }
  const code = String(process.code ?? '')
    .trim()
    .toUpperCase();
  if (code) return `code:${code}`;
  const name = String(process.name ?? '')
    .trim()
    .toLowerCase();
  return name ? `name:${name}` : '';
};

const createInstanceId = (process) =>
  `${process?.code || process?.name || 'PROC'}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
const toProcessOptionLabel = (process) => `[${process?.code || ''}] ${process?.name || ''}`.trim();
const compareProcessOptionTextAsc = (left, right) =>
  toProcessOptionLabel(left).localeCompare(toProcessOptionLabel(right), 'ko');

const resolveDraftStInputValue = (draft, autoStTotalSeconds) => {
  if (draft?.stManual) return draft.st;
  return toDraftNumberText(autoStTotalSeconds);
};

const buildProcessPayload = (
  draft,
  existingProcess = null,
  timeRefQuantity = DEFAULT_TIME_REF_QUANTITY
) => {
  const resolvedTimeRefQuantity = toPositiveInt(
    timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const processQuantity = toPositiveInt(existingProcess?.quantity, 1);
  const ptTotalForDisplay = parseOptionalSecondsInput(draft.pt);
  const stTotalForDisplay = parseOptionalSecondsInput(draft.st);
  const stManual = draft.stManual === true;
  const ptPerPiece =
    ptTotalForDisplay == null
      ? null
      : roundToScale(ptTotalForDisplay / processQuantity, 4);
  const ctPerPiece =
    !stManual || stTotalForDisplay == null
      ? null
      : roundToScale(stTotalForDisplay / processQuantity, 4);

  return normalizeProcess({
    ...(existingProcess || {}),
    id: draft.process?.id ?? existingProcess?.id,
    code: draft.process?.code ?? existingProcess?.code,
    name: draft.process?.name ?? existingProcess?.name,
    description: draft.process?.description ?? existingProcess?.description,
    quantity: processQuantity,
    timeRefQuantity: resolvedTimeRefQuantity,
    stManual,
    pt: ptPerPiece,
    ct: ctPerPiece,
    at: resolveProcessActualTime({
      existingAt: existingProcess?.at ?? null,
      workStats: {
        actualTime: draft.process?.actualTime ?? existingProcess?.actualTime ?? null,
      },
    }),
    instanceId: existingProcess?.instanceId || createInstanceId(draft.process),
  });
};

const resolveCommonTimeRefQuantity = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_TIME_REF_QUANTITY;
  const first = rows.find((row) => Number.isFinite(Number(row?.timeRefQuantity)));
  return toPositiveInt(first?.timeRefQuantity, DEFAULT_TIME_REF_QUANTITY);
};

const StyleProcess = ({
  processes = [],
  onProcessesChange,
}) => {
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [timeRefQuantity, setTimeRefQuantity] = useState(() =>
    resolveCommonTimeRefQuantity(safeProcesses)
  );
  const [timeRefQuantityInput, setTimeRefQuantityInput] = useState(() =>
    resolveCommonTimeRefQuantity(safeProcesses).toLocaleString('ko-KR')
  );
  const [attributeProcesses, setAttributeProcesses] = useState([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    let active = true;

    const loadAttributeProcesses = async () => {
      setIsLoadingOptions(true);
      setOptionsError('');
      try {
        const data = await fetchProcessAttributes();
        if (!active) return;
        setAttributeProcesses(Array.isArray(data) ? data : []);
      } catch (_error) {
        if (!active) return;
        setAttributeProcesses([]);
        setOptionsError('표준 공정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        if (active) {
          setIsLoadingOptions(false);
        }
      }
    };

    loadAttributeProcesses();

    return () => {
      active = false;
    };
  }, []);

  const normalizedAttributeOptions = useMemo(
    () => attributeProcesses.map((item) => normalizeProcessOption(item)).filter(Boolean),
    [attributeProcesses]
  );
  const processOptions = useMemo(() => {
    const byIdentity = new Map();
    normalizedAttributeOptions.forEach((process) => {
      const identity = getProcessIdentity(process);
      if (!identity || byIdentity.has(identity)) return;
      byIdentity.set(identity, process);
    });
    safeProcesses.forEach((process) => {
      const identity = getProcessIdentity(process);
      if (!identity || byIdentity.has(identity)) return;
      byIdentity.set(identity, {
        id: process.id,
        code: process.code,
        name: process.name,
        description: process.description || '',
        actualTime: process.actualTime ?? null,
      });
    });
    return Array.from(byIdentity.values()).sort(compareProcessOptionTextAsc);
  }, [normalizedAttributeOptions, safeProcesses]);

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [addDraft, setAddDraft] = useState(createEmptyDraft);
  const [addError, setAddError] = useState('');
  const displayOrderQuantity = useMemo(
    () => toPositiveInt(timeRefQuantity, DEFAULT_TIME_REF_QUANTITY),
    [timeRefQuantity]
  );

  const totalPT = useMemo(
    () => {
      return safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const ptPerPiece = toOptionalSeconds(process?.pt);
        if (ptPerPiece == null) return acc;
        return acc + processQuantity * ptPerPiece;
      }, 0);
    },
    [safeProcesses, displayOrderQuantity]
  );
  const totalAT = useMemo(
    () => {
      return safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const atPerPiece = resolveProcessAtPerPieceSeconds(process, displayOrderQuantity);
        if (atPerPiece == null) return acc;
        return acc + processQuantity * atPerPiece;
      }, 0);
    },
    [safeProcesses, displayOrderQuantity]
  );
  const totalST = useMemo(
    () =>
      safeProcesses.reduce((acc, process) => {
        const processQuantity = toPositiveInt(process?.quantity, 1);
        const value = resolveProcessStPerPieceSeconds(
          process,
          displayOrderQuantity
        );
        return value == null ? acc : acc + processQuantity * value;
      }, 0),
    [safeProcesses, displayOrderQuantity]
  );
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(() => hasAnyProcessTime(safeProcesses, 'at'), [safeProcesses]);
  const hasST = useMemo(
    () =>
      safeProcesses.some(
        (process) =>
          resolveProcessStPerPieceSeconds(
            process,
            displayOrderQuantity
          ) != null
      ),
    [safeProcesses, displayOrderQuantity]
  );
  const timeRefQuantityLabel = useMemo(
    () => displayOrderQuantity.toLocaleString('ko-KR'),
    [displayOrderQuantity]
  );
  const styleAtReliability = useMemo(() => {
    return resolveStyleAtReliability(safeProcesses);
  }, [safeProcesses]);

  const addDisabledIdentitySet = useMemo(() => {
    const set = new Set();
    safeProcesses.forEach((process) => {
      const identity = getProcessIdentity(process);
      if (identity) set.add(identity);
    });
    return set;
  }, [safeProcesses]);

  const canStartAdd = !isLoadingOptions && processOptions.length > 0;

  useEffect(() => {
    if (safeProcesses.length === 0) {
      setTimeRefQuantity(DEFAULT_TIME_REF_QUANTITY);
      setTimeRefQuantityInput(DEFAULT_TIME_REF_QUANTITY.toLocaleString('ko-KR'));
      return;
    }
    const nextRef = resolveCommonTimeRefQuantity(safeProcesses);
    setTimeRefQuantity((prev) => (prev === nextRef ? prev : nextRef));
    setTimeRefQuantityInput(nextRef.toLocaleString('ko-KR'));
  }, [safeProcesses]);

  // 입력 중: raw 문자열만 저장 (파싱하지 않음)
  const handleTimeRefQuantityChange = (event) => {
    setTimeRefQuantityInput(event.target.value);
  };

  // 포커스 진입 시: 콤마 제거해 깔끔하게 편집
  const handleTimeRefQuantityFocus = () => {
    setTimeRefQuantityInput(String(timeRefQuantity));
  };

  // 포커스 벗어날 때: 파싱 후 천 단위 콤마 포맷으로 표시 및 공정 동기화
  const handleTimeRefQuantityBlur = () => {
    const nextValue = toPositiveInt(
      String(timeRefQuantityInput).replace(/,/g, ''),
      DEFAULT_TIME_REF_QUANTITY
    );
    setTimeRefQuantity(nextValue);
    setTimeRefQuantityInput(nextValue.toLocaleString('ko-KR'));
    if (safeProcesses.length === 0) return;
    const needsSync = safeProcesses.some(
      (process) =>
        toPositiveInt(process?.timeRefQuantity, DEFAULT_TIME_REF_QUANTITY) !== nextValue
    );
    if (!needsSync) return;
    onProcessesChange(
      safeProcesses.map((process) =>
        normalizeProcess({ ...process, timeRefQuantity: nextValue })
      )
    );
  };

  const validateDraft = (draft, options = {}) => {
    const { ignoreInstanceId = null } = options;
    if (!draft.process) return '공정을 선택해주세요.';

    const identity = getProcessIdentity(draft.process);
    if (!identity) return '유효한 공정을 선택해주세요.';

    const duplicated = safeProcesses.some((process) => {
      if (ignoreInstanceId && process.instanceId === ignoreInstanceId) return false;
      return getProcessIdentity(process) === identity;
    });
    if (duplicated) return '이미 등록된 공정입니다.';
    if (draft.stManual === true && parseOptionalSecondsInput(draft.st) == null) {
      return 'ST 값을 입력해주세요.';
    }

    return '';
  };

  const handleStartAddRow = () => {
    if (!canStartAdd) return;
    setIsAddingRow(true);
    setAddDraft(createEmptyDraft());
    setAddError('');
  };

  const handleCancelAddRow = () => {
    setIsAddingRow(false);
    setAddDraft(createEmptyDraft());
    setAddError('');
  };

  const handleSaveAddRow = () => {
    const errorMessage = validateDraft(addDraft);
    if (errorMessage) {
      setAddError(errorMessage);
      return;
    }
    const nextProcess = buildProcessPayload(addDraft, null, timeRefQuantity);
    onProcessesChange([...safeProcesses, nextProcess]);
    handleCancelAddRow();
  };

  const handleInlineChange = (process, field, rawValue) => {
    let updatedProcess;
    if (field === 'pt') {
      const parsed = parseOptionalSecondsInput(rawValue);
      updatedProcess = normalizeProcess({ ...process, pt: parsed });
    } else if (field === 'st') {
      const parsed = parseOptionalSecondsInput(rawValue);
      const hasValue = parsed != null;
      updatedProcess = normalizeProcess({ ...process, ct: hasValue ? parsed : null, stManual: hasValue });
    } else {
      return;
    }
    onProcessesChange(safeProcesses.map((p) => p.instanceId === process.instanceId ? updatedProcess : p));
  };

  const handleRemoveProcess = (instanceId) => {
    onProcessesChange(safeProcesses.filter((process) => process.instanceId !== instanceId));
  };

  const onDragEnd = (result) => {
    if (isAddingRow) return;
    if (!result.destination) return;

    const nextProcesses = Array.from(safeProcesses);
    const [reorderedItem] = nextProcesses.splice(result.source.index, 1);
    nextProcesses.splice(result.destination.index, 0, reorderedItem);
    onProcessesChange(nextProcesses);
  };

  const renderRowActions = (process) => (
    <Tooltip title="삭제">
      <IconButton size="small" onClick={() => handleRemoveProcess(process.instanceId)}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );

  const addPreviewProcess = isAddingRow
    ? buildProcessPayload(addDraft, null, timeRefQuantity)
    : null;
  const addPreviewAtTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessAtPerPieceSeconds(
          addPreviewProcess,
          displayOrderQuantity
        );
  const addPreviewStTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessStPerPieceSeconds(
          addPreviewProcess,
          displayOrderQuantity
        );

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 1.25 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Typography variant="h6">스타일 공정 목록</Typography>
          <Tooltip title="기준 수량 q는 기본값 1000이며, PT/ST 시간값은 1개 작업 기준으로 입력합니다.">
            <TextField
              size="small"
              type="text"
              inputMode="numeric"
              label="기준 수량 q"
              value={timeRefQuantityInput}
              onChange={handleTimeRefQuantityChange}
              onFocus={handleTimeRefQuantityFocus}
              onBlur={handleTimeRefQuantityBlur}
              placeholder="1,000"
              sx={{ width: 140 }}
            />
          </Tooltip>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleStartAddRow}
          disabled={isAddingRow || !canStartAdd}
          sx={{
            minWidth: 108,
            height: 36,
            px: 1.5,
            boxShadow: 'none',
            borderRadius: 1.5,
          }}
        >
          행 추가
        </Button>
      </Stack>

      {isLoadingOptions && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          표준 공정 목록을 불러오는 중입니다.
        </Typography>
      )}
      {!isLoadingOptions && optionsError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {optionsError}
        </Typography>
      )}
      {!isLoadingOptions && !optionsError && processOptions.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          속성 관리에서 공정을 먼저 등록해주세요.
        </Typography>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <DragDropContext onDragEnd={onDragEnd}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 70 }}>순서</TableCell>
                  <TableCell sx={{ minWidth: 250 }}>공정명</TableCell>
                  <TableCell align="right" sx={{ width: 110 }}>
                    <Tooltip
                      title={`PT(${timeRefQuantityLabel}): 기준 수량 q 문맥에서 입력한 예상 시간(초)입니다.`}
                      placement="top"
                    >
                      <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                        {`PT(${timeRefQuantityLabel})`}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.75}>
                      <Tooltip title={`AT(${timeRefQuantityLabel}): 실제 작업 기록 기반 자동 산출값입니다.`} placement="top">
                        <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                          {`AT(${timeRefQuantityLabel})`}
                        </Box>
                      </Tooltip>
                      {styleAtReliability && (
                        <Chip
                          size="small"
                          label={resolveAtReliabilityPercentLabel(styleAtReliability)}
                          sx={{
                            ...AT_RELIABILITY_CHIP_SX,
                            backgroundColor: resolveAtReliabilityPalette(styleAtReliability).bg,
                            color: resolveAtReliabilityPalette(styleAtReliability).text,
                          }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    <Tooltip title={`ST(${timeRefQuantityLabel}): 배정 기준으로 사용하는 표준 시간입니다.`} placement="top">
                      <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                        {`ST(${timeRefQuantityLabel})`}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center" sx={{ width: 120 }}>
                    작업
                  </TableCell>
                </TableRow>
              </TableHead>

              <Droppable droppableId="style-processes">
                {(provided) => (
                  <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                    {isAddingRow && (
                      <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                        <TableCell align="center" sx={{ color: 'text.secondary' }}>
                          신규
                        </TableCell>
                        <TableCell>
                          <SearchableSelect
                            size="small"
                            label="공정 선택"
                            options={processOptions}
                            value={addDraft.process}
                            onChange={(_event, value) => {
                              setAddDraft((prev) => ({ ...prev, process: value }));
                              setAddError('');
                            }}
                            getOptionLabel={(option) => `[${option.code}] ${option.name}`}
                            isOptionEqualToValue={(option, value) =>
                              option.id === value?.id || option.code === value?.code
                            }
                            getOptionDisabled={(option) =>
                              addDisabledIdentitySet.has(getProcessIdentity(option))
                            }
                            sx={{ width: '100%' }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={addDraft.pt}
                            onChange={(event) => {
                              setAddDraft((prev) => ({ ...prev, pt: event.target.value }));
                            }}
                            onWheel={(e) => e.target.blur()}
                            inputProps={{ min: 0 }}
                            placeholder="-"
                            sx={{ width: 86 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {formatSeconds(addPreviewAtTotalSeconds)}
                        </TableCell>
                        <TableCell align="right">
                          <Stack
                            direction="column"
                            spacing={0.5}
                            alignItems="flex-end"
                            sx={{ minWidth: 110 }}
                          >
                            <TextField
                              size="small"
                              type="number"
                              value={resolveDraftStInputValue(
                                addDraft,
                                addPreviewStTotalSeconds
                              )}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                const hasManualValue = String(nextValue).trim() !== '';
                                setAddDraft((prev) => ({
                                  ...prev,
                                  stManual: hasManualValue,
                                  st: nextValue,
                                }));
                              }}
                              onWheel={(e) => e.target.blur()}
                              inputProps={{ min: 0 }}
                              placeholder="-"
                              sx={{ width: 86 }}
                            />
                          </Stack>
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="저장">
                              <IconButton size="small" onClick={handleSaveAddRow}>
                                <CheckIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="취소">
                              <IconButton size="small" onClick={handleCancelAddRow}>
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}

                    {addError && isAddingRow && (
                      <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                        <TableCell colSpan={6} sx={{ py: 0.75 }}>
                          <Typography variant="caption" color="error">
                            {addError}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}

                    {safeProcesses.length === 0 && !isAddingRow ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                          등록된 공정이 없습니다. 상단의 행 추가로 바로 입력해보세요.
                        </TableCell>
                      </TableRow>
                    ) : (
                      safeProcesses.map((process, index) => (
                        <Draggable
                          key={process.instanceId}
                          draggableId={process.instanceId}
                          index={index}
                          isDragDisabled={Boolean(isAddingRow)}
                        >
                          {(dragProvided) => {
                            const previewAtTotalSeconds =
                              resolveProcessAtPerPieceSeconds(process, displayOrderQuantity);
                            const previewStTotalSeconds =
                              resolveProcessStPerPieceSeconds(process, displayOrderQuantity);

                            return (
                              <>
                                <TableRow
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  hover
                                >
                                  <TableCell
                                    align="center"
                                    {...dragProvided.dragHandleProps}
                                    sx={{
                                      cursor: isAddingRow ? 'not-allowed' : 'grab',
                                      color: 'text.secondary',
                                    }}
                                  >
                                    <Stack
                                      direction="row"
                                      spacing={0.25}
                                      alignItems="center"
                                      justifyContent="center"
                                    >
                                      <DragIndicatorIcon fontSize="small" />
                                      <Typography variant="caption">{index + 1}</Typography>
                                    </Stack>
                                  </TableCell>

                                  <TableCell>
                                    {`[${process.code}] ${process.name}`}
                                  </TableCell>

                                  <TableCell align="right">
                                    <TextField
                                      key={process.instanceId + '_pt'}
                                      size="small"
                                      type="number"
                                      defaultValue={toDraftNumberText(process.pt)}
                                      onBlur={(e) => handleInlineChange(process, 'pt', e.target.value)}
                                      onWheel={(e) => e.target.blur()}
                                      inputProps={{ min: 0 }}
                                      placeholder="-"
                                      sx={{ width: 86 }}
                                    />
                                  </TableCell>

                                  <TableCell align="right">
                                    {formatSeconds(previewAtTotalSeconds)}
                                  </TableCell>
                                  <TableCell align="right">
                                    <TextField
                                      key={process.instanceId + '_st'}
                                      size="small"
                                      type="number"
                                      defaultValue={process.stManual ? toDraftNumberText(process.ct) : ''}
                                      onBlur={(e) => handleInlineChange(process, 'st', e.target.value)}
                                      onWheel={(e) => e.target.blur()}
                                      inputProps={{ min: 0 }}
                                      placeholder="-"
                                      sx={{ width: 86, '& input': { fontWeight: process?.stManual ? 700 : 400 } }}
                                    />
                                  </TableCell>
                                  <TableCell align="center">
                                    {renderRowActions(process)}
                                  </TableCell>
                                </TableRow>
                              </>
                            );
                          }}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </TableBody>
                )}
              </Droppable>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    총 시간 합계
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {hasAT ? formatSeconds(totalAT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'primary.main' }}>
                    {hasST ? formatSeconds(totalST) : '-'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </DragDropContext>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default StyleProcess;

