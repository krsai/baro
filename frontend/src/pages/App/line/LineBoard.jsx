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
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import AppPageContainer from '../../../components/AppPageContainer';
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
      if (isUnassigned) {
        await requestJSON('/line-assignments/unassign' + buildOrgQuery(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId }),
          skipGlobalLoading: true,
        });
      } else {
        await requestJSON('/line-assignments/assign' + buildOrgQuery(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId: destinationLineId, employeeId }),
          skipGlobalLoading: true,
        });
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
            px: 1.5,
            py: 0.75,
            mb: 0.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: isManager ? 'primary.main' : 'divider',
            backgroundColor: snapshot.isDragging ? 'action.hover' : isManager ? 'primary.50' : 'background.paper',
            cursor: 'grab',
          }}
        >
          <Typography variant="body2" fontWeight={isManager ? 600 : 400} noWrap>
            {isManager ? '★ ' : ''}{buildWorkerLabel(worker)}
          </Typography>
        </Box>
      )}
    </Draggable>
  );

  return (
    <AppPageContainer>
      {/* 상단 컨트롤 */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <TextField
          select
          size="small"
          label="공장"
          value={selectedFactoryId}
          onChange={(e) => setSelectedFactoryId(e.target.value)}
          sx={{ minWidth: 180 }}
          disabled={loading}
        >
          {factories.length === 0 && <MenuItem value="">공장 없음</MenuItem>}
          {factories.map((f) => (
            <MenuItem key={f.id} value={String(f.id)}>
              {f.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label="새 라인 이름"
          value={newLineName}
          onChange={(e) => setNewLineName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddLine()}
          sx={{ width: 200 }}
          disabled={!selectedFactoryId || saving}
        />
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddLine}
          disabled={!selectedFactoryId || saving || !newLineName.trim()}
        >
          라인 추가
        </Button>

        {selectedFactory && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {selectedFactory.name} · 라인 {lines.length}개
          </Typography>
        )}
      </Stack>

      {/* 메인 영역 */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Grid container spacing={2} alignItems="flex-start">
          {/* 미배정 */}
          <Grid item xs={12} sm={3} lg={2}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  미배정
                </Typography>
                <Chip size="small" label={lineWorkers.unassigned.length} />
              </Stack>
              <Droppable droppableId="unassigned">
                {(provided, snapshot) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{
                      minHeight: 120,
                      borderRadius: 1,
                      backgroundColor: snapshot.isDraggingOver ? 'action.selected' : 'transparent',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    {lineWorkers.unassigned.length === 0 && !snapshot.isDraggingOver && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
                        없음
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
          </Grid>

          {/* 라인 카드 목록 */}
          <Grid item xs={12} sm={9} lg={10}>
            {loading ? (
              <Typography variant="body2" color="text.secondary">불러오는 중...</Typography>
            ) : lines.length === 0 && selectedFactory ? (
              <Typography variant="body2" color="text.secondary">
                {selectedFactory.name}에 등록된 라인이 없습니다. 상단에서 라인을 추가해 주세요.
              </Typography>
            ) : (
              <Grid container spacing={1.5}>
                {lines.map((line) => {
                  const workersInLine = lineWorkers.byLine.get(String(line.id)) || [];
                  const isEditingName = editingLineId === line.id;

                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={line.id}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        {/* 라인명 + 인원 수 */}
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
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
                                sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.5, fontSize: 14, fontWeight: 600 } }}
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
                              <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
                                {line.name}
                              </Typography>
                              <Chip size="small" label={`${workersInLine.length}명`} color="primary" variant="outlined" />
                              <Tooltip title="이름 편집">
                                <IconButton
                                  size="small"
                                  onClick={() => handleStartLineNameEdit(line)}
                                  disabled={saving || Boolean(editingLineId)}
                                  sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
                                >
                                  <EditIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Stack>

                        {/* 라인 관리자 */}
                        <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                          <InputLabel id={`mgr-${line.id}`}>관리자</InputLabel>
                          <Select
                            labelId={`mgr-${line.id}`}
                            label="관리자"
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

                        {/* 드롭 영역 */}
                        <Droppable droppableId={`line-${line.id}`}>
                          {(provided, snapshot) => (
                            <Box
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              sx={{
                                minHeight: 80,
                                borderRadius: 1,
                                border: '1px dashed',
                                borderColor: snapshot.isDraggingOver ? 'primary.main' : 'divider',
                                backgroundColor: snapshot.isDraggingOver ? 'primary.50' : 'grey.50',
                                p: 0.5,
                                transition: 'background-color 0.15s, border-color 0.15s',
                              }}
                            >
                              {workersInLine.length === 0 && !snapshot.isDraggingOver && (
                                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                                  여기로 드래그
                                </Typography>
                              )}
                              {workersInLine.map((worker, index) =>
                                renderWorkerCard(worker, index, worker.id === line.managerEmployeeId)
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
          </Grid>
        </Grid>
      </DragDropContext>
    </AppPageContainer>
  );
};

export default LineBoard;
