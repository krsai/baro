import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { getUiMessage } from '../../../../constants/uiMessages';
import { useLanguage } from '../../../../context/LanguageContext';
import { getGenderLabel } from '../../../../constants/productAttributes';
import { hasAssignmentCtSnapshot } from '../../../../utils/assignmentCt';

const getDurationDays = (assignment) => {
  const startPercent = (assignment.startDayPercent ?? 100) / 100;
  const endPercent = (assignment.endDayPercent ?? 100) / 100;
  if (assignment.startIndex === assignment.endIndex) {
    return startPercent;
  }
  const fullDays = Math.max(assignment.endIndex - assignment.startIndex - 1, 0);
  return startPercent + fullDays + endPercent;
};

const formatDuration = (daysValue, languageCode = 'en') => {
  const rounded = Math.round(daysValue * 10) / 10;
  const days = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return getUiMessage('assign.durationDays', '{days}d', languageCode, { days });
};

const getClipBorderRadius = (isClippedLeft, isClippedRight) => {
  const topLeft = isClippedLeft ? 0 : 8;
  const topRight = isClippedRight ? 0 : 8;
  const bottomRight = isClippedRight ? 0 : 8;
  const bottomLeft = isClippedLeft ? 0 : 8;
  return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
};

const joinText = (parts) => parts.filter(Boolean).join(' / ');
const formatProgressPercent = (value, languageCode = 'en') =>
  getUiMessage('assign.progressCompact', '진행 {percent}%', languageCode, {
    percent: Math.round(Number(value) || 0),
  });
