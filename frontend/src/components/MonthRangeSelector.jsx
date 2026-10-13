import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import CustomDatePicker from './CustomDatePicker';
import dayjs from 'dayjs';

const TEXT = {
  ko: { start: '시작일', end: '종료일', startMonth: '시작 월', endMonth: '종료 월', previous: '시작일을 이전 달 1일로', next: '종료일을 다음 달 말일로' },
  en: { start: 'Start date', end: 'End date', startMonth: 'Start month', endMonth: 'End month', previous: 'Extend start to first day of previous month', next: 'Extend end to last day of next month' },
  vi: { start: 'Từ ngày', end: 'Đến ngày', startMonth: 'Tháng bắt đầu', endMonth: 'Tháng kết thúc', previous: 'Mở rộng từ ngày đầu tháng trước', next: 'Mở rộng đến ngày cuối tháng sau' },
};

const MonthRangeSelector = ({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onShift,
  monthOnly = true,
  startLabel,
  endLabel,
  languageCode = 'ko',
  minDate,
  maxDate,
  disabled = false,
  slotProps,
}) => {
  const labels = TEXT[languageCode] || TEXT.ko;
  const start = dayjs(startValue);
  const end = dayjs(endValue);
  const previous = start.subtract(1, 'month').startOf('month');
  const next = end.add(1, 'month').endOf('month').startOf('day');
  const buttonSx = { minWidth: 24, px: 0.25, alignSelf: 'stretch' };
  return (
  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
    <Button type="button" variant="outlined" size="small" aria-label={labels.previous} title={labels.previous}
      disabled={disabled || !startValue || !start.isValid() || Boolean(minDate && previous.isBefore(dayjs(minDate), 'day'))}
      onClick={() => onStartChange?.(previous)} sx={buttonSx}>◀</Button>
    <CustomDatePicker
      monthOnly={monthOnly}
      label={startLabel || (monthOnly ? labels.startMonth : labels.start)}
      adapterLocale={languageCode}
      value={startValue}
      onChange={onStartChange}
      minDate={minDate}
      maxDate={endValue || maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Typography color="text.secondary" aria-hidden="true">–</Typography>
    <CustomDatePicker
      monthOnly={monthOnly}
      label={endLabel || (monthOnly ? labels.endMonth : labels.end)}
      adapterLocale={languageCode}
      value={endValue}
      onChange={onEndChange}
      minDate={startValue || minDate}
      maxDate={maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Button type="button" variant="outlined" size="small" aria-label={labels.next} title={labels.next}
      disabled={disabled || !endValue || !end.isValid() || Boolean(maxDate && next.isAfter(dayjs(maxDate), 'day'))}
      onClick={() => onEndChange?.(monthOnly ? next.startOf('month') : next)} sx={buttonSx}>▶</Button>
    {onShift && <Stack sx={{ gap: '2px' }}>
      <Button
        size="small"
        variant="outlined"
        onClick={() => onShift?.(1)}
        disabled={disabled}
        sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
      >
        M+
      </Button>
      <Button
        size="small"
        variant="outlined"
        onClick={() => onShift?.(-1)}
        disabled={disabled}
        sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
      >
        M-
      </Button>
    </Stack>}
  </Stack>
  );
};

export default MonthRangeSelector;
