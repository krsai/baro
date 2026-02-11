import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import AppPageContainer from '../../../components/AppPageContainer';
import { useApp } from '../../../context/AppContext';

const buildWorkerLabel = (worker) => {
  if (worker?.name && worker.name.trim()) return worker.name.trim();
  if (worker?.email && worker.email.trim()) return worker.email.trim();
  return `Worker ${worker?.id ?? ''}`.trim();
};

const LineBoard = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification } = useApp();
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [lines, setLines] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [newLineName, setNewLineName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

    return { byLine, unassigned };
  }, [lines, workers]);

  const fetchFactories = async () => {
    try {
      const response = await fetch(`${API_BASE}/factories`);
      const data = await response.json();
      if (response.ok) {
        const list = Array.isArray(data) ? data : [];
        setFactories(list);
        if (!selectedFactoryId && list.length > 0) {
          setSelectedFactoryId(String(list[0].id));
        }
      } else {
        showNotification(data?.error || 'Failed to load factories.', 'error');
      }
    } catch (_error) {
      showNotification('Failed to load factories.', 'error');
    }
  };

  const fetchLines = async (factoryId) => {
    if (!factoryId) return;
    try {
      const response = await fetch(`${API_BASE}/lines?factoryId=${factoryId}`);
      const data = await response.json();
      if (response.ok) {
        setLines(Array.isArray(data) ? data : []);
      } else {
        showNotification(data?.error || 'Failed to load lines.', 'error');
      }
    } catch (_error) {
      showNotification('Failed to load lines.', 'error');
    }
  };

  const fetchWorkers = async (factoryId) => {
    if (!factoryId) return;
    try {
      const response = await fetch(`${API_BASE}/line-workers?factoryId=${factoryId}`);
      const data = await response.json();
      if (response.ok) {
        setWorkers(Array.isArray(data) ? data : []);
      } else {
        showNotification(data?.error || 'Failed to load workers.', 'error');
      }
    } catch (_error) {
      showNotification('Failed to load workers.', 'error');
    }
  };

  useEffect(() => {
    fetchFactories();
  }, [API_BASE]);

  useEffect(() => {
    if (!selectedFactoryId) {
      setLines([]);
      setWorkers([]);
      return;
    }
    setLoading(true);
    Promise.all([fetchLines(selectedFactoryId), fetchWorkers(selectedFactoryId)])
      .finally(() => setLoading(false));
  }, [API_BASE, selectedFactoryId]);

  const handleAddLine = async () => {
    if (saving) return;
    const trimmedName = newLineName.trim();
    if (!selectedFactoryId) {
      showNotification('Select a factory first.', 'warning');
      return;
    }
    if (!trimmedName) {
      showNotification('Line name is required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId: Number(selectedFactoryId), name: trimmedName }),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || 'Failed to create line.', 'error');
        return;
      }
      setLines((prev) => [...prev, data]);
      setNewLineName('');
      showNotification('Line created.', 'success');
    } catch (_error) {
      showNotification('Failed to create line.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleManagerChange = async (lineId, managerEmployeeId) => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerEmployeeId: managerEmployeeId || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || 'Failed to update line.', 'error');
        return;
      }
      setLines((prev) => prev.map((line) => (line.id === data.id ? data : line)));
      showNotification('Line manager updated.', 'success');
    } catch (_error) {
      showNotification('Failed to update line.', 'error');
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
    const sourceLineId =
      workers.find((worker) => worker.id === employeeId)?.currentLineId ?? null;

    if (String(sourceLineId ?? '') === String(destinationLineId ?? '')) {
      return;
    }

    const previousWorkers = workers;
    const previousLines = lines;

    setWorkers((prev) =>
      prev.map((worker) =>
        worker.id === employeeId
          ? { ...worker, currentLineId: destinationLineId }
          : worker
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
        const response = await fetch(`${API_BASE}/line-assignments/unassign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId }),
        });
        const data = await response.json();
        if (!response.ok) {
          showNotification(data?.error || 'Failed to unassign worker.', 'error');
          return;
        }
      } else {
        const lineId = Number(lineMatch[1]);
        const response = await fetch(`${API_BASE}/line-assignments/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineId, employeeId }),
        });
        const data = await response.json();
        if (!response.ok) {
          showNotification(data?.error || 'Failed to assign worker.', 'error');
          return;
        }
      }

      // Optimistic update already applied; skip refetch for responsiveness.
    } catch (_error) {
      setWorkers(previousWorkers);
      setLines(previousLines);
      showNotification('Failed to update assignment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderWorkerCard = (worker, index) => (
    <Draggable key={worker.id} draggableId={String(worker.id)} index={index}>
      {(provided, snapshot) => (
        <Paper
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          variant="outlined"
          sx={{
            p: 1,
            mb: 1,
            backgroundColor: snapshot.isDragging ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
          }}
        >
          <Typography variant="body2">{buildWorkerLabel(worker)}</Typography>
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
      <Typography variant="h4" gutterBottom>
        Line Management
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            select
            size="small"
            label="Factory"
            value={selectedFactoryId}
            onChange={(event) => setSelectedFactoryId(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            {factories.length === 0 && (
              <MenuItem value="">No factories</MenuItem>
            )}
            {factories.map((factory) => (
              <MenuItem key={factory.id} value={String(factory.id)}>
                {factory.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label="New Line Name"
            value={newLineName}
            onChange={(event) => setNewLineName(event.target.value)}
            sx={{ minWidth: 240 }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddLine}
            disabled={!selectedFactoryId || saving}
          >
            Add Line
          </Button>
        </Box>
      </Paper>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6">Unassigned Workers</Typography>
                <Chip size="small" label={lineWorkers.unassigned.length} />
              </Box>
              <Droppable droppableId="unassigned">
                {(provided, snapshot) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{
                      minHeight: 120,
                      p: 1,
                      borderRadius: 1,
                      border: '1px dashed rgba(0, 0, 0, 0.2)',
                      backgroundColor: snapshot.isDraggingOver
                        ? 'rgba(25, 118, 210, 0.08)'
                        : 'transparent',
                    }}
                  >
                    {lineWorkers.unassigned.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No unassigned workers.
                      </Typography>
                    )}
                    {lineWorkers.unassigned.map((worker, index) => renderWorkerCard(worker, index))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </Paper>
          </Grid>

          {lines.map((line) => {
            const workersForLine = lineWorkers.byLine.get(String(line.id)) ?? [];
            return (
              <Grid item xs={12} md={3} key={line.id}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Typography variant="h6">{line.name}</Typography>
                    <Chip size="small" label={workersForLine.length} />
                  </Box>

                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>Line Manager</InputLabel>
                    <Select
                      label="Line Manager"
                      value={line.managerEmployeeId ? String(line.managerEmployeeId) : ''}
                      onChange={(event) => handleManagerChange(line.id, event.target.value)}
                      disabled={saving || workersForLine.length === 0}
                    >
                      <MenuItem value="">None</MenuItem>
                      {workersForLine.map((worker) => (
                        <MenuItem key={worker.id} value={String(worker.id)}>
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
                          minHeight: 120,
                          p: 1,
                          borderRadius: 1,
                          border: '1px dashed rgba(0, 0, 0, 0.2)',
                          backgroundColor: snapshot.isDraggingOver
                            ? 'rgba(76, 175, 80, 0.08)'
                            : 'transparent',
                        }}
                      >
                        {workersForLine.length === 0 && (
                          <Typography variant="body2" color="text.secondary">
                            Drop workers here.
                          </Typography>
                        )}
                        {workersForLine.map((worker, index) =>
                          renderWorkerCard(worker, index)
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
      </DragDropContext>

      {loading && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading...
        </Typography>
      )}
    </AppPageContainer>
  );
};

export default LineBoard;
