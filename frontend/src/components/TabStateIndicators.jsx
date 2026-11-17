import React from 'react';
import { Box, Tooltip } from '@mui/material';

const TEXT = {
  ko: { editing: "저장하지 않은 변경 사항", refreshed: '변경된 자료가 있습니다' },
  en: { editing: 'Unsaved changes', refreshed: 'Updated data is available' },
  vi: { editing: 'Thay đổi chưa lưu', refreshed: 'Có dữ liệu đã thay đổi' },
};

export default function TabStateIndicators({ editing, refreshed, languageCode, compact = false }) {
  const text = TEXT[languageCode] || TEXT.en;
  return <Box component="span" sx={{display:'inline-flex',alignItems:'center',justifyContent:'flex-end',gap:compact?0:0.5,width:compact?16:30,ml:compact?0:0.75,flexShrink:0}}>
    {editing && <Tooltip title={text.editing}><Box component="span" role="img" aria-label={text.editing} sx={{ color: 'text.secondary', fontSize: compact ? 6 : 10, lineHeight: 1 }}>●</Box></Tooltip>}
    {refreshed && <Tooltip title={text.refreshed}><Box component="span" role="img" aria-label={text.refreshed} sx={{ color: 'text.secondary', fontSize: compact ? 10 : 16, lineHeight: 1 }}>↻</Box></Tooltip>}
  </Box>;
}
