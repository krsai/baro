import React from 'react';
import { Box, Tooltip } from '@mui/material';

const TEXT = {
  ko: { editing: '저장하지 않은 변경사항', refreshed: '자료가 갱신되었습니다' },
  en: { editing: 'Unsaved changes', refreshed: 'Data has been refreshed' },
  vi: { editing: 'Thay đổi chưa lưu', refreshed: 'Dữ liệu đã được cập nhật' },
};

export default function TabStateIndicators({ editing, refreshed, languageCode }) {
  const text = TEXT[languageCode] || TEXT.en;
  return <>
    {editing && <Tooltip title={text.editing}><Box component="span" role="img" aria-label={text.editing} sx={{ ml: 0.75, color: 'text.secondary', fontSize: 10, lineHeight: 1 }}>●</Box></Tooltip>}
    {refreshed && <Tooltip title={text.refreshed}><Box component="span" role="img" aria-label={text.refreshed} sx={{ ml: 0.75, color: 'text.secondary', fontSize: 16, lineHeight: 1 }}>↻</Box></Tooltip>}
  </>;
}
