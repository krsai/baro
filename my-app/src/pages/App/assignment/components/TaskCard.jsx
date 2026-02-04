import React from 'react';
import { Paper, Typography, Box, IconButton } from '@mui/material';
import { Draggable } from '@hello-pangea/dnd';
import CallSplitIcon from '@mui/icons-material/CallSplit';

const TaskCard = ({ task, index, onSplit, isContinuation, visualDurationDays }) => {
  const isOnTimeline = visualDurationDays && visualDurationDays > 0;

  const styleProps = {};

  if (isOnTimeline) {
    const cellWidth = 120; // ScheduleTimeline의 TableCell minWidth와 일치
    const borderWidth = 1; // ScheduleTimeline의 TableCell borderLeft와 일치
    const cardVerticalSpacing = 44; // 한 카드가 차지하는 수직 공간(높이+마진)

    // 표시 기간에 따라 카드 너비 계산 (셀 너비 * 기간 + 테두리 너비)
    const width = (cellWidth * visualDurationDays) + (Math.max(0, Math.floor(visualDurationDays - 0.01)) * borderWidth);

    Object.assign(styleProps, {
      width: `${width}px`,
      position: 'absolute', // 셀 위에 자유롭게 위치
      top: `${8 + (index * cardVerticalSpacing)}px`, // 8px는 TableCell의 패딩, index로 수직 위치 계산
      zIndex: 10, // 다른 요소들보다 위에 보이도록 설정
      left: (theme) => theme.spacing(1), // TableCell의 좌측 패딩
    });
  }

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <Box
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          sx={{ mb: 1, ...styleProps }}
        >
          <Paper
            sx={{
              p: 1,
              backgroundColor: isContinuation
                ? '#e3f2fd' // 연장 카드
                : isOnTimeline
                ? '#bbdefb' // 타임라인에 배치된 기본 카드
                : 'white',   // 대기 목록에 있는 카드
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Typography variant="body2" component="span" title={task.content}>
                {task.content}
              </Typography>
              {!isContinuation && (
                <>
                  <Typography variant="caption" component="span" sx={{ ml: 1.5 }}>
                    수량: {task.quantity}개
                  </Typography>
                  {task.durationDays && (
                    <Typography variant="caption" component="span" sx={{ ml: 1.5 }}>
                      소요: {task.durationDays.toFixed(2)}일
                    </Typography>
                  )}
                </>
              )}
            </Box>
            {onSplit && !isContinuation && (
              <IconButton size="small" onClick={() => onSplit(task)}>
                <CallSplitIcon />
              </IconButton>
            )}
          </Paper>
        </Box>
      )}
    </Draggable>
  );
};

export default TaskCard;
