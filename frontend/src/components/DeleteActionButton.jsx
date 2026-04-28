import React from 'react';
import { IconButton } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

const DeleteActionButton = ({
  disabled = false,
  title = '',
  onClick,
  stopPropagation = false,
  size = 'small',
}) => {
  const handleClick = (event) => {
    if (stopPropagation) event.stopPropagation();
    onClick?.(event);
  };

  return (
    <IconButton
      size={size}
      color="error"
      disabled={disabled}
      title={title}
      onClick={handleClick}
    >
      <DeleteIcon fontSize="small" />
    </IconButton>
  );
};

export default DeleteActionButton;
