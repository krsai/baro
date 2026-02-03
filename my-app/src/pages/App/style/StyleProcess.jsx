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

const StyleProcess = ({ processes = [], onProcessesChange }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);

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
      const updatedProcesses = processes.map((p) =>
        p.instanceId === editingProcess.instanceId ? { ...p, ...data } : p
      );
      onProcessesChange(updatedProcesses);
    } else {
      // Add mode
      onProcessesChange([...processes, ...data]);
    }
  };

  const handleRemoveProcess = (instanceId) => {
    onProcessesChange(processes.filter((p) => p.instanceId !== instanceId));
  };
  
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newProcesses = Array.from(processes);
    const [reorderedItem] = newProcesses.splice(result.source.index, 1);
    newProcesses.splice(result.destination.index, 0, reorderedItem);
    onProcessesChange(newProcesses);
  };

  const totalST = useMemo(() => 
    processes.reduce((acc, p) => acc + (p.quantity * p.st), 0),
    [processes]
  );
  
  const formatTime = (value) => `${value}초`;

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
                  <TableCell align="right">표준 시간 (ST)</TableCell>
                  <TableCell align="right">총 시간</TableCell>
                  <TableCell align="center">삭제</TableCell>
                </TableRow>
              </TableHead>
              <Droppable droppableId="processes">
                {(provided) => (
                  <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                    {processes.map((process, index) => (
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
                            <TableCell align="right">{formatTime(process.st)}</TableCell>
                            <TableCell align="right">{formatTime(process.quantity * process.st)}</TableCell>
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
                  <TableCell colSpan={4} align="right" sx={{ fontWeight: 'bold' }}>총 표준 시간 합계</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatTime(totalST)}</TableCell>
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
