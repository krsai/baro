import React from 'react';
import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { getUiMessage } from '../../../../constants/uiMessages';
import { useLanguage } from '../../../../context/LanguageContext';
import { getGenderLabel } from '../../../../constants/productAttributes';

const hasSt = (card) => Number(card?.totalSt) > 0;
const hasPt = (card) => Number(card?.totalPt) > 0;

const getCardBasis = (card) => {
  if (hasSt(card)) return 'ST';
  if (hasPt(card)) return 'PT';

  const legacyStatus = String(card?.status || '').trim().toUpperCase();
  if (legacyStatus === 'ST') return 'ST';
  if (legacyStatus === 'PT' || legacyStatus === 'CT') return 'PT';
  return 'NONE';
};

const StyleCard = ({ card, onSelect, onOpenContextMenu, onDisabledDragAttempt }) => {
  const { languageCode } = useLanguage();
  const isDeltaCard = card.type === 'DELTA';
  const basis = isDeltaCard ? 'NONE' : getCardBasis(card);
  const isDisabledByBasis = basis === 'NONE';
  const isDisabledByOrderLock = card?.isManualOrderLocked === false;
  const isDisabled = isDisabledByBasis || isDisabledByOrderLock;
  const genderLabel = getGenderLabel(card.gender, card.gender || '', languageCode);
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
  const handlePointerDown = (event) => {
    // Keep dnd-kit pointer activation intact, then apply disabled-card feedback.
    listeners?.onPointerDown?.(event);
    if (!isDisabled) return;
    if (typeof event?.button === 'number' && event.button !== 0) return;
    onDisabledDragAttempt?.({
      card,
      reason: isDisabledByOrderLock ? 'ORDER_UNLOCKED' : 'MISSING_PT_OR_ST',
      clientX: Number(event?.clientX),
      clientY: Number(event?.clientY),
    });
  };

  const cardStyleName = isDeltaCard ? card.label : card.styleName;
  const previewUrl = card.previewUrl || card.imageUrl || card.thumbnailUrl || '';
  const customerLabel = card.customer || '';
  const showCustomerTooltip = customerLabel.length > 14;
  const showStyleTooltip = (cardStyleName || '').length > 16;
  const metaParts = [
    card.colorName
      ? `${getUiMessage('assign.colorLabel', 'Color', languageCode)}: ${card.colorName}`
      : '',
    genderLabel
      ? `${getUiMessage('assign.genderLabel', 'Gender', languageCode)}: ${genderLabel}`
      : '',
    `${getUiMessage('assign.quantityLabel', 'Quantity', languageCode)}: ${card.quantity}`,
  ].filter(Boolean);

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onClick={() => onSelect?.(card.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu?.({
          targetType: 'card',
          id: card.id,
          mouseX: event.clientX,
          mouseY: event.clientY,
        });
      }}
      sx={{
        p: 2,
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
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt={card.styleName}
            sx={{
              width: 72,
              height: 72,
              borderRadius: 1.5,
              objectFit: 'cover',
              border: '1px solid rgba(0,0,0,0.08)',
              flexShrink: 0,
            }}
          />
        ) : (
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: 1.5,
              border: '1px dashed rgba(0,0,0,0.2)',
              backgroundColor: '#F7F7F8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: 11,
              flexShrink: 0,
              textAlign: 'center',
              whiteSpace: 'pre-line',
            }}
          >
            {getUiMessage('assign.imageUnavailable', 'No Image', languageCode)}
          </Box>
        )}

        <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
          <Tooltip title={customerLabel} disableHoverListener={!showCustomerTooltip}>
            <Typography variant="subtitle2" noWrap>
              {customerLabel}
            </Typography>
          </Tooltip>
          <Tooltip title={cardStyleName} disableHoverListener={!showStyleTooltip}>
            <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
              {cardStyleName}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" noWrap>
            {metaParts.join(' / ')}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
};

export default React.memo(StyleCard);
