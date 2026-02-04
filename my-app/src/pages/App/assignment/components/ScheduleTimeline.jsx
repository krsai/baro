import React from 'react';
import { Paper, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Droppable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';

// 오늘부터 14일간의 날짜 배열 생성
const getTimelineDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }
  return dates;
};

const ScheduleTimeline = ({ factories, columns, tasks }) => {
  const timelineDates = getTimelineDates();

  return (
    <Paper variant="outlined" sx={{ p: 2, width: '100%', overflowX: 'auto' }}>
      <Typography variant="h6" gutterBottom>공장/라인별 스케줄</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '100px', fontWeight: 'bold', left: 0, position: 'sticky', zIndex: 1, backgroundColor: 'white' }}>공장</TableCell>
              <TableCell sx={{ width: '100px', fontWeight: 'bold', left: '100px', position: 'sticky', zIndex: 1, backgroundColor: 'white' }}>라인</TableCell>
              {timelineDates.map(date => (
                <TableCell key={date.toISOString()} align="center" sx={{ minWidth: '120px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                  {`${date.getMonth() + 1}/${date.getDate()}`}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.values(factories).map(factory => {
              const factoryLines = factory.lineIds.map(lineId => columns[lineId]);
              return factoryLines.map((line, lineIndex) => (
                <TableRow key={line.id}>
                  {lineIndex === 0 && (
                    <TableCell rowSpan={factory.lineIds.length} sx={{
                      fontWeight: 'bold',
                      verticalAlign: 'top',
                      borderRight: '1px solid #e0e0e0',
                      left: 0,
                      position: 'sticky',
                      zIndex: 1,
                      backgroundColor: 'white'
                    }}>
                      {factory.name}
                    </TableCell>
                  )}
                  <TableCell sx={{
                    borderRight: '1px solid #e0e0e0',
                    left: '100px',
                    position: 'sticky',
                    zIndex: 1,
                    backgroundColor: 'white'
                  }}>
                    {line.title}
                  </TableCell>
                  {timelineDates.map(date => {
                    const currentDate = new Date(new Date(date).setHours(0, 0, 0, 0));
                    const currentDateStr = currentDate.toISOString().split('T')[0];
                    const droppableId = `${line.id}_${currentDateStr}`;

                    const activeTasks = line.taskIds
                      .map(taskId => tasks[taskId])
                      .filter(task => {
                        if (!task.startDate || !task.durationDays) return false;
                        
                        const startDate = new Date(new Date(task.startDate).setHours(0, 0, 0, 0));
                        const durationMs = task.durationDays * 24 * 60 * 60 * 1000;
                        const endDate = new Date(startDate.getTime() + durationMs);

                        return currentDate >= startDate && currentDate < endDate;
                      });
                    
                    return (
                      <Droppable droppableId={droppableId} key={droppableId}>
                        {(provided, snapshot) => (
                          <TableCell
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            align="left"
                            sx={{
                              minWidth: '120px',
                              backgroundColor: snapshot.isDraggingOver ? 'lightyellow' : '#fdfdfd',
                              borderLeft: '1px solid #e0e0e0',
                              verticalAlign: 'top',
                              p: 1,
                              position: 'relative',
                            }}
                          >
                            {activeTasks.map(task => {
                              const taskStartDate = new Date(new Date(task.startDate).setHours(0, 0, 0, 0));
                              const isStartDay = task.startDate === currentDateStr;

                              const dayStartMs = currentDate.getTime();
                              const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000);
                              const taskStartMs = new Date(task.startDate).getTime();
                              const taskDurationMs = task.durationDays * 24 * 60 * 60 * 1000;
                              const taskEndMs = taskStartMs + taskDurationMs;

                              let widthFactor = 1.0;
                              
                              const startsInDay = taskStartMs >= dayStartMs && taskStartMs < dayEndMs;
                              const endsInDay = taskEndMs > dayStartMs && taskEndMs <= dayEndMs;

                              if (startsInDay && endsInDay) {
                                widthFactor = (taskEndMs - taskStartMs) / (dayEndMs - dayStartMs);
                              } else if (startsInDay) {
                                widthFactor = (dayEndMs - taskStartMs) / (dayEndMs - dayStartMs);
                              } else if (endsInDay) {
                                widthFactor = (taskEndMs - dayStartMs) / (dayEndMs - dayStartMs);
                              }
                              
                              return (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  index={line.taskIds.indexOf(task.id)}
                                  isContinuation={!isStartDay}
                                  widthFactor={widthFactor}
                                />
                              )
                            })}
                            {provided.placeholder}
                            <Box sx={{ minHeight: '60px' }} />
                          </TableCell>
                        )}
                      </Droppable>
                    );
                  })}
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default ScheduleTimeline;
