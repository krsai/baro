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
import EditIcon from '@mui/icons-material/Edit';
import SearchableSelect from '../../../../components/SearchableSelect';
import { fetchProcessAttributes } from '../../../../utils/attributeApi';
import {
  calculateProcessTotalForOrderQuantity,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcess,
  normalizeProcesses,
  parseOptionalSecondsInput,
  resolveProcessAtTotalSecondsForOrderQuantity,
  resolveProcessActualTime,
  resolveProcessStTotalSecondsForOrderQuantity,
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

const toDraftNumberText = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(roundToScale(parsed, 4));
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

const findMasterProcess = (process, options) => {
  if (!process) return null;
  return (
    options.find((item) => item.id === process.id) ||
    options.find((item) => item.code === process.code) ||
    options.find((item) => item.name === process.name) ||
    null
  );
};

const createDraftFromProcess = (process, options, timeRefQuantity = 1) => {
  const resolvedTimeRefQuantity = toPositiveInt(
    process?.timeRefQuantity,
    toPositiveInt(timeRefQuantity, 1)
  );
  const processQuantity = toPositiveInt(process?.quantity, 1);
  const ptTotalForQ =
    process?.pt == null
      ? null
      : process.pt * processQuantity * resolvedTimeRefQuantity;
  const stManual = process?.stManual === true;
  const stTotalForQ =
    stManual && process?.ct != null
      ? process.ct * processQuantity * resolvedTimeRefQuantity
      : null;

  return {
    process: findMasterProcess(process, options),
    pt: toDraftNumberText(ptTotalForQ),
    stManual,
    st: toDraftNumberText(stTotalForQ),
  };
};

const buildProcessPayload = (draft, existingProcess = null, timeRefQuantity = 1) => {
  const resolvedTimeRefQuantity = toPositiveInt(timeRefQuantity, 1);
  const processQuantity = toPositiveInt(existingProcess?.quantity, 1);
  const ptTotalForQ = parseOptionalSecondsInput(draft.pt);
  const stTotalForQ = parseOptionalSecondsInput(draft.st);
  const stManual = draft.stManual === true;
  const ptPerPiece =
    ptTotalForQ == null
      ? null
      : roundToScale(ptTotalForQ / (processQuantity * resolvedTimeRefQuantity), 4);
  const ctPerPiece =
    !stManual || stTotalForQ == null
      ? null
      : roundToScale(stTotalForQ / (processQuantity * resolvedTimeRefQuantity), 4);

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
  if (!Array.isArray(rows) || rows.length === 0) return 1;
  const first = rows.find((row) => Number.isFinite(Number(row?.timeRefQuantity)));
  return toPositiveInt(first?.timeRefQuantity, 1);
};

const StyleProcess = ({ processes = [], onProcessesChange }) => {
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
  const [timeRefQuantity, setTimeRefQuantity] = useState(() =>
    resolveCommonTimeRefQuantity(safeProcesses)
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
    return Array.from(byIdentity.values());
  }, [normalizedAttributeOptions, safeProcesses]);

  const [isAddingRow, setIsAddingRow] = useState(false);
  const [addDraft, setAddDraft] = useState(createEmptyDraft);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(createEmptyDraft);
  const [editError, setEditError] = useState('');

  const totalPT = useMemo(
    () => calculateProcessTotalForOrderQuantity(safeProcesses, 'pt', timeRefQuantity),
    [safeProcesses, timeRefQuantity]
  );
  const totalAT = useMemo(
    () => calculateProcessTotalForOrderQuantity(safeProcesses, 'at', timeRefQuantity),
    [safeProcesses, timeRefQuantity]
  );
  const totalST = useMemo(
    () =>
      safeProcesses.reduce((acc, process) => {
        const value = resolveProcessStTotalSecondsForOrderQuantity(process, timeRefQuantity);
        return value == null ? acc : acc + value;
      }, 0),
    [safeProcesses, timeRefQuantity]
  );
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(() => hasAnyProcessTime(safeProcesses, 'at'), [safeProcesses]);
  const hasST = useMemo(
    () =>
      safeProcesses.some(
        (process) =>
          resolveProcessStTotalSecondsForOrderQuantity(process, timeRefQuantity) != null
      ),
    [safeProcesses, timeRefQuantity]
  );

  const addDisabledIdentitySet = useMemo(() => {
    const set = new Set();
    safeProcesses.forEach((process) => {
      const identity = getProcessIdentity(process);
      if (identity) set.add(identity);
    });
    return set;
  }, [safeProcesses]);

  const editDisabledIdentitySet = useMemo(() => {
    const set = new Set();
    safeProcesses.forEach((process) => {
      if (process.instanceId === editingId) return;
      const identity = getProcessIdentity(process);
      if (identity) set.add(identity);
    });
    return set;
  }, [editingId, safeProcesses]);
  const canStartAdd = !isLoadingOptions && processOptions.length > 0;

  useEffect(() => {
    if (safeProcesses.length === 0) {
      setTimeRefQuantity(1);
      return;
    }
    const nextRef = resolveCommonTimeRefQuantity(safeProcesses);
    setTimeRefQuantity((prev) => (prev === nextRef ? prev : nextRef));
  }, [safeProcesses]);

  const handleTimeRefQuantityChange = (event) => {
    const nextValue = toPositiveInt(event.target.value, 1);
    setTimeRefQuantity(nextValue);
    if (safeProcesses.length === 0) return;
    const needsSync = safeProcesses.some(
      (process) => toPositiveInt(process?.timeRefQuantity, 1) !== nextValue
    );
    if (!needsSync) return;
    onProcessesChange(
      safeProcesses.map((process) =>
        normalizeProcess({
          ...process,
          timeRefQuantity: nextValue,
        })
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
      return '수동 ST(q) 값을 입력해주세요.';
    }

    return '';
  };

  const handleStartAddRow = () => {
    if (editingId || !canStartAdd) return;
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

  const handleStartEdit = (process) => {
    setIsAddingRow(false);
    setAddDraft(createEmptyDraft());
    setAddError('');
    setEditingId(process.instanceId);
    setEditDraft(createDraftFromProcess(process, processOptions, timeRefQuantity));
    setEditError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft(createEmptyDraft());
    setEditError('');
  };

  const handleSaveEdit = (process) => {
    const errorMessage = validateDraft(editDraft, { ignoreInstanceId: process.instanceId });
    if (errorMessage) {
      setEditError(errorMessage);
      return;
    }

    const updatedProcess = buildProcessPayload(editDraft, process, timeRefQuantity);
    const nextProcesses = safeProcesses.map((item) =>
      item.instanceId === process.instanceId ? updatedProcess : item
    );
    onProcessesChange(nextProcesses);
    handleCancelEdit();
  };

  const handleRemoveProcess = (instanceId) => {
    onProcessesChange(safeProcesses.filter((process) => process.instanceId !== instanceId));
    if (editingId === instanceId) {
      handleCancelEdit();
    }
  };

  const onDragEnd = (result) => {
    if (isAddingRow || editingId) return;
    if (!result.destination) return;

    const nextProcesses = Array.from(safeProcesses);
    const [reorderedItem] = nextProcesses.splice(result.source.index, 1);
    nextProcesses.splice(result.destination.index, 0, reorderedItem);
    onProcessesChange(nextProcesses);
  };

  const renderRowActions = (process) => (
    <Stack direction="row" spacing={0.5} justifyContent="center">
      <Tooltip title="수정">
        <span>
          <IconButton
            size="small"
            onClick={() => handleStartEdit(process)}
            disabled={isAddingRow || Boolean(editingId)}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="삭제">
        <IconButton size="small" onClick={() => handleRemoveProcess(process.instanceId)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const addPreviewProcess = isAddingRow
    ? buildProcessPayload(addDraft, null, timeRefQuantity)
    : null;
  const addPreviewAtTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessAtTotalSecondsForOrderQuantity(addPreviewProcess, timeRefQuantity);
  const addPreviewStTotalSeconds =
    addPreviewProcess == null
      ? null
      : resolveProcessStTotalSecondsForOrderQuantity(addPreviewProcess, timeRefQuantity);

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 1.25 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Typography variant="h6">스타일 공정 목록</Typography>
          <Tooltip title="공통 기준 수량 q를 먼저 지정한 뒤 PT(q) / ST(q)를 입력합니다.">
            <TextField
              size="small"
              type="number"
              label="기준 수량 q"
              value={timeRefQuantity}
              onChange={handleTimeRefQuantityChange}
              inputProps={{ min: 1, step: 1 }}
              sx={{ width: 140 }}
            />
          </Tooltip>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleStartAddRow}
          disabled={isAddingRow || Boolean(editingId) || !canStartAdd}
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
                      title="PT(q): 기준 수량 q에서의 총 예상 시간(초)입니다."
                      placement="top"
                    >
                      <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                        PT(q)
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    AT(q, 자동)
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    ST(q)
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
                            <Button
                              size="small"
                              variant={addDraft.stManual ? 'contained' : 'outlined'}
                              onClick={() =>
                                setAddDraft((prev) => {
                                  const nextManual = !prev.stManual;
                                  if (!nextManual) {
                                    return { ...prev, stManual: false };
                                  }
                                  if (String(prev.st || '').trim()) {
                                    return { ...prev, stManual: true };
                                  }
                                  return {
                                    ...prev,
                                    stManual: true,
                                    st: toDraftNumberText(addPreviewStTotalSeconds),
                                  };
                                })
                              }
                            >
                              {addDraft.stManual ? '수동 ST' : '자동 ST'}
                            </Button>
                            {addDraft.stManual ? (
                              <TextField
                                size="small"
                                type="number"
                                value={addDraft.st}
                                onChange={(event) =>
                                  setAddDraft((prev) => ({ ...prev, st: event.target.value }))
                                }
                                inputProps={{ min: 0 }}
                                placeholder="-"
                                sx={{ width: 86 }}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                {formatSeconds(addPreviewStTotalSeconds)}
                              </Typography>
                            )}
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
                          isDragDisabled={Boolean(isAddingRow || editingId)}
                        >
                          {(dragProvided) => {
                            const isEditing = editingId === process.instanceId;
                            const previewProcess = isEditing
                              ? buildProcessPayload(editDraft, process, timeRefQuantity)
                              : process;
                            const previewPtTotalSeconds =
                              calculateProcessTotalForOrderQuantity(
                                [previewProcess],
                                'pt',
                                timeRefQuantity
                              ) || null;
                            const previewAtTotalSeconds =
                              resolveProcessAtTotalSecondsForOrderQuantity(
                                previewProcess,
                                timeRefQuantity
                              );
                            const previewStTotalSeconds =
                              resolveProcessStTotalSecondsForOrderQuantity(
                                previewProcess,
                                timeRefQuantity
                              );

                            return (
                              <>
                                <TableRow
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  hover
                                  onDoubleClick={() => {
                                    if (!isAddingRow && !editingId) handleStartEdit(process);
                                  }}
                                  sx={{ cursor: isEditing ? 'default' : 'pointer' }}
                                >
                                  <TableCell
                                    align="center"
                                    {...dragProvided.dragHandleProps}
                                    sx={{
                                      cursor: isAddingRow || editingId ? 'not-allowed' : 'grab',
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
                                    {isEditing ? (
                                      <SearchableSelect
                                        size="small"
                                        label="공정 선택"
                                        options={processOptions}
                                        value={editDraft.process}
                                        onChange={(_event, value) => {
                                          setEditDraft((prev) => ({ ...prev, process: value }));
                                          setEditError('');
                                        }}
                                        getOptionLabel={(option) => `[${option.code}] ${option.name}`}
                                        isOptionEqualToValue={(option, value) =>
                                          option.id === value?.id || option.code === value?.code
                                        }
                                        getOptionDisabled={(option) =>
                                          editDisabledIdentitySet.has(getProcessIdentity(option))
                                        }
                                        sx={{ width: '100%' }}
                                      />
                                    ) : (
                                      `[${process.code}] ${process.name}`
                                    )}
                                  </TableCell>

                                  <TableCell align="right">
                                    {isEditing ? (
                                      <TextField
                                        size="small"
                                        type="number"
                                        value={editDraft.pt}
                                        onChange={(event) =>
                                          setEditDraft((prev) => ({ ...prev, pt: event.target.value }))
                                        }
                                        inputProps={{ min: 0 }}
                                        placeholder="-"
                                        sx={{ width: 86 }}
                                      />
                                    ) : (
                                      formatSeconds(previewPtTotalSeconds)
                                    )}
                                  </TableCell>

                                  <TableCell align="right">{formatSeconds(previewAtTotalSeconds)}</TableCell>
                                  <TableCell align="right">
                                    {isEditing ? (
                                      <Stack
                                        direction="column"
                                        spacing={0.5}
                                        alignItems="flex-end"
                                        sx={{ minWidth: 110 }}
                                      >
                                        <Button
                                          size="small"
                                          variant={editDraft.stManual ? 'contained' : 'outlined'}
                                          onClick={() =>
                                            setEditDraft((prev) => ({
                                              ...prev,
                                              stManual: !prev.stManual,
                                              st:
                                                !prev.stManual && !String(prev.st || '').trim()
                                                  ? toDraftNumberText(previewStTotalSeconds)
                                                  : prev.st,
                                            }))
                                          }
                                        >
                                          {editDraft.stManual ? '수동 ST' : '자동 ST'}
                                        </Button>
                                        {editDraft.stManual ? (
                                          <TextField
                                            size="small"
                                            type="number"
                                            value={editDraft.st}
                                            onChange={(event) =>
                                              setEditDraft((prev) => ({
                                                ...prev,
                                                st: event.target.value,
                                              }))
                                            }
                                            inputProps={{ min: 0 }}
                                            placeholder="-"
                                            sx={{ width: 86 }}
                                          />
                                        ) : (
                                          <Typography variant="caption" color="text.secondary">
                                            {formatSeconds(previewStTotalSeconds)}
                                          </Typography>
                                        )}
                                      </Stack>
                                    ) : (
                                      <Chip
                                        size="small"
                                        label={formatSeconds(previewStTotalSeconds)}
                                        color={process?.stManual ? 'primary' : 'default'}
                                        variant="outlined"
                                        sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell align="center">
                                    {isEditing ? (
                                      <Stack direction="row" spacing={0.5} justifyContent="center">
                                        <Tooltip title="저장">
                                          <IconButton size="small" onClick={() => handleSaveEdit(process)}>
                                            <CheckIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="취소">
                                          <IconButton size="small" onClick={handleCancelEdit}>
                                            <CloseIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Stack>
                                    ) : (
                                      renderRowActions(process)
                                    )}
                                  </TableCell>
                                </TableRow>

                                {isEditing && editError && (
                                  <TableRow>
                                    <TableCell colSpan={6} sx={{ py: 0.75 }}>
                                      <Typography variant="caption" color="error">
                                        {editError}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                )}
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
                  <TableCell colSpan={2} align="right" sx={{ fontWeight: 700 }}>
                    {`총 시간 합계 (q=${timeRefQuantity})`}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasAT ? formatSeconds(totalAT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasST ? (
                      <Chip
                        size="small"
                        label={formatSeconds(totalST)}
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 700 }}
                      />
                    ) : (
                      '-'
                    )}
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
