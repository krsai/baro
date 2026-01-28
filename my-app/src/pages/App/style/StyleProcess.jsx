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
  TableFooter,
} from '@mui/material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ProcessEditModal from './ProcessEditModal';

const StyleProcess = ({ processes, onProcessesChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);

  const formatTime = (value, unit = '초', notSetDisplay = '-') => {
    // 0 is a valid value, so we check against null/undefined explicitly.
    if (value === null || typeof value === 'undefined' || value === '') {
      return notSetDisplay;
    }
    return `${value}${unit}`;
  };

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

  const totals = (processes || []).reduce(
    (acc, process) => {
      if (typeof process.pt === 'number') {
        acc.pt += process.pt;
      }
      if (typeof process.at === 'number') {
        acc.at += process.at;
      }
      const stValue = process.st || process.smv;
      if (typeof stValue === 'number') {
        acc.st += stValue;
      }
      return acc;
    },
    { pt: 0, at: 0, st: 0 }
  );

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
                  <TableCell sx={{width: '20%'}}>PT(임시)</TableCell>
                  <TableCell sx={{width: '20%'}}>AT(실측)</TableCell>
                  <TableCell sx={{width: '20%'}}>ST(표준)</TableCell>
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
                            <TableCell>{formatTime(process.pt)}</TableCell>
                            <TableCell>{formatTime(process.at, '초', '데이터 부족')}</TableCell>
                            <TableCell>{formatTime(process.st || process.smv)}</TableCell>
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
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>합계</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{formatTime(totals.pt)}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{formatTime(totals.at)}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{formatTime(totals.st)}</TableCell>
                </TableRow>
              </TableFooter>
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