import React from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { useDraggable } from '@dnd-kit/core';

const statusColor = {
  PT: 'warning',
  ST: 'success',
  NONE: 'default',
};

const statusLabel = {
  PT: 'PT 기반',
  ST: 'ST 기반',
  NONE: '기준 없음',
};

const StyleCard = ({ card, onSelect }) => {
  const isDisabled = card.status === 'NONE';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${card.id}`,
    data: { cardId: card.id, type: 'card' },
    disabled: isDisabled,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const previewUrl = card.previewUrl || card.imageUrl || card.thumbnailUrl || '';

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      onClick={() => onSelect?.(card)}
      sx={{
        p: 1.5,
        cursor: isDisabled ? 'not-allowed' : 'grab',
        transition: 'all 0.15s ease',
        pointerEvents: isDragging ? 'none' : 'auto',
        borderStyle: isDisabled ? 'dashed' : 'solid',
        '&:hover': isDisabled
          ? {}
          : { borderColor: 'primary.main', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
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
            NO IMG
          </Box>
        )}

        <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2">{card.customer}</Typography>
            <Chip
              size="small"
              color={statusColor[card.status]}
              label={statusLabel[card.status]}
              variant={card.status === 'NONE' ? 'outlined' : 'filled'}
            />
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
            {card.styleName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            수량: {card.quantity} | 공정: {card.processCount}개
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            PT 합계: {card.totalPt}초
            {card.totalStByFactory ? ` | ST(공장별): ${card.totalStByFactory.join(', ')}` : ''}
          </Typography>
          {isDisabled && (
            <Typography variant="caption" color="error">
              기준 정보 없음
            </Typography>
          )}
        </Stack>
      </Box>
    </Paper>
  );
};

export default StyleCard;