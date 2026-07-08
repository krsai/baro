import React from 'react';
import { TextField } from '@mui/material';
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
  const textFieldInputProps = {
    ...slotProps?.textField?.inputProps,
    ...(monthOnly && !slotProps?.textField?.inputProps?.placeholder
      ? { placeholder: 'YYYY-MM' }
      : {}),
  };
  const monthInputProps = {
    ...textFieldInputProps,
    ...(minDate && dayjs(minDate).isValid() ? { min: dayjs(minDate).format('YYYY-MM') } : {}),
    ...(maxDate && dayjs(maxDate).isValid() ? { max: dayjs(maxDate).format('YYYY-MM') } : {}),
  };

  const mergedTextFieldProps = {
    size: 'small',
    ...slotProps?.textField,
    inputProps: monthOnly ? monthInputProps : textFieldInputProps,
    sx: {
      minWidth: 140,
      '& .MuiOutlinedInput-root': {
        borderRadius: 2,
        backgroundColor: 'background.paper',
      },
      ...slotProps?.textField?.sx,
    },
    className: `compact-date-picker${slotProps?.textField?.className ? ` ${slotProps.textField.className}` : ''}`,
  };

  const mergedSlotProps = {
    ...slotProps,
    textField: mergedTextFieldProps,
  };

  const handleChange = (nextValue, context) => {
    if (monthOnly && nextValue?.isValid?.()) {
      onChange?.(nextValue.startOf('month'), context);
      return;
    }
    onChange?.(nextValue, context);
  };

  const handleMonthInputChange = (event) => {
    const nextMonth = String(event.target.value || '').trim();
    if (!nextMonth) {
      onChange?.(null);
      return;
    }
    const nextValue = dayjs(`${nextMonth}-01`).startOf('month');
    if (nextValue.isValid()) {
      onChange?.(nextValue);
    }
  };

  if (monthOnly) {
    return (
      <TextField
        {...pickerProps}
        {...mergedTextFieldProps}
        type="month"
        value={dateValue.format('YYYY-MM')}
        onChange={handleMonthInputChange}
        InputLabelProps={{
          shrink: true,
          ...mergedTextFieldProps.InputLabelProps,
        }}
      />
    );
  }

  return (
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale={adapterLocale}
      localeText={localeText}
    >
      <DatePicker
        {...pickerProps}
        minDate={minDate}
        maxDate={maxDate}
        value={dateValue}
        onChange={handleChange}
        format={format || 'YYYY-MM-DD'}
        slotProps={mergedSlotProps}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
