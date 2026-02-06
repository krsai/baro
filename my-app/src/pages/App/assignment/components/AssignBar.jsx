import React from 'react';
import { Box, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev }) => {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `assign-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment' },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `assign-drop-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment-drop' },
  });

  const setNodeRef = (node) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const mainColor = assignment.color || '#CDEBD7';
  const stripe = assignment.stripeColor || '#9ED5B3';
  const previewUrl = assignment.previewUrl || assignment.imageUrl || assignment.thumbnailUrl || '';

  return (
    <Box
      ref={setNodeRef}
      sx={{
        position: 'absolute',
        top: assignment.topPx,
        left: assignment.leftPx,
        height: assignment.heightPx,
        borderRadius: 2,
        px: 1.5,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: mainColor,
        color: '#1f2a3a',
        width: assignment.widthPx,
        minWidth: 160,
        overflow: 'visible',
        cursor: 'grab',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.06)',
        zIndex: 20,
      }}
      style={style}
      title={`${assignment.orderNo} · ${assignment.customer} · ${assignment.label}`}
      {...attributes}
      {...listeners}
    >
      {showLinkPrev && (
        <Box
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onLinkPrev?.(assignment.id);
          }}
          sx={{
            position: 'absolute',
            left: -10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: '#374151',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            zIndex: 30,
          }}
          title="앞 주문과 연결"
        >
          {'<'}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          width: '100%',
        }}
      >
      {previewUrl ? (
        <Box
          component="img"
          src={previewUrl}
          alt={assignment.label}
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            objectFit: 'cover',
            border: '1px solid rgba(0,0,0,0.08)',
            mr: 1.2,
            flexShrink: 0,
          }}
        />
      ) : (
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            backgroundColor: stripe,
            mr: 1.2,
            flexShrink: 0,
          }}
        />
      )}
      <Typography variant="body2" sx={{ fontWeight: 700, mr: 1 }}>
        {assignment.orderNo}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {assignment.label}
      </Typography>
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {assignment.customer}
      </Typography>
      </Box>
    </Box>
  );
};

export default AssignBar;
