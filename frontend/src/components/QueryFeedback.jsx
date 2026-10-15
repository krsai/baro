import React from 'react';
import { Alert, Button } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

export const QUERY_TEXT = {
  ko: { loading: '자료를 불러오는 중입니다.', empty: '조회 조건에 해당하는 자료가 없습니다.', error: '자료를 불러오지 못했습니다.', retry: '다시 시도' },
  en: { loading: 'Loading data.', empty: 'No data matches the selected filters.', error: 'Could not load data.', retry: 'Try again' },
  vi: { loading: 'Đang tải dữ liệu.', empty: 'Không có dữ liệu phù hợp với điều kiện tìm kiếm.', error: 'Không thể tải dữ liệu.', retry: 'Thử lại' },
};

export default function QueryFeedback({ error, onRetry, loading = false }) {
  const { languageCode } = useLanguage();
  const text = QUERY_TEXT[languageCode] || QUERY_TEXT.en;
  if (!error) return null;
  return <Alert severity="error" role="alert" sx={{ mb: 1.5 }} action={onRetry && <Button color="inherit" disabled={loading} onClick={onRetry}>{text.retry}</Button>}>{text.error}</Alert>;
}
