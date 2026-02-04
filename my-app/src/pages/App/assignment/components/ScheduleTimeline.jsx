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
              const factoryLines = factory.lineIds.map(lineId => columns[lineId]).filter(Boolean);

              // 각 라인에 대한 메타데이터(높이, 작업 위치) 사전 계산
              const rowMetaData = factoryLines.map(line => {
                const lineTasks = line.taskIds
                  .map(taskId => tasks[taskId])
                  .filter(Boolean)
                  .filter(t => t.startDate && t.durationDays)
                  .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
                
                const taskPositions = {}; // { taskId: laneIndex }
                const lanes = []; // { freeUntil: Date }[]

                lineTasks.forEach(task => {
                  const taskStart = new Date(new Date(task.startDate).setHours(0, 0, 0, 0));
                  // durationDays가 0보다 작거나 같은 경우를 방지
                  const duration = Math.max(0, task.durationDays);
                  const taskEnd = new Date(taskStart.getTime() + duration * 24 * 60 * 60 * 1000);

                  let laneIndex = lanes.findIndex(lane => lane.freeUntil <= taskStart);

                  if (laneIndex === -1) {
                    laneIndex = lanes.length;
                    lanes.push({ freeUntil: taskEnd });
                  } else {
                    lanes[laneIndex].freeUntil = taskEnd;
                  }
                  taskPositions[task.id] = laneIndex;
                });
                
                const cardVerticalSpacing = 44;
                const requiredRowHeight = lanes.length > 0 
                  ? (lanes.length * cardVerticalSpacing) + 16 
                  : 60;
                
                return { lineId: line.id, requiredRowHeight, taskPositions };
              });

              return factoryLines.map((line, lineIndex) => {
                const meta = rowMetaData.find(m => m.lineId === line.id);
                if (!meta) return null; // Or some fallback UI

                const { requiredRowHeight, taskPositions } = meta;

                return (
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
                      height: `${requiredRowHeight}px`,
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
                        .filter(Boolean)
                        .filter(task => {
                          if (!task.startDate || !task.durationDays) return false;
                          const startDate = new Date(new Date(task.startDate).setHours(0, 0, 0, 0));
                          const duration = Math.max(0, task.durationDays);
                          const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
                          return currentDate >= startDate && currentDate < endDate;
                        });

                      const tasksStartingOnDate = activeTasks.filter(task => task.startDate === currentDateStr);
                      
                      return (
                        <Droppable droppableId={droppableId} key={droppableId}>
                          {(provided, snapshot) => (
                            <TableCell
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              align="left"
                              sx={{
                                minWidth: '120px',
                                height: `${requiredRowHeight}px`,
                                backgroundColor: snapshot.isDraggingOver ? 'lightyellow' : '#fdfdfd',
                                borderLeft: '1px solid #e0e0e0',
                                verticalAlign: 'top',
                                p: 1,
                                position: 'relative',
                              }}
                            >
                              {tasksStartingOnDate.map(task => {
                                const index = taskPositions[task.id];
                                if (index === undefined) return null;

                                const taskStartMs = new Date(task.startDate).getTime();
                                const timelineEndMs = new Date(timelineDates[timelineDates.length - 1]).setHours(23, 59, 59, 999);
                                const duration = Math.max(0, task.durationDays);
                                const taskEndMs = taskStartMs + (duration * 24 * 60 * 60 * 1000);
                                const visibleEndMs = Math.min(taskEndMs, timelineEndMs);
                                const visibleDurationMs = visibleEndMs - taskStartMs;
                                const visibleDurationDays = visibleDurationMs / (24 * 60 * 60 * 1000);

                                return (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    index={index}
                                    isContinuation={false}
                                    visualDurationDays={visibleDurationDays}
                                  />
                                );
                              })}
                            </TableCell>
                          )}
                        </Droppable>
                      );
                    })}
                  </TableRow>
                );
              });
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default ScheduleTimeline;
