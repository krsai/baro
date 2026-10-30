import React from 'react';
import { Box, TextField, Typography } from '@mui/material';

export const LOCALIZED_NAME_HELP = {
  ko: '이름은 한 언어만 입력해도 됩니다. 영어가 대표명이며, 비어 있으면 한국어 → 베트남어 순서로 영어 칸에 저장합니다.',
  en: 'Enter a name in at least one language. English is the primary name; when blank, the Korean name, then the Vietnamese name, is copied into English.',
  vi: 'Chỉ cần nhập tên bằng một ngôn ngữ. Tiếng Anh là tên chính; nếu để trống, tên tiếng Hàn, rồi tiếng Việt, được lưu vào ô tiếng Anh.',
};
const LABELS = {
  ko: ['이름 (영어 · 대표)', '이름 (한국어)', '이름 (베트남어)'],
  en: ['Name (English · primary)', 'Name (Korean)', 'Name (Vietnamese)'],
  vi: ['Tên (tiếng Anh · chính)', 'Tên (tiếng Hàn)', 'Tên (tiếng Việt)'],
};
export default function LocalizedNameFields({ value, onChange, languageCode = 'en', englishField = 'nameEn', disabled = false, autoFocus = false, showHelp = false }) {
  const labels = LABELS[languageCode] || LABELS.en;
  return <Box>
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' } }}>
      {[englishField, 'nameKo', 'nameVi'].map((key, index) => <TextField key={key} fullWidth size="small" label={labels[index]} value={value?.[key] || ''} disabled={disabled} autoFocus={autoFocus && index === 0} onChange={event => onChange(key, event.target.value)} />)}
    </Box>
    {showHelp && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{LOCALIZED_NAME_HELP[languageCode] || LOCALIZED_NAME_HELP.en}</Typography>}
  </Box>;
}
