import React from 'react';
import { IconButton } from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { getLabelPalette } from '../theme/labelPalette';
import { getUiMessage } from '../constants/uiMessages';

const DeleteActionButton = ({
  disabled = false,
  title = '',
  onClick,
  stopPropagation = false,
  size = 'small',
  sx,
  ...props
}) => {
  const handleClick = (event) => {
    if (stopPropagation) event.stopPropagation();
    onClick?.(event);
  };

  return (
    <IconButton
      {...props}
      size={size}
      color="error"
      disabled={disabled}
      title={title}
      aria-label={props['aria-label'] || title || getUiMessage('common.delete', 'Delete')}
      sx={[{ color: getLabelPalette('red').text, '&:hover': { bgcolor: getLabelPalette('red').background } }, ...(Array.isArray(sx) ? sx : [sx])]}
      onClick={handleClick}
    >
      <DeleteIcon fontSize="small" />
    </IconButton>
  );
};

export default DeleteActionButton;
