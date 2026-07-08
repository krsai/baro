import React from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';

const CustomDatePicker = ({
  value,
  onChange,
  slotProps,
  monthOnly = false,
  adapterLocale = 'ko',
  localeText,
  ...props
}) => {
  const { minDate, maxDate, format, ...pickerProps } = props;
  const parsedValue = value ? dayjs(value) : dayjs();
  const safeValue = parsedValue.isValid() ? parsedValue : dayjs();
  const dateValue = monthOnly ? safeValue.startOf('month') : safeValue;

  const mergedSlotProps = {
    ...slotProps,
    textField: {
      size: 'small',
      ...slotProps?.textField,
      sx: {
        minWidth: monthOnly ? 110 : 140,
        ...slotProps?.textField?.sx,
      },
      className: `compact-date-picker${slotProps?.textField?.className ? ` ${slotProps.textField.className}` : ''}`,
    },
  };

  const handleChange = (nextValue, context) => {
    if (monthOnly && nextValue?.isValid?.()) {
      onChange?.(nextValue.startOf('month'), context);
      return;
    }
    onChange?.(nextValue, context);
  };

  const monthPickerProps = monthOnly
    ? {
        views: ['year', 'month'],
        openTo: 'year',
        disableHighlightToday: true,
      }
    : {};

  return (
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale={adapterLocale}
      localeText={localeText}
    >
      <DatePicker
        {...pickerProps}
        {...monthPickerProps}
        minDate={minDate}
        maxDate={maxDate}
        value={dateValue}
        onChange={handleChange}
        format={format || (monthOnly ? 'YYYY-MM' : 'YYYY-MM-DD')}
        slotProps={mergedSlotProps}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
