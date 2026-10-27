import React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { enUS, koKR, viVN } from '@mui/x-date-pickers/locales';

// Native time inputs may follow the OS locale even with an explicit lang.
// Keep the persisted HH:mm string while the app owns 24-hour rendering.
export default function CustomTimePicker({ value, onChange, languageCode = 'en', ...textFieldProps }) {
  const locale = { ko: koKR, vi: viVN, en: enUS }[languageCode] || enUS;
  const parsed = /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? dayjs(`2000-01-01T${value}`) : null;
  return <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={languageCode}
    localeText={locale.components.MuiLocalizationProvider.defaultProps.localeText}>
    <TimePicker value={parsed} ampm={false} format="HH:mm" timeSteps={{ minutes: 1 }}
      enableAccessibleFieldDOMStructure={false}
      onChange={(next, context) => {
        if (next === null) onChange?.({ target: { value: '' } });
        else if (next.isValid() && !context.validationError) onChange?.({ target: { value: next.format('HH:mm') } });
      }}
      slotProps={{ textField: { size: 'small', ...textFieldProps, sx: { width: 140, ...textFieldProps.sx } } }} />
  </LocalizationProvider>;
}
