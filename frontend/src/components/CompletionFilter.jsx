import React, { useId } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

const TEXT = {
  ko: { completed: '완료', billed: '청구 완료', paid: '지급 완료', exclude: '제외', include: '포함' },
  en: { completed: 'Completed', billed: 'Fully Billed', paid: 'Paid', exclude: 'Exclude', include: 'Include' },
  vi: { completed: 'Hoàn Thành', billed: 'Đã Lập Đủ Hóa Đơn', paid: 'Đã Thanh Toán', exclude: 'Loại Trừ', include: 'Bao Gồm' },
};

// Presentation only: each screen retains its existing completion predicate and default.
export default function CompletionFilter({ include, onChange, kind = 'completed', disabled = false }) {
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const id = useId();
  return <TextField id={id} select size="small" label={text[kind]} value={include ? 'include' : 'exclude'}
    disabled={disabled} onChange={event => onChange(event.target.value === 'include')}>
    <MenuItem value="exclude">{text.exclude}</MenuItem>
    <MenuItem value="include">{text.include}</MenuItem>
  </TextField>;
}
