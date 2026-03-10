import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ASSIGNMENT_CT_STATUS_DEFAULT_LABELS,
  normalizeAssignmentCtStatus,
} from '../../../../constants/assignmentStatus';

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

// 색상 세트: 밝고 부드러운 파스텔
// 확정(AGREED)만 progressBg(진행 오버레이용 약간 짙은 색) 추가
const CT_STATUS_META = {
  PENDING:  { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.PENDING, cardBg: '#EBEBF0', labelColor: '#888898' },
  SENT:     { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.SENT, cardBg: '#BFEAD0', labelColor: '#3A9858' },
  AGREED:   { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.AGREED, cardBg: '#C8DFF7', progressBg: '#88B8E8', labelColor: '#4A88C8' },
  REJECTED: { label: ASSIGNMENT_CT_STATUS_DEFAULT_LABELS.REJECTED, cardBg: '#F7DCC8', labelColor: '#C07838' },
};

const normalizeCtStatus = (value) => normalizeAssignmentCtStatus(value);

// 잘린 방향에 따른 border-radius: 잘린 쪽은 각짐, 나머지는 둥금
const getClipBorderRadius = (isClippedLeft, isClippedRight) => {
  const tl = isClippedLeft  ? 0 : 8;
  const tr = isClippedRight ? 0 : 8;
  const br = isClippedRight ? 0 : 8;
  const bl = isClippedLeft  ? 0 : 8;
  return `${tl}px ${tr}px ${br}px ${bl}px`;
};

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev, onOpenContextMenu, shiftPx = 0 }) => {
  const isClippedLeft  = Boolean(assignment.isClippedLeft);
  const isClippedRight = Boolean(assignment.isClippedRight);
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `assign-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment' },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: `assign-drop-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment-drop' },
  });

  const setNodeRef = useCallback((node) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : shiftPx !== 0
        ? `translateX(${shiftPx}px)`
        : undefined,
    transition: transform ? undefined : 'transform 0.15s ease',
    opacity: isDragging ? 0.6 : 1,
  };

  const previewUrl = assignment.previewUrl || assignment.imageUrl || assignment.thumbnailUrl || '';
  const durationValue = assignment.workDays ?? getDurationDays(assignment);
  const durationLabel = formatDuration(durationValue);
  const isNarrow = Number(assignment.widthPx) < 132;
  const hideMetaBadges = Number(assignment.widthPx) < 156;
  const genderDisplay = assignment.gender || '';

  const line1 = assignment.orderNo
    ? `${assignment.customer || ''} · ${assignment.orderNo}`
    : assignment.customer || '';
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

  // 확정 카드 진행률 (0~100). assignment.progressPercent 데이터 연결 후 자동 반영
  const progressPercent = ctStatus === 'AGREED'
    ? Math.min(100, Math.max(0, assignment.progressPercent ?? 0))
    : 0;

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
        width: assignment.widthPx,
        borderRadius: getClipBorderRadius(isClippedLeft, isClippedRight),
        px: isNarrow ? 1 : 1.5,
        pl: isClippedLeft ? 2.5 : (isNarrow ? 1 : 1.5),
        pr: isClippedRight ? 2.5 : (isNarrow ? 1 : 6),
        display: 'flex',
        alignItems: 'center',
        backgroundColor: ctMeta.cardBg,
        color: '#1f2a3a',
        minWidth: 0,
        overflow: 'visible', // link 버튼이 카드 바깥에 위치
        cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderLeft:  isClippedLeft  ? '2px dashed rgba(0,0,0,0.25)' : '1px solid rgba(0,0,0,0.08)',
        borderRight: isClippedRight ? '2px dashed rgba(0,0,0,0.25)' : '1px solid rgba(0,0,0,0.08)',
        outline: 'none',
        '&:focus': { outline: 'none' },
        '&:focus-visible': { boxShadow: '0 2px 6px rgba(0,0,0,0.12)' },
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
      {/* 확정 카드 진행 오버레이 — overflow:hidden으로 border-radius 안쪽에 클리핑 */}
      {ctStatus === 'AGREED' && (
        <Box
          sx={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: 2,
            overflow: 'hidden',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0,
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: ctMeta.progressBg,
              transition: 'width 0.5s ease',
            }}
          />
        </Box>
      )}

      {/* 뷰 경계 초과 — 오른쪽 계속됨 표시 */}
      {isClippedRight && (
        <Box
          sx={{
            position: 'absolute',
            top: 0, right: 0, bottom: 0,
            width: 20,
            borderRadius: '0',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 3px,
              rgba(0,0,0,0.10) 3px,
              rgba(0,0,0,0.10) 5px
            )`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.35)', lineHeight: 1, userSelect: 'none' }}>
            ▶
          </Typography>
        </Box>
      )}

      {/* 뷰 경계 초과 — 왼쪽 계속됨 표시 */}
      {isClippedLeft && (
        <Box
          sx={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: 20,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 1,
            background: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 3px,
              rgba(0,0,0,0.10) 3px,
              rgba(0,0,0,0.10) 5px
            )`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.35)', lineHeight: 1, userSelect: 'none' }}>
            ◀
          </Typography>
        </Box>
      )}

      {/* link-to-previous 버튼 */}
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

      {/* 카드 본문 */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          overflow: 'hidden',
          width: '100%',
          justifyContent: 'flex-start',
          gap: isNarrow ? 1 : 1.5,
        }}
      >
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt={assignment.label}
            sx={{
              width: isNarrow ? 28 : 40,
              height: isNarrow ? 28 : 40,
              borderRadius: 1,
              objectFit: 'cover',
              border: '1px solid rgba(0,0,0,0.08)',
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: isNarrow ? 28 : 40,
              height: isNarrow ? 28 : 40,
              borderRadius: 1,
              border: '1px dashed rgba(0,0,0,0.2)',
              backgroundColor: '#F7F7F8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'rgba(0,0,0,0.3)',
              fontSize: isNarrow ? 7 : 8,
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
              fontSize: isNarrow ? 11 : 13,
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
              fontSize: isNarrow ? 10 : 12,
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

      {/* 상태 라벨 */}
      {!hideMetaBadges && (
        <Box
          sx={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            zIndex: 1,
            px: 0.8,
            py: 0.2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.7)',
            fontSize: 10,
            fontWeight: 700,
            color: ctMeta.labelColor,
          }}
        >
          {ctLabel}
        </Box>
      )}

      {/* 기간 라벨 */}
      {!hideMetaBadges && (
        <Box
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 1,
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
