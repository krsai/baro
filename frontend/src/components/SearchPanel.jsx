import React, { useId, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useLanguage } from '../context/LanguageContext';

const TEXT = {
  ko: { title: '조회 조건', collapse: '조건 접기', expand: '조건 펼치기', reset: '초기화' },
  en: { title: 'Search criteria', collapse: 'Hide filters', expand: 'Show filters', reset: 'Reset' },
  vi: { title: 'Điều kiện tìm kiếm', collapse: 'Ẩn bộ lọc', expand: 'Hiện bộ lọc', reset: 'Đặt lại' },
};

// Screens own query state, defaults and requests. This shared shell owns only
// presentation and disclosure; collapsing never clears or unmounts filters.
export default function SearchPanel({ title, search, controls, filters, onReset, disabled = false, sx, className }) {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [expanded, setExpanded] = useState(true);
  const filterId = useId();
  return <Box component="section" aria-label={title || text.title} className={className} data-search-panel
    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minWidth: 0, overflow: 'hidden', ...sx }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, minHeight: 44, gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: 700, letterSpacing: .3 }}>SEARCH</Typography>
        <Typography component="span" aria-hidden="true" sx={{ color: 'divider' }}>/</Typography>
        <Typography component="span" variant="body2">{title || text.title}</Typography>
      </Stack>
      {filters && <Button size="small" variant="text" aria-expanded={expanded} aria-controls={filterId}
        onClick={() => setExpanded(value => !value)} endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>{expanded ? text.collapse : text.expand}</Button>}
    </Stack>
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
      {search && <Box sx={{ flex: { xs: '1 1 100%', md: '0 1 400px' }, minWidth: 0, '& > .MuiFormControl-root': { width: '100%', maxWidth: 'none', minWidth: 0 } }}>{search}</Box>}
      {controls && <Stack data-search-controls direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ ml: { md: 'auto' }, minWidth: 0, maxWidth: '100%', '& > .MuiStack-root': { flexWrap: 'wrap', rowGap: 1, maxWidth: '100%' } }}>{controls}</Stack>}
      {onReset && <Button variant="outlined" size="small" startIcon={<RestartAltOutlined />} disabled={disabled} onClick={onReset} sx={{ ml: !controls ? 'auto' : 0, whiteSpace: 'nowrap', flexShrink: 0 }}>{text.reset}</Button>}
    </Box>
    {filters && <Box id={filterId} data-search-filters hidden={!expanded} sx={{ p: { xs: 1.5, sm: 2 }, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover',
      '& > .MuiStack-root': { flexWrap: 'wrap', gap: 1.5 },
      '& label:not(.MuiFormLabel-root):not(.MuiFormControlLabel-root)': { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 },
      '& label:not(.MuiFormLabel-root):not(.MuiFormControlLabel-root) > span': { color: 'text.secondary', minWidth: 72, whiteSpace: 'nowrap' },
      '& select:not(.MuiSelect-nativeInput)': { height: 'var(--ui-control-height, 36px)', border: '1px solid', borderColor: 'divider', borderRadius: 'var(--ui-control-radius, 8px)', bgcolor: 'background.paper', color: 'text.primary', px: 1, minWidth: 0, width: '100%', font: 'inherit' },
    }}><Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" spacing={1.5}>{filters}</Stack></Box>}
  </Box>;
}
