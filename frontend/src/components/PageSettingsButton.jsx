import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

export default function PageSettingsButton({ label, onClick, disabled = false }) {
  const button = (
    <IconButton color="primary" aria-label={label} aria-haspopup="dialog" onClick={onClick} disabled={disabled}>
      <SettingsOutlinedIcon fontSize="small" />
    </IconButton>
  );
  return <Tooltip title={label}>
    {disabled ? <span style={{ display: 'inline-flex' }}>{button}</span> : button}
  </Tooltip>;
}
