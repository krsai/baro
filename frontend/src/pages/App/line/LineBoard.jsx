import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const buildWorkerLabel = (worker) => {
  if (worker?.name && worker.name.trim()) return worker.name.trim();
  if (worker?.email && worker.email.trim()) return worker.email.trim();
  return `작업자 ${worker?.id ?? ''}`.trim();
};

const LineBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [lines, setLines] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [newLineName, setNewLineName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 라인명 인라인 편집
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingLineName, setEditingLineName] = useState('');
  const [deletingLineId, setDeletingLineId] = useState(null);

  const buildOrgQuery = (params = {}) =>
    buildQueryString({ ...params, orgId: activeOrgId });

  const lineWorkers = useMemo(() => {
    const byLine = new Map();
    lines.forEach((line) => byLine.set(String(line.id), []));
    const unassigned = [];

    workers.forEach((worker) => {
      const lineId = worker.currentLineId ? String(worker.currentLineId) : null;
      if (lineId && byLine.has(lineId)) {
        byLine.get(lineId).push(worker);
      } else {
        unassigned.push(worker);
      }
    });

    lines.forEach((line) => {
      const workersInLine = byLine.get(String(line.id));
      if (!workersInLine) return;
      workersInLine.sort((a, b) => {
        if (a.id === line.managerEmployeeId) return -1;
        if (b.id === line.managerEmployeeId) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    });

    return { byLine, unassigned };
  }, [lines, workers]);

  const selectedFactory = useMemo(
    () => factories.find((f) => String(f.id) === String(selectedFactoryId)) ?? null,
    [factories, selectedFactoryId]
  );
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

  const fetchFactories = async () => {
    try {
      const data = await requestJSON('/factories' + buildOrgQuery());
      const list = Array.isArray(data) ? data : [];
      setFactories(list);
      setSelectedFactoryId((prev) => {
        if (prev && list.some((f) => String(f.id) === String(prev))) return prev;
        return list.length > 0 ? String(list[0].id) : '';
      });
    } catch (error) {
      showNotification(error?.message || '공장 목록을 불러오는 데 실패했습니다.', 'error');
    }
  };

  const fetchLines = async (factoryId) => {
    if (!factoryId) return;
    try {
      const data = await requestJSON('/lines' + buildOrgQuery({ factoryId }));
      setLines(Array.isArray(data) ? data : []);
    } catch (error) {
      showNotification(error?.message || '라인 목록을 불러오는 데 실패했습니다.', 'error');
    }
  };

  const fetchWorkers = async (factoryId) => {
    if (!factoryId) return;
    try {
      const data = await requestJSON('/line-workers' + buildOrgQuery({ factoryId }));
      setWorkers(Array.isArray(data) ? data : []);
    } catch (error) {
      showNotification(error?.message || '작업자 목록을 불러오는 데 실패했습니다.', 'error');
    }
  };

  useEffect(() => {
    fetchFactories();
  }, [activeOrgId]);

  useEffect(() => {
    if (!selectedFactoryId) {
      setLines([]);
      setWorkers([]);
      return;
    }
    setLoading(true);
    Promise.all([fetchLines(selectedFactoryId), fetchWorkers(selectedFactoryId)]).finally(
      () => setLoading(false)
    );
  }, [activeOrgId, selectedFactoryId]);

  const handleAddLine = async () => {
    if (saving) return;
    const trimmedName = newLineName.trim();
    if (!selectedFactoryId) {
      showNotification('먼저 공장을 선택해 주세요.', 'warning');
      return;
    }
    if (!trimmedName) {
      showNotification('라인 이름은 필수입니다.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const data = await requestJSON('/lines' + buildOrgQuery(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId: Number(selectedFactoryId), name: trimmedName }),
      });
      setLines((prev) => [...prev, data]);
      setNewLineName('');
      showNotification('라인이 생성되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '라인 생성에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartLineNameEdit = (line) => {
    setEditingLineId(line.id);
    setEditingLineName(line.name);
  };

  const handleCancelLineNameEdit = () => {
    setEditingLineId(null);
    setEditingLineName('');
  };

  const handleLineNameSave = async (lineId) => {
    const trimmedName = editingLineName.trim();
    setEditingLineId(null);
    setEditingLineName('');
    if (!trimmedName) return;
    const currentLine = lines.find((l) => l.id === lineId);
    if (currentLine?.name === trimmedName) return;

    setSaving(true);
    try {
      const data = await requestJSON(`/lines/${lineId}` + buildOrgQuery(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      setLines((prev) => prev.map((line) => (line.id === data.id ? data : line)));
      showNotification('라인 이름이 변경되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '라인 이름 변경에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleManagerChange = async (lineId, managerEmployeeId) => {
    if (saving) return;
    setSaving(true);
    try {
      const data = await requestJSON(`/lines/${lineId}` + buildOrgQuery(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerEmployeeId: managerEmployeeId || null }),
      });
      setLines((prev) => prev.map((line) => (line.id === data.id ? data : line)));
      showNotification('라인 관리자가 지정되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '라인 정보 업데이트에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (line) => {
    const workersInLine = lineWorkers.byLine.get(String(line.id)) || [];
    const confirmMsg =
      workersInLine.length > 0
        ? `'${line.name}'을(를) 삭제하시겠습니까?\n배정된 작업자 ${workersInLine.length}명은 미배정으로 이동됩니다.`
        : `'${line.name}'을(를) 삭제하시겠습니까?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingLineId(line.id);
    try {
      const result = await requestJSON(`/lines/${line.id}` + buildOrgQuery(), {
        method: 'DELETE',
      });
      setLines((prev) => prev.filter((l) => l.id !== line.id));
      setWorkers((prev) =>
        prev.map((w) => (w.currentLineId === line.id ? { ...w, currentLineId: null } : w))
      );
      const msg =
        result?.movedWorkers > 0
          ? `라인을 삭제했습니다. 작업자 ${result.movedWorkers}명이 미배정으로 이동되었습니다.`
          : '라인이 삭제되었습니다.';
      showNotification(msg, 'success');
    } catch (error) {
      showNotification(error?.message || '라인 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingLineId(null);
    }
  };

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const employeeId = Number(draggableId);
    if (!Number.isFinite(employeeId)) return;

    const destinationId = destination.droppableId;
    const isUnassigned = destinationId === 'unassigned';
    const lineMatch = destinationId.match(/^line-(\d+)$/);
    if (!isUnassigned && !lineMatch) return;

    const destinationLineId = isUnassigned ? null : Number(lineMatch[1]);
    const sourceLineId = workers.find((w) => w.id === employeeId)?.currentLineId ?? null;
    if (String(sourceLineId ?? '') === String(destinationLineId ?? '')) return;

    const previousWorkers = workers;
    const previousLines = lines;

    setWorkers((prev) =>
      prev.map((w) => (w.id === employeeId ? { ...w, currentLineId: destinationLineId } : w))
    );
    if (sourceLineId) {
      setLines((prev) =>
        prev.map((line) =>
          line.id === sourceLineId && line.managerEmployeeId === employeeId
            ? { ...line, managerEmployeeId: null }
            : line
        )
      );
    }

    setSaving(true);
    try {
      let responseData;
      if (isUnassigned) {
        responseData = await requestJSON('/line-assignments/unassign' + buildOrgQuery(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId }),
          skipGlobalLoading: true,
        });
      } else {
        responseData = await requestJSON('/line-assignments/assign' + buildOrgQuery(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId: destinationLineId, employeeId }),
          skipGlobalLoading: true,
        });
      }

      // API 응답의 lineHeadcounts로 라인 인원 수 갱신
      const lineHeadcounts = responseData?.lineHeadcounts;
      if (lineHeadcounts && typeof lineHeadcounts === 'object') {
        setLines((prev) =>
          prev.map((line) => {
            const key = String(line.id);
            if (key in lineHeadcounts) {
              return { ...line, headcount: lineHeadcounts[key] };
            }
            return line;
          })
        );
      }
    } catch (error) {
      setWorkers(previousWorkers);
      setLines(previousLines);
      showNotification(error?.message || '배정 정보 업데이트에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderWorkerCard = (worker, index, isManager = false) => (
    <Draggable key={worker.id} draggableId={String(worker.id)} index={index}>
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
            cursor: 'grab',
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
  );

  return (
    <AppPageContainer
      title="라인 관리"
      toolbar={(
        <PageToolbar
          right={(
            <>
              <TextField
                select
                size="small"
                label="공장"
                value={selectedFactoryId}
                onChange={(e) => setSelectedFactoryId(e.target.value)}
                sx={{ minWidth: { xs: '100%', md: 210 } }}
                disabled={loading}
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
                onChange={(e) => setNewLineName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLine()}
                sx={{ minWidth: { xs: '100%', md: 220 } }}
                disabled={!selectedFactoryId || saving}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddLine}
                disabled={!selectedFactoryId || saving || !newLineName.trim()}
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
            {/* 미배정 작업자 - 전체 너비의 1/5 */}
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
                <Droppable droppableId="unassigned">
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

            {/* 라인 카드들 - 전체 너비의 4/5, 내부에서 4열 */}
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
                    const workersInLine = lineWorkers.byLine.get(String(line.id)) || [];
                    const isEditingName = editingLineId === line.id;
                    const displayedHeadcount =
                      Number.isFinite(Number(line.headcount)) && Number(line.headcount) >= 0
                        ? Number(line.headcount)
                        : workersInLine.length;

                    return (
                      <Grid item xs={6} key={line.id}>
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
                                  onChange={(e) => setEditingLineName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleLineNameSave(line.id);
                                    if (e.key === 'Escape') handleCancelLineNameEdit();
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
                                <Tooltip title="저장">
                                  <IconButton size="small" onClick={() => handleLineNameSave(line.id)}>
                                    <CheckIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="취소">
                                  <IconButton size="small" onClick={handleCancelLineNameEdit}>
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
                                  label={`${workersInLine.length}/${displayedHeadcount}명`}
                                  color="primary"
                                  variant="outlined"
                                />
                                <Tooltip title="이름 편집">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleStartLineNameEdit(line)}
                                    disabled={saving || Boolean(editingLineId) || deletingLineId === line.id}
                                    sx={{ opacity: 0.45, '&:hover': { opacity: 1 } }}
                                  >
                                    <EditIcon sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="라인 삭제">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteLine(line)}
                                    disabled={saving || Boolean(editingLineId) || Boolean(deletingLineId)}
                                    sx={{ opacity: 0.45, '&:hover': { opacity: 1, color: 'error.main' } }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Stack>

                          <FormControl size="small" fullWidth sx={{ mb: 1.15 }}>
                            <InputLabel id={`mgr-${line.id}`}>라인장</InputLabel>
                            <Select
                              labelId={`mgr-${line.id}`}
                              label="라인장"
                              value={line.managerEmployeeId || ''}
                              onChange={(e) => handleManagerChange(line.id, e.target.value || null)}
                              disabled={saving}
                            >
                              <MenuItem value="">없음</MenuItem>
                              {workersInLine.map((w) => (
                                <MenuItem key={w.id} value={w.id}>
                                  {buildWorkerLabel(w)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <Droppable droppableId={`line-${line.id}`}>
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
