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
  allowEmpty = false,
  adapterLocale = 'ko',
  localeText,
  ...props
}) => {
  const { minDate, maxDate, format, ...pickerProps } = props;
  const parsedValue = value ? dayjs(value) : null;
  const safeValue = parsedValue?.isValid() ? parsedValue : allowEmpty ? null : dayjs();
  const dateValue = monthOnly && safeValue ? safeValue.startOf('month') : safeValue;
  const parsedMinDate = minDate ? dayjs(minDate) : null;
  const parsedMaxDate = maxDate ? dayjs(maxDate) : null;
  const safeMinDate = parsedMinDate?.isValid() ? parsedMinDate : undefined;
  const safeMaxDate = parsedMaxDate?.isValid() ? parsedMaxDate : undefined;

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
        openTo: 'month',
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
        minDate={safeMinDate}
        maxDate={safeMaxDate}
        value={dateValue}
        onChange={handleChange}
        format={format || (monthOnly ? 'YYYY-MM' : 'YYYY-MM-DD')}
        slotProps={mergedSlotProps}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
