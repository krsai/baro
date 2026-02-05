import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
  Card,
  CardContent
} from '@mui/material';
import { Droppable, Draggable } from '@hello-pangea/dnd';

// 날짜 유틸리티: 오늘부터 14일치 날짜 생성 (데모용)
const getDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push({
      full: date.toISOString().split('T')[0], // YYYY-MM-DD (ID 매칭용)
      display: `${date.getMonth() + 1}/${date.getDate()}` // M/D (화면 표시용)
    });
  }
  return dates;
};

const ScheduleTimeline = ({ factories, columns, tasks }) => {
  const dates = getDates();

  // 공장별 라인 정보를 행(Row) 데이터로 변환
  const rows = [];
  if (factories) {
    Object.values(factories).forEach(factory => {
      if (factory.lineIds) {
        factory.lineIds.forEach(lineId => {
          if (columns[lineId]) {
            rows.push({
              factory: factory.name,
              line: columns[lineId]
            });
          }
        });
      }
    });
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600, width: '100%' }}>
      <Table stickyHeader size="small" sx={{ minWidth: 800, borderCollapse: 'separate' }}>
        <TableHead>
          <TableRow>
            {/* 좌측 고정 헤더: 공장/라인 */}
            <TableCell
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 3, // 헤더의 sticky z-index는 바디보다 높아야 함
                backgroundColor: '#f5f5f5',
                borderRight: '1px solid rgba(224, 224, 224, 1)',
                width: 180,
                minWidth: 180,
                fontWeight: 'bold'
              }}
            >
              공장 / 라인
            </TableCell>
            {/* 날짜 헤더들 */}
            {dates.map((date) => (
              <TableCell
                key={date.full}
                align="center"
                sx={{
                  minWidth: 120,
                  backgroundColor: '#f5f5f5',
                  fontWeight: 'bold',
                  borderRight: '1px solid rgba(224, 224, 224, 1)'
                }}
              >
                {date.display}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.line.id}>
              {/* 좌측 고정 바디: 라인 정보 */}
              <TableCell
                component="th"
                scope="row"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2, // 바디의 sticky z-index
                  backgroundColor: 'background.paper',
                  borderRight: '1px solid rgba(224, 224, 224, 1)',
                  fontWeight: 'medium'
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {row.factory}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {row.line.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.line.lineMembers}명
                  </Typography>
                </Box>
              </TableCell>
              {/* 날짜별 작업 영역 (Droppable) */}
              {dates.map((date) => {
                const droppableId = `${row.line.id}_${date.full}`;
                // 해당 라인, 해당 날짜에 배정된 작업 필터링
                const lineTaskIds = row.line.taskIds || [];
                const dayTasks = lineTaskIds
                  .map(taskId => tasks[taskId])
                  .filter(task => task && task.startDate === date.full);

                return (
                  <TableCell
                    key={date.full}
                    sx={{
                      p: 0,
                      verticalAlign: 'top',
                      borderRight: '1px solid rgba(224, 224, 224, 1)',
                      height: 120 // 셀 최소 높이 확보
                    }}
                  >
                    <Droppable droppableId={droppableId}>
                      {(provided, snapshot) => (
                        <Box
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          sx={{
                            minHeight: 120,
                            p: 1,
                            backgroundColor: snapshot.isDraggingOver ? 'action.hover' : 'transparent',
                            transition: 'background-color 0.2s'
                          }}
                        >
                          {dayTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <Card
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  variant="outlined"
                                  sx={{
                                    mb: 1,
                                    backgroundColor: snapshot.isDragging ? 'primary.light' : 'background.paper',
                                    ...provided.draggableProps.style
                                  }}
                                >
                                  <CardContent sx={{ p: 1, '&:last-child': { p: 1 } }}>
                                    <Typography variant="caption" display="block" sx={{ lineHeight: 1.2, fontWeight: 'bold' }}>
                                      {task.content}
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                                      <Typography variant="caption" color="text.secondary">
                                        {task.quantity}개
                                      </Typography>
                                      {task.durationDays && (
                                        <Typography variant="caption" color="primary">
                                          {task.durationDays.toFixed(1)}일
                                        </Typography>
                                      )}
                                    </Box>
                                  </CardContent>
                                </Card>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </Box>
                      )}
                    </Droppable>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ScheduleTimeline;