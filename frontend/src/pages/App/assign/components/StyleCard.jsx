import React from 'react';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const statusLabel = {
  PT: 'PT 제안',
  AT: 'AT 제안',
  NONE: '기준 없음',
};

const statusPalette = {
  PT: { border: '#9FB9F2', text: '#3E5E9A' },
  AT: { border: '#9ED5B3', text: '#2F7A4B' },
  NONE: { border: '#E6A8B6', text: '#A34355' },
};

const hasPt = (card) =>
  Number(card.totalPt) > 0;
const hasAt = (card) =>
  Number(card.totalAt) > 0;

const getCardBasis = (card) => {
  if (!hasPt(card) && !hasAt(card)) return 'NONE';
  if (card.status === 'AT') return 'AT';
  return 'PT';
};

const StyleCard = ({ card, onSelect, onSplit }) => {
  const basis = getCardBasis(card);
  const isDisabled = basis === 'NONE';
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `card-${card.id}`,
    data: { cardId: card.id, type: 'card' },
    disabled: isDisabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `card-drop-${card.id}`,
    data: { cardId: card.id, type: 'card-drop' },
  });

  const setNodeRef = (node) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const previewUrl = card.previewUrl || card.imageUrl || card.thumbnailUrl || '';
  const palette = statusPalette[basis] || statusPalette.NONE;
  const customerLabel = card.orderNo ? `${card.customer} · ${card.orderNo}` : card.customer;
  const showCustomerTooltip = customerLabel.length > 14;
  const showStyleTooltip = card.styleName.length > 16;

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      onClick={() => onSelect?.(card)}
      onPointerDown={(event) => {
        if (event.button !== 2) return;
        event.preventDefault();
        event.stopPropagation();
        onSplit?.();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSplit?.();
      }}
      sx={{
        p: 1.5,
        cursor: isDisabled ? 'not-allowed' : 'grab',
        transition: 'all 0.15s ease',
        pointerEvents: isDragging ? 'none' : 'auto',
        borderStyle: isDisabled ? 'dashed' : 'solid',
        '&:hover': isDisabled
          ? {}
          : { borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
        borderColor: isOver ? 'primary.light' : undefined,
      }}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt={card.styleName}
            sx={{
              width: 56,
              height: 56,
              borderRadius: 1.5,
              objectFit: 'cover',
              border: '1px solid rgba(0,0,0,0.08)',
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 1.5,
              border: '1px dashed rgba(0,0,0,0.2)',
              backgroundColor: '#F7F7F8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            이미지 없음
          </Box>
        )}

        <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tooltip title={customerLabel} disableHoverListener={!showCustomerTooltip}>
              <Typography variant="subtitle2" noWrap>
                {customerLabel}
              </Typography>
            </Tooltip>
            <Chip
              size="small"
              label={statusLabel[basis]}
              variant="outlined"
              sx={{
                borderColor: palette.border,
                color: palette.text,
                backgroundColor: 'transparent',
                fontWeight: 600,
              }}
            />
          </Box>
          <Tooltip title={card.styleName} disableHoverListener={!showStyleTooltip}>
            <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
              {card.styleName}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" noWrap>
            {card.colorName ? `색상: ${card.colorName} · ` : ''}수량: {card.quantity}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
};

export default StyleCard;
