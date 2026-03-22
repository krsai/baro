import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import GroupWorkOutlinedIcon from '@mui/icons-material/GroupWorkOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const buildWorkerLabel = (worker) => {
  if (worker?.name && worker.name.trim()) return worker.name.trim();
  if (worker?.email && worker.email.trim()) return worker.email.trim();
  return `작업자 ${worker?.id ?? ''}`.trim();
};

const buildExistingLineKey = (lineId) => `line-${lineId}`;
const buildNewLineKey = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeDraftData = (lineRows = [], workerRows = []) => {
  const draftLines = (Array.isArray(lineRows) ? lineRows : []).map((line) => ({
    ...line,
    id: Number.isFinite(Number(line?.id)) ? Number(line.id) : null,
    localKey: buildExistingLineKey(line.id),
    managerEmployeeId:
      line?.managerEmployeeId !== null &&
      line?.managerEmployeeId !== undefined &&
      line?.managerEmployeeId !== ''
        ? Number(line.managerEmployeeId)
        : null,
  }));
  const lineKeyById = new Map(
    draftLines
      .filter((line) => line.id !== null)
      .map((line) => [String(line.id), line.localKey])
  );
  const draftWorkers = (Array.isArray(workerRows) ? workerRows : []).map((worker) => ({
    ...worker,
    currentLineKey:
      worker?.currentLineId !== null &&
      worker?.currentLineId !== undefined &&
      lineKeyById.has(String(worker.currentLineId))
        ? lineKeyById.get(String(worker.currentLineId))
        : null,
  }));
  return { lines: draftLines, workers: draftWorkers };
};

const buildDraftSnapshot = (lineRows = [], workerRows = []) =>
  JSON.stringify({
    lines: [...lineRows]
      .map((line) => ({
        id: line?.id ?? null,
        localKey: String(line?.localKey || ''),
        name: String(line?.name || '').trim(),
        managerEmployeeId:
          line?.managerEmployeeId !== null &&
          line?.managerEmployeeId !== undefined &&
          line?.managerEmployeeId !== ''
            ? Number(line.managerEmployeeId)
            : null,
      }))
      .sort((a, b) => String(a.localKey).localeCompare(String(b.localKey))),
    workers: [...workerRows]
      .map((worker) => ({
        id: Number(worker?.id || 0),
        currentLineKey: worker?.currentLineKey || null,
      }))
      .sort((a, b) => a.id - b.id),
  });

const EMPTY_SNAPSHOT = buildDraftSnapshot([], []);

const LineBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [lines, setLines] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [originalSnapshot, setOriginalSnapshot] = useState(EMPTY_SNAPSHOT);
  const [newLineName, setNewLineName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLineKey, setEditingLineKey] = useState(null);
  const [editingLineName, setEditingLineName] = useState('');

  const buildOrgQuery = useCallback(
    (params = {}) => buildQueryString({ ...params, orgId: activeOrgId }),
    [activeOrgId]
  );

  const selectedFactory = useMemo(
    () => factories.find((factory) => String(factory.id) === String(selectedFactoryId)) ?? null,
    [factories, selectedFactoryId]
  );

  const lineWorkers = useMemo(() => {
    const byLine = new Map();
    lines.forEach((line) => byLine.set(String(line.localKey), []));
    const unassigned = [];

    workers.forEach((worker) => {
      const lineKey = worker.currentLineKey ? String(worker.currentLineKey) : null;
      if (lineKey && byLine.has(lineKey)) {
        byLine.get(lineKey).push(worker);
      } else {
        unassigned.push(worker);
      }
    });

    lines.forEach((line) => {
      const workersInLine = byLine.get(String(line.localKey));
      if (!workersInLine) return;
      workersInLine.sort((a, b) => {
        if (a.id === line.managerEmployeeId) return -1;
        if (b.id === line.managerEmployeeId) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    });

    return { byLine, unassigned };
  }, [lines, workers]);

  const totalWorkers = workers.length;
  const assignedWorkers = totalWorkers - lineWorkers.unassigned.length;
  const managerAssignedLines = useMemo(
    () =>
      lines.filter(
        (line) =>
          line.managerEmployeeId !== null &&
          line.managerEmployeeId !== undefined &&
          line.managerEmployeeId !== ''
      ).length,
    [lines]
  );

  const currentSnapshot = useMemo(() => buildDraftSnapshot(lines, workers), [lines, workers]);
  const isDirty = currentSnapshot !== originalSnapshot;

  useUnsavedChanges(isDirty || Boolean(editingLineKey));

  const clearInlineEdit = useCallback(() => {
    setEditingLineKey(null);
    setEditingLineName('');
  }, []);

  const loadFactoryBoardData = useCallback(
    async (factoryId) => {
      if (!factoryId) {
        setLines([]);
        setWorkers([]);
        setOriginalSnapshot(EMPTY_SNAPSHOT);
        clearInlineEdit();
        setNewLineName('');
        return;
      }

      setLoading(true);
      try {
        const [lineRows, workerRows] = await Promise.all([
          requestJSON('/lines' + buildOrgQuery({ factoryId })),
          requestJSON('/line-workers' + buildOrgQuery({ factoryId })),
        ]);
        const normalized = normalizeDraftData(lineRows, workerRows);
        setLines(normalized.lines);
        setWorkers(normalized.workers);
        setOriginalSnapshot(buildDraftSnapshot(normalized.lines, normalized.workers));
        clearInlineEdit();
        setNewLineName('');
      } catch (error) {
        showNotification(error?.message || '라인 정보를 불러오는 데 실패했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [buildOrgQuery, clearInlineEdit, showNotification]
  );

  const fetchFactories = useCallback(async () => {
    try {
      const data = await requestJSON('/factories' + buildOrgQuery());
      const list = Array.isArray(data) ? data : [];
      setFactories(list);
      setSelectedFactoryId((prev) => {
        if (prev && list.some((factory) => String(factory.id) === String(prev))) return prev;
        return list.length > 0 ? String(list[0].id) : '';
      });
    } catch (error) {
      showNotification(error?.message || '공장 목록을 불러오는 데 실패했습니다.', 'error');
    }
  }, [buildOrgQuery, showNotification]);

  useEffect(() => {
    fetchFactories();
  }, [fetchFactories]);

  useEffect(() => {
    loadFactoryBoardData(selectedFactoryId);
  }, [activeOrgId, selectedFactoryId, loadFactoryBoardData]);

  const validateLineName = useCallback(
    (lineKey, nextName, sourceLines = lines) => {
      const trimmed = String(nextName || '').trim();
      if (!trimmed) {
        showNotification('라인 이름은 필수입니다.', 'warning');
        return null;
      }
      const hasDuplicate = sourceLines.some(
        (line) =>
          line.localKey !== lineKey && String(line.name || '').trim() === trimmed
      );
      if (hasDuplicate) {
        showNotification('같은 공장 안에 동일한 라인 이름이 이미 있습니다.', 'warning');
        return null;
      }
      return trimmed;
    },
    [lines, showNotification]
  );

  const commitLineNameEdit = useCallback(
    (targetLineKey = editingLineKey, nextName = editingLineName, sourceLines = lines) => {
      if (!targetLineKey) {
        return { nextLines: sourceLines, committed: false };
      }
      const trimmedName = validateLineName(targetLineKey, nextName, sourceLines);
      if (!trimmedName) return null;

      const nextLines = sourceLines.map((line) =>
        line.localKey === targetLineKey ? { ...line, name: trimmedName } : line
      );
      setLines(nextLines);
      clearInlineEdit();
      return { nextLines, committed: true };
    },
    [clearInlineEdit, editingLineKey, editingLineName, lines, validateLineName]
  );

  const handleFactoryChange = useCallback(
    (event) => {
      const nextFactoryId = String(event.target.value || '');
      if (nextFactoryId === selectedFactoryId) return;
      if (
        (isDirty || editingLineKey) &&
        !window.confirm('저장되지 않은 변경사항이 있습니다. 저장하지 않고 공장을 변경하시겠습니까?')
      ) {
        return;
      }
      setSelectedFactoryId(nextFactoryId);
    },
    [editingLineKey, isDirty, selectedFactoryId]
  );

  const handleAddLine = useCallback(() => {
    if (saving) return;
    if (!selectedFactoryId) {
      showNotification('먼저 공장을 선택해 주세요.', 'warning');
      return;
    }
    const trimmedName = validateLineName(null, newLineName, lines);
    if (!trimmedName) return;

    setLines((prev) => [
      ...prev,
      {
        id: null,
        localKey: buildNewLineKey(),
        name: trimmedName,
        managerEmployeeId: null,
      },
    ]);
    setNewLineName('');
  }, [lines, newLineName, saving, selectedFactoryId, showNotification, validateLineName]);

  const handleStartLineNameEdit = useCallback((line) => {
    setEditingLineKey(line.localKey);
    setEditingLineName(line.name || '');
  }, []);

  const handleDeleteLine = useCallback(
    (line) => {
      const workersInLine = lineWorkers.byLine.get(String(line.localKey)) || [];
      const confirmMessage =
        workersInLine.length > 0
          ? `'${line.name}'을(를) 삭제하시겠습니까?\n배정된 작업자 ${workersInLine.length}명은 미배정으로 이동됩니다.`
          : `'${line.name}'을(를) 삭제하시겠습니까?`;
      if (!window.confirm(confirmMessage)) return;

      setLines((prev) => prev.filter((item) => item.localKey !== line.localKey));
      setWorkers((prev) =>
        prev.map((worker) =>
          worker.currentLineKey === line.localKey
            ? { ...worker, currentLineKey: null }
            : worker
        )
      );
      if (editingLineKey === line.localKey) {
        clearInlineEdit();
      }
    },
    [clearInlineEdit, editingLineKey, lineWorkers.byLine]
  );

  const handleManagerChange = useCallback((lineKey, managerEmployeeId) => {
    setLines((prev) =>
      prev.map((line) =>
        line.localKey === lineKey
          ? {
              ...line,
              managerEmployeeId:
                managerEmployeeId !== null &&
                managerEmployeeId !== undefined &&
                managerEmployeeId !== ''
                  ? Number(managerEmployeeId)
                  : null,
            }
          : line
      )
    );
  }, []);

  const handleDragEnd = useCallback(
    (result) => {
      if (saving) return;

      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId) return;

      const employeeId = Number(draggableId);
      if (!Number.isFinite(employeeId)) return;

      const destinationId = String(destination.droppableId || '');
      const destinationLineKey =
        destinationId === 'unassigned'
          ? null
          : destinationId.startsWith('line:')
            ? destinationId.slice(5)
            : null;
      if (destinationId !== 'unassigned' && !destinationLineKey) return;

      const sourceLineKey =
        workers.find((worker) => worker.id === employeeId)?.currentLineKey ?? null;
      if (String(sourceLineKey ?? '') === String(destinationLineKey ?? '')) return;

      setWorkers((prev) =>
        prev.map((worker) =>
          worker.id === employeeId
            ? { ...worker, currentLineKey: destinationLineKey }
            : worker
        )
      );

      if (sourceLineKey) {
        setLines((prev) =>
          prev.map((line) =>
            line.localKey === sourceLineKey && line.managerEmployeeId === employeeId
              ? { ...line, managerEmployeeId: null }
              : line
          )
        );
      }
    },
    [saving, workers]
  );

  const handleResetDraft = useCallback(async () => {
    if (!isDirty && !editingLineKey) return;
    if (!window.confirm('저장되지 않은 변경사항을 모두 되돌릴까요?')) return;
    await loadFactoryBoardData(selectedFactoryId);
  }, [editingLineKey, isDirty, loadFactoryBoardData, selectedFactoryId]);

  const handleSaveChanges = useCallback(async () => {
    if (saving || !selectedFactoryId) return;

    let nextLines = lines;
    if (editingLineKey) {
      const committed = commitLineNameEdit(editingLineKey, editingLineName, lines);
      if (!committed) return;
      nextLines = committed.nextLines;
    }

    if (buildDraftSnapshot(nextLines, workers) === originalSnapshot) {
      showNotification('변경사항이 없습니다.', 'info');
      return;
    }

    setSaving(true);
    try {
      const response = await requestJSON('/lines/batch-save' + buildOrgQuery(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId: Number(selectedFactoryId),
          lines: nextLines.map((line) => ({
            id: line.id ?? null,
            lineKey: line.localKey,
            name: String(line.name || '').trim(),
            managerEmployeeId: line.managerEmployeeId ?? null,
          })),
          workerAssignments: workers.map((worker) => ({
            employeeId: worker.id,
            lineKey: worker.currentLineKey ?? null,
          })),
        }),
      });

      const normalized = normalizeDraftData(response?.lines, response?.workers);
      setLines(normalized.lines);
      setWorkers(normalized.workers);
      setOriginalSnapshot(buildDraftSnapshot(normalized.lines, normalized.workers));
      clearInlineEdit();
      setNewLineName('');
      showNotification('라인 변경사항이 저장되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '라인 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    buildOrgQuery,
    clearInlineEdit,
    commitLineNameEdit,
    editingLineKey,
    editingLineName,
    lines,
    originalSnapshot,
    saving,
    selectedFactoryId,
    showNotification,
    workers,
  ]);

  const renderWorkerCard = useCallback(
    (worker, index, isManager = false) => (
      <Draggable
        key={worker.id}
        draggableId={String(worker.id)}
        index={index}
        isDragDisabled={saving}
      >
        {(provided, snapshot) => (
          <Box
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.25,
              py: 0.85,
              mb: 0.75,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor:
                snapshot.isDragging ? 'primary.main' : isManager ? 'primary.light' : 'divider',
              background: (theme) =>
                snapshot.isDragging
                  ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${theme.palette.background.paper} 100%)`
                  : isManager
                    ? alpha(theme.palette.primary.main, 0.09)
                    : theme.palette.background.paper,
              cursor: saving ? 'default' : 'grab',
              boxShadow: snapshot.isDragging ? 3 : 'none',
              transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
            <Typography variant="body2" fontWeight={isManager ? 700 : 500} noWrap sx={{ flex: 1 }}>
              {buildWorkerLabel(worker)}
            </Typography>
            {isManager ? (
              <Chip size="small" label="라인장" color="primary" variant="filled" />
            ) : null}
          </Box>
        )}
      </Draggable>
    ),
    [saving]
  );

  return (
    <AppPageContainer
      title="라인 관리"
      titleActions={(
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={handleResetDraft}
            disabled={saving || (!isDirty && !editingLineKey)}
          >
            초기화
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveChanges}
            disabled={saving || !selectedFactoryId || (!isDirty && !editingLineKey)}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </Stack>
      )}
      toolbar={(
        <PageToolbar
          right={(
            <>
              <TextField
                select
                size="small"
                label="공장"
                value={selectedFactoryId}
                onChange={handleFactoryChange}
                sx={{ minWidth: { xs: '100%', md: 210 } }}
                disabled={loading || saving}
              >
                {factories.length === 0 && <MenuItem value="">공장 없음</MenuItem>}
                {factories.map((factory) => (
                  <MenuItem key={factory.id} value={String(factory.id)}>
                    {factory.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="새 라인 이름"
                value={newLineName}
                onChange={(event) => setNewLineName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddLine();
                  }
                }}
                sx={{ minWidth: { xs: '100%', md: 220 } }}
                disabled={!selectedFactoryId || loading || saving}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddLine}
                disabled={!selectedFactoryId || loading || saving || !newLineName.trim()}
              >
                라인 추가
              </Button>
            </>
          )}
        />
      )}
    >
      <Stack spacing={2.25}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2.5,
            background: (theme) =>
              `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.06)} 0%, ${theme.palette.background.paper} 72%)`,
          }}
        >
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, borderRadius: 2, borderColor: 'divider', backgroundColor: 'background.paper' }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <FactoryOutlinedIcon sx={{ color: 'text.secondary', fontSize: 19 }} />
                  <Typography variant="caption" color="text.secondary">
                    선택 공장
                  </Typography>
                </Stack>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 0.25 }} noWrap>
                  {selectedFactory?.name || '미선택'}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={4} sm={2} md={3}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, borderRadius: 2, borderColor: 'divider', backgroundColor: 'background.paper' }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <GroupWorkOutlinedIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">
                    라인
                  </Typography>
                </Stack>
                <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
                  {lines.length}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={4} sm={2} md={3}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, borderRadius: 2, borderColor: 'divider', backgroundColor: 'background.paper' }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <ManageAccountsOutlinedIcon sx={{ color: 'success.main', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">
                    라인장 지정
                  </Typography>
                </Stack>
                <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
                  {managerAssignedLines}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={4} sm={2} md={3}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, borderRadius: 2, borderColor: 'divider', backgroundColor: 'background.paper' }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <PersonOffOutlinedIcon sx={{ color: 'warning.main', fontSize: 18 }} />
                  <Typography variant="caption" color="text.secondary">
                    미배정 / 전체
                  </Typography>
                </Stack>
                <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
                  {lineWorkers.unassigned.length} / {totalWorkers}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Box sx={{ display: 'flex', gap: 2.25, alignItems: 'flex-start' }}>
            <Box sx={{ flex: '0 0 20%', minWidth: 0 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2.25,
                  borderRadius: 2.5,
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    미배정 작업자
                  </Typography>
                  <Chip size="small" color="warning" label={`${lineWorkers.unassigned.length}명`} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  라인 카드로 드래그해 배정하세요.
                </Typography>
                <Droppable droppableId="unassigned" isDropDisabled={saving}>
                  {(provided, snapshot) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      sx={{
                        minHeight: 400,
                        overflowY: 'auto',
                        borderRadius: 1.75,
                        border: '1px dashed',
                        borderColor: snapshot.isDraggingOver ? 'warning.main' : 'divider',
                        backgroundColor: snapshot.isDraggingOver
                          ? (theme) => alpha(theme.palette.warning.main, 0.08)
                          : 'transparent',
                        p: 0.75,
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                      }}
                    >
                      {lineWorkers.unassigned.length === 0 && !snapshot.isDraggingOver && (
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ display: 'block', textAlign: 'center', mt: 4 }}
                        >
                          미배정 인원이 없습니다.
                        </Typography>
                      )}
                      {lineWorkers.unassigned.map((worker, index) =>
                        renderWorkerCard(worker, index)
                      )}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Paper>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    라인 및 작업자 정보를 불러오는 중입니다.
                  </Typography>
                </Paper>
              ) : lines.length === 0 && selectedFactory ? (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedFactory.name}에 등록된 라인이 없습니다. 상단에서 라인을 추가해 주세요.
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={1.5}>
                  {lines.map((line) => {
                    const workersInLine = lineWorkers.byLine.get(String(line.localKey)) || [];
                    const isEditingName = editingLineKey === line.localKey;

                    return (
                      <Grid item xs={6} key={line.localKey}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            minHeight: 360,
                            borderRadius: 2.5,
                            borderColor: 'divider',
                            background: (theme) =>
                              `linear-gradient(180deg, ${alpha(theme.palette.info.main, 0.06)} 0%, ${theme.palette.background.paper} 28%)`,
                          }}
                        >
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.25 }}>
                            {isEditingName ? (
                              <>
                                <TextField
                                  size="small"
                                  value={editingLineName}
                                  onChange={(event) => setEditingLineName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      commitLineNameEdit(line.localKey, editingLineName, lines);
                                    }
                                    if (event.key === 'Escape') {
                                      clearInlineEdit();
                                    }
                                  }}
                                  autoFocus
                                  sx={{
                                    flex: 1,
                                    '& .MuiInputBase-input': {
                                      py: 0.55,
                                      fontSize: 14,
                                      fontWeight: 700,
                                    },
                                  }}
                                />
                                <Tooltip title="이름 적용">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      commitLineNameEdit(line.localKey, editingLineName, lines)
                                    }
                                  >
                                    <CheckIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="취소">
                                  <IconButton size="small" onClick={clearInlineEdit}>
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            ) : (
                              <>
                                <Typography variant="subtitle2" fontWeight={800} noWrap sx={{ flex: 1 }}>
                                  {line.name}
                                </Typography>
                                <Chip
                                  size="small"
                                  label={`${workersInLine.length}명`}
                                  color="primary"
                                  variant="outlined"
                                />
                                <Tooltip title="이름 편집">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleStartLineNameEdit(line)}
                                    disabled={saving || Boolean(editingLineKey)}
                                    sx={{ opacity: 0.45, '&:hover': { opacity: 1 } }}
                                  >
                                    <EditIcon sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="라인 삭제">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteLine(line)}
                                    disabled={saving || Boolean(editingLineKey)}
                                    sx={{ opacity: 0.45, '&:hover': { opacity: 1, color: 'error.main' } }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Stack>

                          <FormControl size="small" fullWidth sx={{ mb: 1.15 }}>
                            <InputLabel id={`mgr-${line.localKey}`}>라인장</InputLabel>
                            <Select
                              labelId={`mgr-${line.localKey}`}
                              label="라인장"
                              value={line.managerEmployeeId || ''}
                              onChange={(event) =>
                                handleManagerChange(line.localKey, event.target.value || null)
                              }
                              disabled={saving}
                            >
                              <MenuItem value="">없음</MenuItem>
                              {workersInLine.map((worker) => (
                                <MenuItem key={worker.id} value={worker.id}>
                                  {buildWorkerLabel(worker)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <Droppable droppableId={`line:${line.localKey}`} isDropDisabled={saving}>
                            {(provided, snapshot) => (
                              <Box
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                sx={{
                                  minHeight: 220,
                                  borderRadius: 1.75,
                                  border: '1px dashed',
                                  borderColor: snapshot.isDraggingOver ? 'primary.main' : 'divider',
                                  backgroundColor: snapshot.isDraggingOver
                                    ? (theme) => alpha(theme.palette.primary.main, 0.1)
                                    : (theme) => alpha(theme.palette.grey[500], 0.05),
                                  p: 0.75,
                                  transition: 'background-color 0.2s ease, border-color 0.2s ease',
                                }}
                              >
                                {workersInLine.length === 0 && !snapshot.isDraggingOver && (
                                  <Typography
                                    variant="caption"
                                    color="text.disabled"
                                    sx={{ display: 'block', textAlign: 'center', mt: 4 }}
                                  >
                                    작업자를 여기로 드래그하세요.
                                  </Typography>
                                )}
                                {workersInLine.map((worker, index) =>
                                  renderWorkerCard(
                                    worker,
                                    index,
                                    worker.id === line.managerEmployeeId
                                  )
                                )}
                                {provided.placeholder}
                              </Box>
                            )}
                          </Droppable>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          </Box>
        </DragDropContext>

        {selectedFactory ? (
          <Typography variant="caption" color="text.secondary">
            {selectedFactory.name} 기준 · 라인 {lines.length}개 · 배정 {assignedWorkers}명 ·
            미배정 {lineWorkers.unassigned.length}명
          </Typography>
        ) : null}
      </Stack>
    </AppPageContainer>
  );
};

export default LineBoard;
