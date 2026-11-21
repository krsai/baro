import React from 'react';
import {Button} from '@mui/material';
import Alert from "./AppNotice";
import { useLanguage } from '../context/LanguageContext';

export const QUERY_TEXT = {
  ko: { loading: '자료를 불러오는 중입니다.', empty: '표시할 자료가 없습니다.', error: '자료를 불러오지 못했습니다.', idle:'조회 대상을 선택해 주세요.', retry: '다시 시도' },
  en: { loading: 'Loading data.', empty: 'No data to display.', error: 'Could not load data.', idle:'Select a target to view data.', retry: 'Try again' },
  vi: { loading: 'Đang tải dữ liệu.', empty: 'Không có dữ liệu để hiển thị.', error: 'Không thể tải dữ liệu.', idle:'Chọn đối tượng để xem dữ liệu.', retry: 'Thử lại' },
};

export default function QueryFeedback({ error, onRetry, loading = false }) {
  const { languageCode } = useLanguage();
  const text = QUERY_TEXT[languageCode] || QUERY_TEXT.en;
  if (!error) return null;
  return <Alert severity="error" action={onRetry && <Button color="inherit" disabled={loading} onClick={onRetry}>{text.retry}</Button>}>{text.error}</Alert>;
}
