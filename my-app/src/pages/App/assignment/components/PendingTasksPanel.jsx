import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { Droppable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';

const PendingTasksPanel = ({ column, tasks, onSplit }) => {
  return (
    <Paper variant="outlined" sx={{ height: '100%', p: 2 }}>
      <Typography variant="h6" gutterBottom>{column.title}</Typography>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            sx={{
              minHeight: '400px',
              p: 1,
              backgroundColor: snapshot.isDraggingOver ? 'lightblue' : 'inherit',
              overflowY: 'auto',
              maxHeight: '70vh'
            }}
          >
            {tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} onSplit={onSplit} />
            ))}
            {provided.placeholder}
          </Box>
        )}
      </Droppable>
    </Paper>
  );
};

export default PendingTasksPanel;
