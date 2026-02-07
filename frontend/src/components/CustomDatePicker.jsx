import React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

const CustomDatePicker = ({ value, onChange, ...props }) => {
  // value가 없으면 오늘 날짜를 기본값으로 사용
  const dateValue = value ? dayjs(value) : dayjs();

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
      <DatePicker
        value={dateValue}
        onChange={onChange}
        format="YYYY-MM-DD"
        {...props}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;