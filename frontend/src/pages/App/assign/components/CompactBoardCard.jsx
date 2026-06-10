import React, { memo, useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Avatar, Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { getUiMessage } from '../../../../constants/uiMessages';
import { formatNumberWithCommas } from '../../../../utils/numberFormat';

const resolveInitial = (value = '') => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
};

const CardField = ({ label, value, minWidth = 120, children }) => (
  <Box sx={{ minWidth, flex: 1 }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', lineHeight: 1.1 }}
    >
      {label}
    </Typography>
    {children || (
      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
        {value || '-'}
      </Typography>
    )}
  </Box>
);

const CompactBoardCard = ({
  draggableId,
  droppableId = null,
  droppableData = null,
  disabled = false,
  selected = false,
  languageCode = 'en',
  customer = '',
  orderNo = '',
  styleName = '',
  quantity = null,
  progressPercent = 0,
  chips = [],
  footer = '',
  previewUrl = '',
  accentColor = '#2563EB',
  backgroundColor = '#FFFFFF',
  onClick,
  onContextMenu,
  onDisabledDragAttempt,
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } =
    useDraggable({
      id: draggableId,
      data: { draggableId },
      disabled,
    });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId || `drop-disabled:${draggableId}`,
    disabled: !droppableId,
    data: droppableData || undefined,
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
      : undefined,
    opacity: isDragging ? 0.55 : 1,
  };

  const handlePointerDown = (event) => {
    listeners?.onPointerDown?.(event);
    if (!disabled || typeof onDisabledDragAttempt !== 'function') return;
    if (typeof event?.button === 'number' && event.button !== 0) return;
    onDisabledDragAttempt({
      clientX: Number(event?.clientX),
      clientY: Number(event?.clientY),
    });
  };

  const parsedProgress = Number(progressPercent);
  const displayProgress = Number.isFinite(parsedProgress)
    ? Math.max(0, Math.round(parsedProgress * 10) / 10)
    : 0;
  const progressBarValue = Math.min(100, displayProgress);
  const quantityLabel =
    quantity == null || !Number.isFinite(Number(quantity))
      ? '-'
      : formatNumberWithCommas(Math.max(0, Number(quantity)), {
          fallback: '0',
          maximumFractionDigits: 0,
        });

  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 64,
        borderRadius: 2,
        border: '1px solid',
        borderColor: isOver
          ? 'primary.main'
          : selected
            ? 'primary.light'
            : 'divider',
        backgroundColor,
        boxShadow: isOver
          ? '0 0 0 2px rgba(37, 99, 235, 0.12)'
          : selected
            ? '0 0 0 1px rgba(37, 99, 235, 0.10)'
            : 'none',
        cursor: disabled ? 'not-allowed' : 'grab',
        overflow: 'hidden',
        transition: 'border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease',
        display: 'flex',
      }}
      style={style}
    >
      <Box
        sx={{
          width: 4,
          backgroundColor: accentColor,
          flexShrink: 0,
        }}
      />
      <Stack
        direction="row"
        spacing={1.25}
        useFlexGap
        sx={{
          flex: 1,
          minWidth: 0,
          px: 1.25,
          py: 0.75,
          alignItems: 'center',
          flexWrap: { xs: 'wrap', lg: 'nowrap' },
        }}
      >
        {previewUrl ? (
          <Avatar
            src={previewUrl}
            alt={styleName}
            variant="rounded"
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          />
        ) : (
          <Avatar
            variant="rounded"
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              bgcolor: 'rgba(37, 99, 235, 0.10)',
              color: accentColor,
              fontWeight: 700,
            }}
          >
            {resolveInitial(styleName)}
          </Avatar>
        )}
        <CardField
          label={getUiMessage('assign.cardCustomerLabel', 'Customer', languageCode)}
          value={customer}
        />
        <CardField
          label={getUiMessage('assign.cardOrderNoLabel', 'Order No.', languageCode)}
          value={orderNo}
        />
        <CardField
          label={getUiMessage('assign.cardStyleLabel', 'Style', languageCode)}
          minWidth={160}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
            {styleName || '-'}
          </Typography>
          {chips.length > 0 ? (
            <Stack
              direction="row"
              spacing={0.5}
              useFlexGap
              sx={{ flexWrap: 'wrap', rowGap: 0.25, mt: 0.25 }}
            >
              {chips.map((chip, index) => (
                <Chip
                  key={`${draggableId}:${index}:${chip.label}`}
                  size="small"
                  label={chip.label}
                  color={chip.color || 'default'}
                  variant={chip.variant || 'filled'}
                  sx={{
                    height: 18,
                    '& .MuiChip-label': {
                      px: 0.625,
                      fontSize: '0.64rem',
                    },
                  }}
                />
              ))}
            </Stack>
          ) : null}
          {footer ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.25, lineHeight: 1.1 }}
            >
              {footer}
            </Typography>
          ) : null}
        </CardField>
        <CardField
          label={getUiMessage('assign.cardQuantityLabel', 'Quantity', languageCode)}
          value={quantityLabel}
          minWidth={80}
        />
        <CardField
          label={getUiMessage('assign.cardProgressLabel', 'Progress', languageCode)}
          minWidth={160}
        >
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {displayProgress}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progressBarValue}
              sx={{
                height: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.08)',
              }}
            />
          </Stack>
        </CardField>
      </Stack>
    </Box>
  );
};

export default memo(CompactBoardCard);
