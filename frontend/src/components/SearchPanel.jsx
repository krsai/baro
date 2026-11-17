import React, { useId, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useLanguage } from '../context/LanguageContext';
import { ui } from '../theme/ui';

const TEXT = {
  ko: { title: '조회 조건', collapse: '조건 접기', expand: '조건 펼치기', reset: '초기화' },
  en: { title: 'Search criteria', collapse: 'Hide filters', expand: 'Show filters', reset: 'Reset' },
  vi: { title: 'Điều kiện tìm kiếm', collapse: 'Ẩn bộ lọc', expand: 'Hiện bộ lọc', reset: 'Đặt lại' },
};

// Screens own query state, defaults and requests. This shared shell owns only
// presentation and disclosure; collapsing never clears or unmounts filters.
export default function SearchPanel({ title, search, controls, filters, actions, onReset, disabled = false, sx, className }) {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [expanded, setExpanded] = useState(true);
  const filterId = useId();
  return <Box component="section" aria-label={title || text.title} className={className} data-search-panel
    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minWidth: 0, overflow: 'hidden', ...sx }}>
    <Stack data-search-header direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, minHeight: ui.search.headerHeight, gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
        <Typography component="span" variant="body2" sx={{ fontWeight: 700, letterSpacing: .3 }}>SEARCH</Typography>
        <Typography component="span" aria-hidden="true" sx={{ color: 'divider' }}>/</Typography>
        <Typography component="span" variant="body2">{title || text.title}</Typography>
      </Stack>
      {filters && <Button size="small" variant="text" aria-expanded={expanded} aria-controls={filterId}
        onClick={() => setExpanded(value => !value)} endIcon={expanded ? <ExpandLess /> : <ExpandMore />}
        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>{expanded ? text.collapse : text.expand}</Button>}
    </Stack>
    <Box data-search-body sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: ui.search.gap, p: ui.search.padding, minWidth: 0,
      '& [data-search-slot]': { minWidth: 0, maxWidth: '100%', m: 0, justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap', gap: ui.search.gap },
      '& [data-search-slot] > .MuiStack-root:not([data-date-range])': { m: 0, minWidth: 0, maxWidth: '100%', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap', gap: ui.search.gap, '& > :not(style)': { m: 0 } },
      '& [data-search-slot] .MuiFormControl-root:not([data-date-range] .MuiFormControl-root)': { width: ui.search.filterWidth, minWidth: 0, maxWidth: '100%', m: 0 },
      '& [data-search-slot] .MuiFormControlLabel-root': { m: 0 },
    }}>
      {search && <Box data-search-input sx={{ flex: { xs: '0 1 100%', sm: `0 1 ${ui.search.inputWidth}px` }, width: ui.search.inputWidth, maxWidth: '100%', minWidth: 0, '& > .MuiFormControl-root': { width: '100%', maxWidth: '100%', minWidth: 0, m: 0 } }}>{search}</Box>}
      {controls && <Stack data-search-slot data-search-controls direction="row" useFlexGap>{controls}</Stack>}
      {filters && <Box id={filterId} data-search-filters hidden={!expanded} sx={{ minWidth: 0, maxWidth: '100%', flex: { xs: '1 1 100%', md: '0 1 auto' },
        '& > .MuiStack-root': { flexWrap: 'wrap', gap: ui.search.gap },
      }}><Stack data-search-slot direction="row" useFlexGap flexWrap="wrap" alignItems="center">{filters}</Stack></Box>}
      {onReset && <Button data-search-reset variant="outlined" size="small" startIcon={<RestartAltOutlined />} disabled={disabled} onClick={onReset} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{text.reset}</Button>}
      {actions && <Stack data-search-slot data-search-actions direction="row" useFlexGap>{actions}</Stack>}
    </Box>
  </Box>;
}
