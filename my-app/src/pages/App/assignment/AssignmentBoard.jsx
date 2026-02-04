import React, { useState, useEffect } from 'react';
import {
  Grid, Dialog, DialogTitle, DialogContent,
  TextField, DialogActions, Button, CircularProgress, Box
} from '@mui/material';
import { DragDropContext } from '@hello-pangea/dnd';
import AppPageContainer from '../../../components/AppPageContainer';
import PendingTasksPanel from './components/PendingTasksPanel';
import ScheduleTimeline from './components/ScheduleTimeline';

const WORKING_HOURS_PER_DAY = 8; // 하루 근무 시간

// API로부터 받아올 데이터를 시뮬레이션하는 Mock 데이터
const mockData = {
  tasks: {
    'task-1': { id: 'task-1', content: '샘플 주문 1 (스타일 A)', quantity: 100, pt: 3600 }, // 작업 시간 증가
    'task-2': { id: 'task-2', content: '샘플 주문 2 (스타일 B)', quantity: 250, pt: 2400 }, // 작업 시간 증가
    'task-3': { id: 'task-3', content: '샘플 주문 3 (스타일 C)', quantity: 50, pt: 5200 },  // 작업 시간 증가
  },
  columns: {
    'pending': {
      id: 'pending',
      title: '대기 중인 작업 목록',
      taskIds: ['task-1', 'task-2', 'task-3'],
    },
    'line-1': {
      id: 'line-1',
      factory: '하노이 1공장',
      title: '라인 1',
      taskIds: [],
      lineMembers: 5,
    },
    'line-2': {
      id: 'line-2',
      factory: '하노이 1공장',
      title: '라인 2',
      taskIds: [],
      lineMembers: 7,
    },
    'line-A': {
      id: 'line-A',
      factory: '호치민 2공장',
      title: 'A-라인',
      taskIds: [],
      lineMembers: 10,
    },
  },
  factories: {
    'factory-1': { id: 'factory-1', name: '하노이 1공장', lineIds: ['line-1', 'line-2'] },
    'factory-2': { id: 'factory-2', name: '호치민 2공장', lineIds: ['line-A'] },
  },
  columnOrder: ['pending', 'line-1', 'line-2', 'line-A']
};

