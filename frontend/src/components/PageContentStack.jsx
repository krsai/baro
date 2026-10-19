import React from 'react';
import { Stack } from '@mui/material';
import { ui } from '../theme/ui';

// Page sections share a rhythm; field groups inside each section keep their layout.
export default function PageContentStack(props) {
  return <Stack spacing={ui.layout.sectionGap} useFlexGap {...props} />;
}
