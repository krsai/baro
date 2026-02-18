import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
    () => factories.find((factory) => String(factory.id) === String(selectedFactoryId)) ?? null,
    [factories, selectedFactoryId]
  );

  const fetchFactories = async () => {
    try {
      const data = await requestJSON('/factories' + buildOrgQuery());
      const list = Array.isArray(data) ? data : [];
      setFactories(list);
      setSelectedFactoryId((prev) => {
        if (prev && list.some((factory) => String(factory.id) === String(prev))) {
          return prev;
        }
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
    const sourceLineId = workers.find((worker) => worker.id === employeeId)?.currentLineId ?? null;

    if (String(sourceLineId ?? '') === String(destinationLineId ?? '')) return;

    const previousWorkers = workers;
    const previousLines = lines;

    setWorkers((prev) =>
      prev.map((worker) =>
        worker.id === employeeId ? { ...worker, currentLineId: destinationLineId } : worker
      )
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
        });
      } else {
        await requestJSON('/line-assignments/assign' + buildOrgQuery(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId: destinationLineId, employeeId }),
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
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 1,
            backgroundColor: snapshot.isDragging ? 'action.hover' : 'background.paper',
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
            borderWidth: isManager ? 2 : 1,
            borderColor: isManager ? 'primary.main' : 'divider',
          }}
        >
          <Typography variant="body2" fontWeight="medium">
            {buildWorkerLabel(worker)}
          </Typography>
          {worker.email && (
            <Typography variant="caption" color="text.secondary">
              {worker.email}
            </Typography>
          )}
        </Paper>
      )}
    </Draggable>
  );

  return (
    <AppPageContainer>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          라인 관리
        </Typography>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} alignItems="center">
            <TextField
              select
              size="small"
              label="공장 선택"
              value={selectedFactoryId}
              onChange={(event) => setSelectedFactoryId(event.target.value)}
              sx={{ minWidth: 220, flexShrink: 0 }}
              disabled={loading}
            >
              {factories.length === 0 && <MenuItem value="">공장이 없습니다</MenuItem>}
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
              sx={{ flexGrow: 1, minWidth: 200 }}
              disabled={!selectedFactoryId || saving}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddLine}
              disabled={!selectedFactoryId || saving || !newLineName.trim()}
              sx={{ flexShrink: 0, minWidth: 120 }}
            >
              라인 추가
            </Button>
          </Stack>
        </Paper>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4} lg={3}>
              <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" component="h2">
                    미배정 작업자
                  </Typography>
                  <Chip size="small" label={lineWorkers.unassigned.length} color="info" />
                </Stack>

                <Droppable droppableId="unassigned">
                  {(provided, snapshot) => (
                    <Box
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      sx={{
                        minHeight: 320,
                        p: 1,
                        borderRadius: 1,
                        backgroundColor: snapshot.isDraggingOver ? 'action.selected' : 'transparent',
                      }}
                    >
                      {lineWorkers.unassigned.map((worker, index) => renderWorkerCard(worker, index))}
                      {provided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </Paper>
            </Grid>

            <Grid item xs={12} md={8} lg={9}>
              <Grid container spacing={2}>
                {lines.map((line) => {
                  const workersInLine = lineWorkers.byLine.get(String(line.id)) || [];

                  return (
                    <Grid item xs={12} sm={6} lg={4} key={line.id}>
                      <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
                        <Stack spacing={1.5}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" component="h3">
                              {line.name}
                            </Typography>
                            <Chip size="small" label={workersInLine.length} color="primary" />
                          </Stack>

                          <FormControl size="small" fullWidth>
                            <InputLabel id={`manager-label-${line.id}`}>라인 관리자</InputLabel>
                            <Select
                              labelId={`manager-label-${line.id}`}
                              label="라인 관리자"
                              value={line.managerEmployeeId || ''}
                              onChange={(event) =>
                                handleManagerChange(line.id, event.target.value || null)
                              }
                              disabled={saving}
                            >
                              <MenuItem value="">관리자 없음</MenuItem>
                              {workersInLine.map((worker) => (
                                <MenuItem key={worker.id} value={worker.id}>
                                  {buildWorkerLabel(worker)}
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
                                  minHeight: 260,
                                  p: 1,
                                  borderRadius: 1,
                                  backgroundColor: snapshot.isDraggingOver
                                    ? 'action.selected'
                                    : 'transparent',
                                }}
                              >
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
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>
          </Grid>
        </DragDropContext>

        {loading && (
          <Alert severity="info">라인/작업자 정보를 불러오는 중입니다.</Alert>
        )}

        {!loading && selectedFactory && lines.length === 0 && (
          <Alert severity="warning">
            {`${selectedFactory.name}에 등록된 라인이 없습니다. 상단에서 라인을 추가해 주세요.`}
          </Alert>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default LineBoard;
