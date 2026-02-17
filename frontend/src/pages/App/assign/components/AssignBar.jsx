import React from 'react';
import { Box, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const getDurationDays = (assignment) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  if (assignment.startIndex === assignment.endIndex) {
    return startPercent;
  }
  const fullDays = Math.max(assignment.endIndex - assignment.startIndex - 1, 0);
  return startPercent + fullDays + endPercent;
};

const formatDuration = (daysValue) => {
  const rounded = Math.round(daysValue * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}일`;
  return `${rounded}일`;
};

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev, onSplit }) => {
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
  const durationValue = assignment.workDays ?? getDurationDays(assignment);
  const durationLabel = formatDuration(durationValue);
  const ctLabel =
    assignment.ctStatus === 'AGREED'
      ? 'CT 확정'
      : assignment.ctStatus === 'REJECTED'
        ? 'CT 반려'
        : 'CT 대기';

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
        pr: 6,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: mainColor,
        color: '#1f2a3a',
        width: assignment.widthPx,
        minWidth: 0,
        overflow: 'visible',
        cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.06)',
        zIndex: 20,
      }}
      style={style}
      title={`${assignment.customer} · ${assignment.label}`}
      onPointerDown={(event) => {
        if (event.button !== 2) return;
        event.preventDefault();
        event.stopPropagation();
        onSplit?.(assignment.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSplit?.(assignment.id);
      }}
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
          justifyContent: 'flex-start',
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
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {`${assignment.customer} · ${assignment.label}${assignment.colorName ? ` · ${assignment.colorName}` : ''}${assignment.gender ? ` · ${assignment.gender}` : ''} · 수량 ${assignment.quantity ?? '-'}`}
        </Typography>
      </Box>
      <Box
        sx={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          px: 0.7,
          py: 0.15,
          borderRadius: 1,
          backgroundColor: 'rgba(255,255,255,0.75)',
          fontSize: 10,
          fontWeight: 700,
          color: '#3f4c5f',
        }}
      >
        {ctLabel}
      </Box>
      <Box
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          px: 0.8,
          py: 0.2,
          borderRadius: 1,
          backgroundColor: 'rgba(255,255,255,0.7)',
          fontSize: 11,
          fontWeight: 700,
          color: '#364152',
        }}
      >
        {durationLabel}
      </Box>
    </Box>
  );
};

export default AssignBar;