const formatDateOnly = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const AssignBar = ({ assignment, showLinkPrev, onLinkPrev, onOpenContextMenu, shiftPx = 0 }) => {
  const { languageCode } = useLanguage();
  const isCompleted = Boolean(assignment?.isCompleted);
  const isClippedLeft = Boolean(assignment.isClippedLeft);
  const isClippedRight = Boolean(assignment.isClippedRight);
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `assign-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment' },
    disabled: isCompleted,
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `assign-drop-${assignment.id}`,
    data: { assignmentId: assignment.id, type: 'assignment-drop' },
    disabled: isCompleted,
  });
  const setNodeRef = useCallback(
    (node) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

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
  const durationLabel = formatDuration(durationValue, languageCode);
  const isNarrow = Number(assignment.widthPx) < 132;
  const hideMetaBadges = Number(assignment.widthPx) < 156;
  const genderDisplay = getGenderLabel(
    assignment.gender,
    String(assignment.gender || '').trim(),
    languageCode
  );
  const quantityLabel = getUiMessage(
    'assign.quantityCompact',
    'Qty {quantity}',
    languageCode,
    { quantity: assignment.quantity ?? '-' }
  );
  const hasSavedSnapshot =
    assignment?.ctDisplayState != null
      ? assignment.ctDisplayState === 'SAVED'
      : hasAssignmentCtSnapshot(assignment);
  const ctMeta = hasSavedSnapshot
    ? {
        label: getUiMessage('assign.savedCtBadge', 'CT Saved', languageCode),
        labelColor: '#4A88C8',
      }
    : {
        label: getUiMessage('assign.unsavedCtBadge', 'CT Unsaved', languageCode),
        labelColor: '#888898',
      };
  const rawProgressPercent = Math.max(
    0,
    Number(assignment.workProgressPercent ?? assignment.progressPercent) || 0
  );
  const progressPercent = Math.min(100, rawProgressPercent);
  const progressSummary = formatProgressPercent(rawProgressPercent, languageCode);
  const hasCompletionWarning = Boolean(assignment?.isCompletionInconsistent);
  const completionWarningMessage = hasCompletionWarning
    ? getUiMessage(
        'assign.completionWarning',
        '완료 확인 수량과 현재 작업기록 수량이 맞지 않습니다.',
        languageCode
      )
    : '';
  const statusType = assignment?.statusType || (isCompleted ? 'completed' : 'active');
  const statusMeta =
    statusType === 'completed'
      ? {
          label: getUiMessage('assign.statusCompleted', '생산 완료', languageCode),
          chipBg: 'rgba(255,255,255,0.92)',
          chipColor: '#334155',
          cardBg: '#E5E7EB',
          progressBg: '#B8C0CC',
          borderColor: hasCompletionWarning
            ? 'rgba(245,158,11,0.72)'
            : 'rgba(100,116,139,0.38)',
        }
      : statusType === 'review'
        ? {
            label: getUiMessage('assign.statusReviewRequired', '검토 필요', languageCode),
            chipBg: 'rgba(254,242,242,0.96)',
            chipColor: '#B91C1C',
            cardBg: '#FEF2F2',
            progressBg: '#FCA5A5',
            borderColor: 'rgba(220,38,38,0.36)',
          }
      : statusType === 'overdue'
        ? {
            label: getUiMessage('assign.statusOverdue', '지연', languageCode),
            chipBg: 'rgba(255,247,237,0.96)',
            chipColor: '#C2410C',
            cardBg: '#FFF4E5',
            progressBg: '#F7B267',
            borderColor: 'rgba(234,88,12,0.38)',
          }
        : statusType === 'pending'
          ? {
              label: getUiMessage('assign.statusPending', '대기', languageCode),
              chipBg: 'rgba(255,255,255,0.92)',
              chipColor: '#6B7280',
              cardBg: '#F8FAFC',
              progressBg: '#D7DEE8',
              borderColor: 'rgba(148,163,184,0.34)',
            }
          : {
              label: getUiMessage('assign.statusActive', '진행중', languageCode),
              chipBg: 'rgba(255,255,255,0.92)',
          chipColor: '#1D4ED8',
          cardBg: '#E6F3FF',
          progressBg: '#7CB8F5',
          borderColor: 'rgba(59,130,246,0.28)',
        };
  const shiftedCompletedLabel =
    Boolean(assignment?.isCompleted) &&
    assignment?.renderEndDate &&
    assignment?.candidateEndDate &&
    String(assignment.renderEndDate) !== String(assignment.candidateEndDate)
      ? formatDateOnly(assignment?.productionCompletedAt)
      : '';

  const line1 = assignment.orderNo
    ? joinText([assignment.customer || '', assignment.orderNo])
    : assignment.customer || '';
  const line2 = joinText([
    assignment.label,
    assignment.colorName,
    genderDisplay,
    quantityLabel,
    !isNarrow ? progressSummary : null,
  ]);
  const reviewReason = statusType === 'review' ? assignment?.reviewReason : null;
  const reviewFormula = reviewReason
    ? `${Number(reviewReason.recordedTotalQuantity || 0).toLocaleString()} / ${Number(
        reviewReason.requiredTotalQuantity || 0
      ).toLocaleString()} (${Number(reviewReason.plannedQuantity || 0).toLocaleString()}×${Number(
        reviewReason.processCount || 0
      ).toLocaleString()})`
    : '';

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
        pl: isClippedLeft ? 2.5 : isNarrow ? 1 : 1.5,
        pr: isClippedRight ? 2.5 : isNarrow ? 1 : 6,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: statusMeta.cardBg,
        color: '#1f2a3a',
        minWidth: 0,
        overflow: 'visible',
        cursor: isCompleted ? 'default' : isDragging ? 'grabbing' : 'grab',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        border: `1px solid ${statusMeta.borderColor}`,
        borderLeft: isClippedLeft ? `2px dashed ${statusMeta.borderColor}` : `1px solid ${statusMeta.borderColor}`,
        borderRight: isClippedRight ? `2px dashed ${statusMeta.borderColor}` : `1px solid ${statusMeta.borderColor}`,
        outline: 'none',
        '&:focus': { outline: 'none' },
        '&:focus-visible': { boxShadow: '0 2px 6px rgba(0,0,0,0.12)' },
        zIndex: showLinkPrev && !isCompleted ? (theme) => theme.zIndex.appBar + 3 : 20,
      }}
      style={style}
      title={joinText([
        assignment.customer,
        assignment.label,
        assignment.colorName,
        genderDisplay,
        assignment.quantity != null ? quantityLabel : null,
        progressSummary,
        shiftedCompletedLabel
          ? getUiMessage(
              'assign.actualCompletionTooltip',
              `실제 완료: ${shiftedCompletedLabel}`,
              languageCode,
              { value: shiftedCompletedLabel }
            )
          : null,
        completionWarningMessage || null,
        reviewFormula ? `검토 기준 ${reviewFormula}` : null,
      ])}
      {...attributes}
      {...listeners}
      onContextMenu={openContextMenu}
    >
      {typeof progressPercent === 'number' && progressPercent > 0 && !isCompleted && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {isClippedRight && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 20,
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
          <Typography
            sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.35)', lineHeight: 1 }}
          >
            {'>>'}
          </Typography>
        </Box>
      )}

      {isClippedLeft && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
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
          <Typography
            sx={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.35)', lineHeight: 1 }}
          >
            {'<<'}
          </Typography>
        </Box>
      )}

      {showLinkPrev && !isCompleted && (
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
          title={getUiMessage('assign.connectPrev', 'Link to previous task', languageCode)}
        >
          {'<'}
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          left: 8,
          top: 8,
          zIndex: 2,
          px: 0.8,
          py: 0.2,
          borderRadius: 1,
          backgroundColor: statusMeta.chipBg,
          fontSize: 10,
          fontWeight: 700,
          color: statusMeta.chipColor,
        }}
      >
        {statusMeta.label}
      </Box>

      {reviewFormula && !isNarrow && (
        <Box
          sx={{
            position: 'absolute',
            left: 8,
            top: 28,
            zIndex: 2,
            px: 0.8,
            py: 0.2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.86)',
            color: '#991B1B',
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {languageCode === 'ko' ? `기록합계 / 완료기준 ${reviewFormula}` : reviewFormula}
        </Box>
      )}

      {!hideMetaBadges && progressPercent > 0 && (
        <Box
          sx={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            zIndex: 2,
            px: 0.8,
            py: 0.2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.78)',
            fontSize: 10,
            fontWeight: 700,
            color: '#334155',
          }}
        >
          {joinText([
            rawProgressPercent > 0 ? `${Math.round(rawProgressPercent)}%` : null,
          ])}
        </Box>
      )}

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
            {getUiMessage('assign.imageUnavailable', 'No\nImage', languageCode)}
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
            {isNarrow ? assignment.customer || '' : line1}
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
            {isNarrow ? assignment.label || '' : line2}
          </Typography>
        </Box>
      </Box>

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
          {ctMeta.label}
        </Box>
      )}

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

export default React.memo(AssignBar, (prevProps, nextProps) => (
  prevProps.assignment === nextProps.assignment &&
  prevProps.showLinkPrev === nextProps.showLinkPrev &&
  prevProps.shiftPx === nextProps.shiftPx &&
  prevProps.onLinkPrev === nextProps.onLinkPrev &&
  prevProps.onOpenContextMenu === nextProps.onOpenContextMenu
));

