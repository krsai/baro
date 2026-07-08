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
  const displayMonthValue = dateValue.format('YYYY-MM');
  const [monthDraft, setMonthDraft] = React.useState(displayMonthValue);
  const textFieldInputProps = {
    ...slotProps?.textField?.inputProps,
    ...(monthOnly && !slotProps?.textField?.inputProps?.placeholder
      ? { placeholder: 'YYYY-MM' }
      : {}),
  };
  const monthInputProps = {
    ...textFieldInputProps,
    maxLength: textFieldInputProps.maxLength || 7,
    ...(minDate && dayjs(minDate).isValid() ? { min: dayjs(minDate).format('YYYY-MM') } : {}),
    ...(maxDate && dayjs(maxDate).isValid() ? { max: dayjs(maxDate).format('YYYY-MM') } : {}),
  };

  React.useEffect(() => {
    setMonthDraft(displayMonthValue);
  }, [displayMonthValue]);

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

  const isValidMonthText = (nextMonth) => {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return false;
    const month = Number(nextMonth.slice(5, 7));
    return month >= 1 && month <= 12;
  };

  const commitMonthInput = (nextMonth) => {
    if (!isValidMonthText(nextMonth)) return;
    const nextValue = dayjs(`${nextMonth}-01`).startOf('month');
    if (nextValue.isValid()) {
      onChange?.(nextValue);
    }
  };

  const handleMonthInputChange = (event) => {
    const nextMonth = String(event.target.value || '').trim();
    setMonthDraft(nextMonth);
    commitMonthInput(nextMonth);
  };

  const handleMonthInputBlur = () => {
    if (isValidMonthText(monthDraft)) {
      commitMonthInput(monthDraft);
      return;
    }
    setMonthDraft(displayMonthValue);
  };

  const handleMonthInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleMonthInputBlur();
    }
  };

  if (monthOnly) {
    return (
      <TextField
        {...pickerProps}
        {...mergedTextFieldProps}
        type="text"
        value={monthDraft}
        onChange={handleMonthInputChange}
        onBlur={handleMonthInputBlur}
        onKeyDown={handleMonthInputKeyDown}
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
