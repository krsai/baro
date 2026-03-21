import React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

const CustomDatePicker = ({ value, onChange, slotProps, ...props }) => {
  // value가 없으면 오늘 날짜를 기본값으로 사용
  const dateValue = value ? dayjs(value) : dayjs();

  const mergedSlotProps = {
    ...slotProps,
    textField: {
      size: 'small',
      ...slotProps?.textField,
      sx: {
        minWidth: 140,
        '& .MuiOutlinedInput-root': {
          borderRadius: 2,
          backgroundColor: 'background.paper',
        },
        ...slotProps?.textField?.sx,
      },
      className: `compact-date-picker${slotProps?.textField?.className ? ` ${slotProps.textField.className}` : ''}`,
    },
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
      <DatePicker
        value={dateValue}
        onChange={onChange}
        format="YYYY-MM-DD"
        slotProps={mergedSlotProps}
        {...props}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
