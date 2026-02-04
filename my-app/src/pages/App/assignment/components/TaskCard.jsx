import React from 'react';
import { Paper, Typography, Box, IconButton } from '@mui/material';
import { Draggable } from '@hello-pangea/dnd';
import CallSplitIcon from '@mui/icons-material/CallSplit';

const TaskCard = ({ task, index, onSplit, isContinuation, widthFactor = 1 }) => {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <Box
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          sx={{ width: `${widthFactor * 100}%`, mb: 1 }}
        >
          <Paper
            sx={{
              p: 1,
              backgroundColor: isContinuation ? '#e3f2fd' : 'white',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Typography variant="body2" title={task.content} noWrap>
                {task.content}
              </Typography>
              {!isContinuation && (
                <>
                  <Typography variant="caption" display="block">수량: {task.quantity}개</Typography>
                  {task.durationDays && (
                    <Typography variant="caption" display="block">
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
