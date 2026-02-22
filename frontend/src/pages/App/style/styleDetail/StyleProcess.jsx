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
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcess,
  normalizeProcesses,
  parseOptionalSecondsInput,
  resolveProcessActualTime,
} from '../../../../utils/processTime';

const createEmptyDraft = () => ({
  process: null,
  pt: '',
});

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

const createDraftFromProcess = (process, options) => ({
  process: findMasterProcess(process, options),
  pt: process?.pt === null || process?.pt === undefined ? '' : String(process.pt),
});

const buildProcessPayload = (draft, existingProcess = null) =>
  normalizeProcess({
    ...(existingProcess || {}),
    id: draft.process?.id ?? existingProcess?.id,
    code: draft.process?.code ?? existingProcess?.code,
    name: draft.process?.name ?? existingProcess?.name,
    description: draft.process?.description ?? existingProcess?.description,
    quantity: 1,
    pt: parseOptionalSecondsInput(draft.pt),
    at: resolveProcessActualTime({
      existingAt: existingProcess?.at ?? null,
      workStats: {
        actualTime: draft.process?.actualTime ?? existingProcess?.actualTime ?? null,
      },
    }),
    instanceId: existingProcess?.instanceId || createInstanceId(draft.process),
  });

const StyleProcess = ({ processes = [], onProcessesChange }) => {
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);
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

  const totalPT = useMemo(() => calculateProcessTotal(safeProcesses, 'pt'), [safeProcesses]);
  const totalAT = useMemo(() => calculateProcessTotal(safeProcesses, 'at'), [safeProcesses]);
  const totalCT = useMemo(() => calculateProcessTotal(safeProcesses, 'ct'), [safeProcesses]);
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(() => hasAnyProcessTime(safeProcesses, 'at'), [safeProcesses]);
  const hasCT = useMemo(() => hasAnyProcessTime(safeProcesses, 'ct'), [safeProcesses]);

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
    const nextProcess = buildProcessPayload(addDraft);
    onProcessesChange([...safeProcesses, nextProcess]);
    handleCancelAddRow();
  };

  const handleStartEdit = (process) => {
    setIsAddingRow(false);
    setAddDraft(createEmptyDraft());
    setAddError('');
    setEditingId(process.instanceId);
    setEditDraft(createDraftFromProcess(process, processOptions));
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

    const updatedProcess = buildProcessPayload(editDraft, process);
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
        <Typography variant="h6">스타일 공정 목록</Typography>
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
      </Box>

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
                      title="PT (Planned Time): 1개 생산에 필요한 순수 작업 예상 시간 (초 단위). 수량과 무관하게 개당 값만 입력하세요. 공정 전환·대기 등 부가 시간은 포함하지 않습니다."
                      placement="top"
                    >
                      <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dashed', borderColor: 'text.secondary' }}>
                        PT
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    AT(자동)
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    CT(공식)
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
                        <TableCell align="right">-</TableCell>
                        <TableCell align="right" sx={{ color: 'text.disabled' }}>-</TableCell>
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
                              ? buildProcessPayload(editDraft, process)
                              : process;

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
                                      formatSeconds(process.pt)
                                    )}
                                  </TableCell>

                                  <TableCell align="right">{formatSeconds(previewProcess.at)}</TableCell>
                                  <TableCell align="right">
                                    {process.ct != null ? (
                                      <Chip
                                        size="small"
                                        label={formatSeconds(process.ct)}
                                        color="primary"
                                        variant="outlined"
                                        sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                                      />
                                    ) : (
                                      <Typography variant="caption" color="text.disabled">
                                        미설정
                                      </Typography>
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
                    총 시간 합계
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasAT ? formatSeconds(totalAT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {hasCT ? (
                      <Chip
                        size="small"
                        label={formatSeconds(totalCT)}
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
