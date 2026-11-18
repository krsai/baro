import React from 'react';
import { Box, CircularProgress, Tooltip } from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';

const TEXT = {
  ko: { editing: "저장하지 않은 변경 사항", refreshed: '변경된 자료가 있습니다', loading:'불러오는 중' },
  en: { editing: 'Unsaved changes', refreshed: 'Updated data is available', loading:'Loading' },
  vi: { editing: 'Thay đổi chưa lưu', refreshed: 'Có dữ liệu đã thay đổi', loading:'Đang tải' },
};

export default function TabStateIndicators({ editing, refreshed, loading=false, languageCode }) {
  const text = TEXT[languageCode] || TEXT.en;
  return <Box component="span" data-tab-indicators sx={{display:'inline-flex',alignItems:'center',gap:.5,width:24,height:16,flexShrink:0}}>
    <Box component="span" sx={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:6,height:16,flexShrink:0}}>{editing&&<Tooltip title={text.editing}><Box component="span" role="img" aria-label={text.editing} sx={{bgcolor:'text.secondary',width:6,height:6,borderRadius:'50%'}}/></Tooltip>}</Box>
    <Box component="span" sx={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:16,flexShrink:0}}>{loading?<Tooltip title={text.loading}><Box component="span" sx={{display:'inline-flex'}}><CircularProgress size={12} thickness={5} color="inherit" aria-label={text.loading}/></Box></Tooltip>:refreshed?<Tooltip title={text.refreshed}><RefreshOutlinedIcon aria-hidden={false} role="img" aria-label={text.refreshed} sx={{fontSize:14,color:'#d97706'}}/></Tooltip>:null}</Box>
  </Box>;
}