const AssignmentBoard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [taskToSplit, setTaskToSplit] = useState(null);
  const [splitQuantity, setSplitQuantity] = useState('');

  useEffect(() => {
    // API 호출을 시뮬레이션
    setTimeout(() => {
      setData(mockData);
      setLoading(false);
    }, 1000);
  }, []);

  const handleOpenSplitDialog = (task) => {
    setTaskToSplit(task);
    setSplitQuantity('');
    setSplitDialogOpen(true);
  };

  const handleCloseSplitDialog = () => {
    setSplitDialogOpen(false);
    setTaskToSplit(null);
  };

  const handleConfirmSplit = () => {
    const quantity = parseInt(splitQuantity, 10);
    if (!taskToSplit || !quantity || quantity <= 0 || quantity >= taskToSplit.quantity) {
      alert('유효한 수량을 입력하세요.');
      return;
    }

    const remainingQuantity = taskToSplit.quantity - quantity;
    const newTask1 = { ...taskToSplit, id: `task-${Date.now()}`, quantity: remainingQuantity };
    const newTask2 = { ...taskToSplit, id: `task-${Date.now() + 1}`, quantity: quantity };
    
    setData(prevData => {
      const newTasks = { ...prevData.tasks };
      delete newTasks[taskToSplit.id];
      newTasks[newTask1.id] = newTask1;
      newTasks[newTask2.id] = newTask2;
      const pendingColumn = prevData.columns['pending'];
      const newTaskIds = pendingColumn.taskIds.filter(id => id !== taskToSplit.id);
      const originalIndex = pendingColumn.taskIds.indexOf(taskToSplit.id);
      newTaskIds.splice(originalIndex, 0, newTask1.id, newTask2.id);
      const newPendingColumn = { ...pendingColumn, taskIds: newTaskIds };
      return { ...prevData, tasks: newTasks, columns: { ...prevData.columns, 'pending': newPendingColumn } };
    });
    handleCloseSplitDialog();
  };

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || !data) return;

    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const startColId = source.droppableId.split('_')[0];
    const finishColId = destination.droppableId.split('_')[0];
    
    const startCol = data.columns[startColId];
    const finishCol = data.columns[finishColId];
    const newTasks = { ...data.tasks };
    const task = newTasks[draggableId];

    // 컬럼 내 이동
    if (startCol === finishCol) {
      const newTaskIds = Array.from(startCol.taskIds);
      newTaskIds.splice(source.index, 1);
      newTaskIds.splice(destination.index, 0, draggableId);
      
      // 날짜가 변경된 경우, task의 startDate 업데이트
      if (destination.droppableId.includes('_')) {
        const dropDate = destination.droppableId.split('_')[1];
        task.startDate = dropDate;
      }
      
      const newColumn = { ...startCol, taskIds: newTaskIds };
      setData(prev => ({ ...prev, tasks: newTasks, columns: { ...prev.columns, [newColumn.id]: newColumn } }));
      return;
    }
    
    // 컬럼 간 이동
    const startTaskIds = Array.from(startCol.taskIds);
    startTaskIds.splice(source.index, 1);
    const newStart = { ...startCol, taskIds: startTaskIds };

    const finishTaskIds = Array.from(finishCol.taskIds);
    finishTaskIds.splice(destination.index, 0, draggableId);
    const newFinish = { ...finishCol, taskIds: finishTaskIds };
    
    if (destination.droppableId.includes('_')) {
      const [lineId, dropDateStr] = destination.droppableId.split('_');
      const line = data.columns[lineId];

      const totalTimeNeeded = task.pt * task.quantity; // seconds
      const dailyCapacityPerLine = line.lineMembers * WORKING_HOURS_PER_DAY * 3600; // seconds
      const durationDays = totalTimeNeeded / dailyCapacityPerLine;

      task.startDate = dropDateStr;
      task.durationDays = durationDays;
    } else {
      // 대기열로 다시 이동하는 경우 날짜 정보 삭제
      delete task.startDate;
      delete task.durationDays;
    }

    setData(prev => ({
      ...prev,
      tasks: newTasks,
      columns: {
        ...prev.columns,
        [newStart.id]: newStart,
        [newFinish.id]: newFinish,
      },
    }));
  };
  
  if (loading || !data) {
    return (
      <AppPageContainer>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <DragDropContext onDragEnd={onDragEnd}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <PendingTasksPanel
              column={data.columns['pending']}
              tasks={data.columns['pending'].taskIds.map(taskId => data.tasks[taskId])}
              onSplit={handleOpenSplitDialog}
            />
          </Grid>
          <Grid item xs={12} md={9}>
            <ScheduleTimeline
              factories={data.factories}
              columns={data.columns}
              tasks={data.tasks}
            />
          </Grid>
        </Grid>
      </DragDropContext>

      {taskToSplit && (
        <Dialog open={splitDialogOpen} onClose={handleCloseSplitDialog}>
          <DialogTitle>작업 수량 분할</DialogTitle>
          <DialogContent>
            <Typography variant="h6">{taskToSplit.content}</Typography>
            <Typography gutterBottom>현재 수량: {taskToSplit.quantity}개</Typography>
            <TextField
              autoFocus
              margin="dense"
              label="분할할 수량"
              type="number"
              fullWidth
              variant="standard"
              value={splitQuantity}
              onChange={(e) => setSplitQuantity(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseSplitDialog}>취소</Button>
            <Button onClick={handleConfirmSplit}>확인</Button>
          </DialogActions>
        </Dialog>
      )}
    </AppPageContainer>
  );
};

export default AssignmentBoard;
