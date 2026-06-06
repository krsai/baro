import React, { memo, useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Avatar, Box, Chip, Stack, Typography } from '@mui/material';

const resolveInitial = (value = '') => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
};

const CompactBoardCard = ({
  draggableId,
  droppableId = null,
  droppableData = null,
  disabled = false,
  selected = false,
  title = '',
  subtitle = '',
  meta = '',
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

  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      sx={{
        minWidth: 240,
        maxWidth: 280,
        height: 92,
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
          width: 5,
          backgroundColor: accentColor,
          flexShrink: 0,
        }}
      />
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          flex: 1,
          minWidth: 0,
          px: 1.25,
          py: 1,
          alignItems: 'flex-start',
        }}
      >
        {previewUrl ? (
          <Avatar
            src={previewUrl}
            alt={title}
            variant="rounded"
            sx={{ width: 42, height: 42, flexShrink: 0 }}
          />
        ) : (
          <Avatar
            variant="rounded"
            sx={{
              width: 42,
              height: 42,
              flexShrink: 0,
              bgcolor: 'rgba(37, 99, 235, 0.10)',
              color: accentColor,
              fontWeight: 700,
            }}
          >
            {resolveInitial(title)}
          </Avatar>
        )}
        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}
              noWrap
            >
              {subtitle || '-'}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {title || '-'}
            </Typography>
            {meta ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {meta}
              </Typography>
            ) : null}
          </Box>
          {chips.length > 0 ? (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {chips.map((chip, index) => (
                <Chip
                  key={`${draggableId}:${index}:${chip.label}`}
                  size="small"
                  label={chip.label}
                  color={chip.color || 'default'}
                  variant={chip.variant || 'filled'}
                  sx={{
                    height: 20,
                    '& .MuiChip-label': {
                      px: 0.75,
                      fontSize: '0.68rem',
                    },
                  }}
                />
              ))}
            </Stack>
          ) : null}
          {footer ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {footer}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
};

export default memo(CompactBoardCard);
