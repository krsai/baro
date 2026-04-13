import React from 'react';
import Typography from '@mui/material/Typography';

const resolveVersionLabel = () => {
  const rawVersion = String(import.meta.env.VITE_APP_VERSION || '').trim();
  if (!rawVersion) return 'vdev';
  if (/^v/i.test(rawVersion)) return rawVersion;
  return `v${rawVersion}`;
};

function AppVersionLabel(props) {
  return (
    <Typography variant="caption" color="text.secondary" align="center" {...props}>
      {`Version ${resolveVersionLabel()}`}
    </Typography>
  );
}

export default AppVersionLabel;
