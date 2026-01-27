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
import ProcessEditModal from './ProcessEditModal';

const StyleProcess = ({ processes, onProcessesChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);

  const handleAddNewClick = () => {
    // This should also be handled by the parent in a real app
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
    onProcessesChange(newProcesses); // Notify parent of the change
    handleCloseModal();
  };

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    const newProcesses = Array.from(processes);
    const [reorderedItem] = newProcesses.splice(result.source.index, 1);
    newProcesses.splice(result.destination.index, 0, reorderedItem);

    onProcessesChange(newProcesses); // Notify parent of the change
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
                    {(processes || []).map((process, index) => ( // Add guard for processes being undefined
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