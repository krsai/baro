import React from 'react';
import { Box, Chip } from '@mui/material';
import { labelChipSx } from '../theme/labelPalette';

// Supply a semantic tone from data/status keys, never from translated label text.
const StatusLabel = ({ label, tone = 'default', dot = false, sx, ...props }) => (
  <Chip
    size="small"
    {...props}
    label={label}
    icon={dot ? <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor' }} /> : props.icon}
    sx={[labelChipSx(tone), { '& .MuiChip-icon': { color: 'inherit', ml: '8px', mr: '-3px' } }, ...(Array.isArray(sx) ? sx : [sx])]}
  />
);

export default StatusLabel;
