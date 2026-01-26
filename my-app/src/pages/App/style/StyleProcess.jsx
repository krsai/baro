import React, { useState } from 'react';
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
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useApp } from '../../../context/AppContext';
import ProcessEditModal from './ProcessEditModal';

// Mock data for the list of processes
const initialProcesses = [
  { id: 'P-001', name: '주머니 달기', smv: 10, etd: 12 },
  { id: 'P-002', name: '소매 부착', smv: 15, etd: 16 },
  { id: 'P-003', name: '단추 구멍', smv: 8, etd: 9 },
  { id: 'P-004', name: '밑단 처리', smv: 20, etd: 22 },
];

const StyleProcess = () => {
  const { navigateToPath } = useApp();
  const [processes, setProcesses] = useState(initialProcesses);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);

  const handleAddNewClick = () => {
    // For now, just log the action
    console.log('새 공정 추가 버튼 클릭');
  };
  
  const handleRowDoubleClick = (process) => {
    setSelectedProcess(process);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProcess(null);
  };

  const handleSaveProcess = (updatedProcess) => {
    const newProcesses = processes.map((p) =>
      p.id === updatedProcess.id ? updatedProcess : p
    );
    setProcesses(newProcesses);
    handleCloseModal();
  };

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    const newProcesses = Array.from(processes);
    const [reorderedItem] = newProcesses.splice(result.source.index, 1);
    newProcesses.splice(result.destination.index, 0, reorderedItem);

    setProcesses(newProcesses);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">공정 목록</Typography>
        <Button
          onClick={handleAddNewClick}
          variant="contained"
          color="primary"
        >
          새 공정 추가
        </Button>
      </Box>
      <Paper variant="outlined">
        <TableContainer>
          <DragDropContext onDragEnd={onDragEnd}>
            <Table stickyHeader aria-label="process list table">
              <TableHead>
                <TableRow>
                  <TableCell sx={{width: '40%'}}>공정 이름</TableCell>
                  <TableCell sx={{width: '30%'}}>표준 공정 시간 (SMV)</TableCell>
                  <TableCell sx={{width: '30%'}}>산출 공정 시간 (ETD)</TableCell>
                </TableRow>
              </TableHead>
              <Droppable droppableId="processes">
                {(provided) => (
                  <TableBody {...provided.droppableProps} ref={provided.innerRef}>
                    {processes.map((process, index) => (
                      <Draggable key={process.id} draggableId={process.id} index={index}>
                        {(provided) => (
                          <TableRow
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            hover
                            onDoubleClick={() => handleRowDoubleClick(process)}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell>{process.name}</TableCell>
                            <TableCell>{process.smv}초</TableCell>
                            <TableCell>{process.etd}초</TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </TableBody>
                )}
              </Droppable>
            </Table>
          </DragDropContext>
        </TableContainer>
      </Paper>
      <ProcessEditModal
        open={isModalOpen}
        onClose={handleCloseModal}
        process={selectedProcess}
        onSave={handleSaveProcess}
      />
    </Box>
  );
};

export default StyleProcess;