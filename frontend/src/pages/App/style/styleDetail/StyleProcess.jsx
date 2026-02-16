import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  IconButton,
  Drawer,
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ProcessForm from './ProcessForm';
import {
  calculateProcessLineTotal,
  calculateProcessTotal,
  formatSeconds,
  hasAnyProcessTime,
  normalizeProcesses,
} from '../../../../utils/processTime';

const StyleProcess = ({ processes = [], onProcessesChange }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const safeProcesses = useMemo(() => normalizeProcesses(processes), [processes]);

  const handleOpenAddDrawer = () => {
    setEditingProcess(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEditDrawer = (process) => {
    setEditingProcess(process);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    // It's good practice to reset the editing state when the drawer closes
    setEditingProcess(null);
  };

  const handleSave = (data) => {
    if (editingProcess) {
      // Edit mode
      const updatedProcesses = safeProcesses.map((p) =>
        p.instanceId === editingProcess.instanceId ? { ...p, ...data } : p
      );
      onProcessesChange(updatedProcesses);
    } else {
      // Add mode
      onProcessesChange([...safeProcesses, ...normalizeProcesses(data)]);
    }
  };

  const handleRemoveProcess = (instanceId) => {
    onProcessesChange(safeProcesses.filter((p) => p.instanceId !== instanceId));
  };
  
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newProcesses = Array.from(safeProcesses);
    const [reorderedItem] = newProcesses.splice(result.source.index, 1);
    newProcesses.splice(result.destination.index, 0, reorderedItem);
    onProcessesChange(newProcesses);
  };

  const totalPT = useMemo(() => calculateProcessTotal(safeProcesses, 'pt'), [safeProcesses]);
  const totalAT = useMemo(() => calculateProcessTotal(safeProcesses, 'at'), [safeProcesses]);
  const hasPT = useMemo(() => hasAnyProcessTime(safeProcesses, 'pt'), [safeProcesses]);
  const hasAT = useMemo(() => hasAnyProcessTime(safeProcesses, 'at'), [safeProcesses]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">스타일 공정 목록</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDrawer}>
          스타일 공정 추가
        </Button>
      </Box>

      <Paper variant="outlined">
        <TableContainer>
          <DragDropContext onDragEnd={onDragEnd}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{width: '5%'}}></TableCell>
                  <TableCell>공정명</TableCell>
                  <TableCell align="right">수량</TableCell>
                  <TableCell align="right">PT</TableCell>
                  <TableCell align="right">AT(자동)</TableCell>
                  <TableCell align="right">총 PT</TableCell>
                  <TableCell align="right">총 AT</TableCell>
                  <TableCell align="center">삭제</TableCell>
                </TableRow>
              </TableHead>
              <Droppable droppableId="processes">
                {(provided) => (
                  <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                    {safeProcesses.map((process, index) => (
                      <Draggable key={process.instanceId} draggableId={process.instanceId} index={index}>
                        {(provided) => (
                          <TableRow 
                            ref={provided.innerRef} 
                            {...provided.draggableProps} 
                            {...provided.dragHandleProps} 
                            hover
                            onDoubleClick={() => handleOpenEditDrawer(process)}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell sx={{ cursor: 'grab' }}>{index + 1}</TableCell>
                            <TableCell>{`[${process.code}] ${process.name}`}</TableCell>
                            <TableCell align="right">{process.quantity}</TableCell>
                            <TableCell align="right">{formatSeconds(process.pt)}</TableCell>
                            <TableCell align="right">{formatSeconds(process.at)}</TableCell>
                            <TableCell align="right">
                              {formatSeconds(calculateProcessLineTotal(process, 'pt'))}
                            </TableCell>
                            <TableCell align="right">
                              {formatSeconds(calculateProcessLineTotal(process, 'at'))}
                            </TableCell>
                            <TableCell align="center">
                              <IconButton size="small" onClick={(e) => {
                                e.stopPropagation(); // prevent double click event from firing
                                handleRemoveProcess(process.instanceId)
                              }}>
                                <DeleteIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </TableBody>
                )}
              </Droppable>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 'bold' }}>총 시간 합계</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {hasPT ? formatSeconds(totalPT) : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {hasAT ? formatSeconds(totalAT) : '-'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </DragDropContext>
        </TableContainer>
      </Paper>

      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={handleDrawerClose}
      >
        <ProcessForm
          onClose={handleDrawerClose} 
          onSave={handleSave}
          initialData={editingProcess}
        />
      </Drawer>
    </Box>
  );
};

export default StyleProcess;
