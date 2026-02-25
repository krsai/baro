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

const CT_STATUS_META = {
  PENDING: { label: '제안 전', background: '#F3F4F6', color: '#4B5563', border: 'rgba(107,114,128,0.5)' },
  SENT: { label: '승인 전', background: '#DBEAFE', color: '#1D4ED8', border: 'rgba(37,99,235,0.6)' },
  AGREED: { label: '동의 완료', background: '#DCFCE7', color: '#166534', border: 'rgba(22,163,74,0.65)' },
  REJECTED: { label: '변경 요청', background: '#FEE2E2', color: '#991B1B', border: 'rgba(220,38,38,0.65)' },
};

const normalizeCtStatus = (value) => {
  if (value === 'SENT' || value === 'AGREED' || value === 'REJECTED') return value;
  return 'PENDING';
};

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev, onOpenContextMenu, isLocked = false }) => {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `assign-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment' },
    disabled: isLocked,
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
  const isNarrow = Number(assignment.widthPx) < 132;
  const hideMetaBadges = Number(assignment.widthPx) < 156;
  const fullLabel = `${assignment.customer} · ${assignment.label}${assignment.colorName ? ` · ${assignment.colorName}` : ''}${assignment.gender ? ` · ${assignment.gender}` : ''} · 수량 ${assignment.quantity ?? '-'}`;
  const compactLabel = `${assignment.label}${assignment.gender ? ` · ${assignment.gender}` : ''}`;
  const ctStatus = normalizeCtStatus(assignment.ctStatus);
  const ctMeta = CT_STATUS_META[ctStatus];
  const ctLabel = ctMeta.label;
  const openContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu?.({
      targetType: 'assignment',
      id: assignment.id,
      mouseX: event.clientX,
      mouseY: event.clientY,
    });
  };

  return (
    <Box
      ref={setNodeRef}
      sx={{
        position: 'absolute',
        top: assignment.topPx,
        left: assignment.leftPx,
        height: assignment.heightPx,
        borderRadius: 2,
        px: isNarrow ? 1 : 1.5,
        pr: isNarrow ? 1 : 6,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: mainColor,
        color: '#1f2a3a',
        width: assignment.widthPx,
        minWidth: 0,
        // Link-to-previous button sits outside the bar on the left edge.
        overflow: 'visible',
        // Locked assignments are not draggable, but context-menu access is still allowed.
        cursor: isLocked ? 'context-menu' : isDragging ? 'grabbing' : 'grab',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        border: `1px solid ${ctMeta.border}`,
        outline: 'none',
        '&:focus': {
          outline: 'none',
        },
        '&:focus-visible': {
          boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        },
        zIndex: showLinkPrev ? (theme) => theme.zIndex.appBar + 3 : 20,
      }}
      style={style}
      title={`${assignment.customer} · ${assignment.label}`}
      {...attributes}
      {...listeners}
      onContextMenu={openContextMenu}
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
            zIndex: (theme) => theme.zIndex.appBar + 4,
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
              width: isNarrow ? 24 : 32,
              height: isNarrow ? 24 : 32,
              borderRadius: 1,
              objectFit: 'cover',
              border: '1px solid rgba(0,0,0,0.08)',
              mr: isNarrow ? 0.8 : 1.2,
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: isNarrow ? 24 : 32,
              height: isNarrow ? 24 : 32,
              borderRadius: 1,
              backgroundColor: stripe,
              mr: isNarrow ? 0.8 : 1.2,
              flexShrink: 0,
            }}
          />
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: isNarrow ? 500 : 600,
            fontSize: isNarrow ? 12 : undefined,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {isNarrow ? compactLabel : fullLabel}
        </Typography>
      </Box>
      {!hideMetaBadges && (
        <Box
          sx={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            px: 0.7,
            py: 0.15,
            borderRadius: 1,
            backgroundColor: ctMeta.background,
            border: '1px solid rgba(0,0,0,0.06)',
            fontSize: 10,
            fontWeight: 700,
            color: ctMeta.color,
          }}
        >
          {ctLabel}
        </Box>
      )}
      {isLocked && (
        <Box
          sx={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            px: 0.7,
            py: 0.15,
            borderRadius: 1,
            backgroundColor: 'rgba(17, 24, 39, 0.72)',
            fontSize: 10,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          잠금
        </Box>
      )}
      {!hideMetaBadges && (
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
      )}
    </Box>
  );
};

export default AssignBar;
