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
  const parsedValue = value ? dayjs(value) : dayjs();
  const safeValue = parsedValue.isValid() ? parsedValue : dayjs();
  const dateValue = monthOnly ? safeValue.startOf('month') : safeValue;
  const textFieldInputProps = {
    ...slotProps?.textField?.inputProps,
    ...(monthOnly && !slotProps?.textField?.inputProps?.placeholder
      ? { placeholder: 'YYYY-MM' }
      : {}),
  };

  const mergedSlotProps = {
    ...slotProps,
    textField: {
      size: 'small',
      ...slotProps?.textField,
      inputProps: textFieldInputProps,
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
        {...props}
        {...monthPickerProps}
        value={dateValue}
        onChange={handleChange}
        format={monthOnly ? 'YYYY-MM' : props.format || 'YYYY-MM-DD'}
        slotProps={mergedSlotProps}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
