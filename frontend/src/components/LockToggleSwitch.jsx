import React from 'react';
import { Switch } from '@mui/material';

const LockToggleSwitch = ({
  checked = false,
  disabled = false,
  onChange,
  ariaLabel = 'lock toggle',
  stopPropagation = false,
  size = 'small',
}) => {
  const handleClick = (event) => {
    if (stopPropagation) event.stopPropagation();
  };

  const handleChange = (event, nextChecked) => {
    if (stopPropagation) event.stopPropagation();
    onChange?.(event, nextChecked);
  };

  return (
    <Switch
      size={size}
      checked={Boolean(checked)}
      disabled={disabled}
      onClick={handleClick}
      onChange={handleChange}
      inputProps={{ 'aria-label': ariaLabel }}
    />
  );
};

export default LockToggleSwitch;
