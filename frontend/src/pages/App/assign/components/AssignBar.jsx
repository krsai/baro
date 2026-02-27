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

const lightenHex = (hex, amount = 0.65) => {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex || '#CDEBD7';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
};

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev, onOpenContextMenu, isLocked = false, shiftPx = 0 }) => {
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
    // 드래그 중: dnd-kit 변환만 적용 (애니메이션 없음)
    // 다른 카드 드래그 시: shiftPx만큼 밀리는 CSS 트랜지션
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : shiftPx !== 0
        ? `translateX(${shiftPx}px)`
        : undefined,
    transition: transform ? undefined : 'transform 0.15s ease',
    opacity: isDragging ? 0.6 : 1,
  };

  const mainColor = lightenHex(assignment.color || '#CDEBD7');
  const stripe = lightenHex(assignment.stripeColor || '#9ED5B3', 0.5);
  const previewUrl = assignment.previewUrl || assignment.imageUrl || assignment.thumbnailUrl || '';
  const durationValue = assignment.workDays ?? getDurationDays(assignment);
  const durationLabel = formatDuration(durationValue);
  const isNarrow = Number(assignment.widthPx) < 132;
  const hideMetaBadges = Number(assignment.widthPx) < 156;
  const genderDisplay = assignment.gender || '';
  // Line 1: 발주자 · 주문번호
  const line1 = assignment.orderNo
    ? `${assignment.customer || ''} · ${assignment.orderNo}`
    : assignment.customer || '';
  // Line 2: 스타일명 · 색상 · 성별 · 수량
  const line2Parts = [
    assignment.label,
    assignment.colorName,
    genderDisplay,
    `수량 ${assignment.quantity ?? '-'}`,
  ].filter(Boolean);
  const line2 = line2Parts.join(' · ');
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
      title={[
        assignment.customer,
        assignment.label,
        assignment.colorName,
        genderDisplay,
        assignment.quantity != null ? `수량 ${assignment.quantity}` : null,
      ].filter(Boolean).join(' · ')}
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
          width: '100%',
          justifyContent: 'flex-start',
          gap: isNarrow ? 0.8 : 1.2,
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
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: isNarrow ? 24 : 32,
              height: isNarrow ? 24 : 32,
              borderRadius: 1,
              border: '1px dashed rgba(0,0,0,0.2)',
              backgroundColor: '#F7F7F8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'rgba(0,0,0,0.3)',
              fontSize: isNarrow ? 6 : 7,
              textAlign: 'center',
              lineHeight: 1.2,
              whiteSpace: 'pre',
              px: 0.2,
            }}
          >
            이미지{'\n'}없음
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: isNarrow ? 10 : 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              color: '#1f2a3a',
            }}
          >
            {isNarrow ? (assignment.customer || '') : line1}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: isNarrow ? 10 : 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
              color: 'rgba(31,42,58,0.75)',
            }}
          >
            {isNarrow ? (assignment.label || '') : line2}
          </Typography>
        </Box>
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
