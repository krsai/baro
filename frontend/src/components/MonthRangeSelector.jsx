import { ui } from '../theme/ui';
import React, { useEffect } from 'react';
import useQueryDateBounds from '../hooks/useQueryDateBounds';
import { Button, Stack, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  const { minimum, maximum, loading } = useQueryDateBounds({ min: minDate, max: maxDate });
  minDate = minimum ? dayjs(minimum) : undefined;
  maxDate = maximum ? dayjs(maximum) : undefined;
  disabled = disabled || loading;
  const floor = minDate && (monthOnly ? dayjs(minDate).startOf('month') : dayjs(minDate).startOf('day'));
  useEffect(() => {
    if (!floor || disabled) return;
    if (startValue && dayjs(startValue).isBefore(floor, monthOnly ? 'month' : 'day')) onStartChange?.(floor);
    if (endValue && dayjs(endValue).isBefore(floor, monthOnly ? 'month' : 'day')) onEndChange?.(monthOnly ? floor : floor.endOf('month').startOf('day'));
  }, [minimum, monthOnly, disabled, startValue, endValue]);
  useEffect(() => {
    if (!maxDate || disabled) return;
    const ceiling=dayjs(maxDate);
    if(endValue && dayjs(endValue).isAfter(ceiling,'day'))onEndChange?.(ceiling);
    if(startValue && dayjs(startValue).isAfter(ceiling,'day'))onStartChange?.(ceiling.startOf('month'));
  },[maximum,disabled,startValue,endValue]);
  const change = (handler, isStart) => (value, context) => {
    if (context?.validationError || (value && !value.isValid?.())) return;
    if (floor && value?.isValid?.() && value.isBefore(floor, monthOnly ? 'month' : 'day')) return;
    const unit = monthOnly ? 'month' : 'day';
    if (value?.isValid?.()) {
      if (maxDate && value.isAfter(dayjs(maxDate),unit)) return;
      if (isStart && endValue && value.isAfter(dayjs(endValue),unit)) return;
      if (!isStart && startValue && value.isBefore(dayjs(startValue),unit)) return;
    }
    handler?.(value, context);
  };
  const labels = TEXT[languageCode] || TEXT.ko;
  const start = dayjs(startValue);
  const end = dayjs(endValue);
  const previous = start.subtract(1, 'month').startOf('month');
  const next = end.add(1, 'month').endOf('month').startOf('day');
  const buttonSx = { minWidth: ui.control.dateNavigationWidth, width: ui.control.dateNavigationWidth, height: ui.control.height, minHeight: ui.control.height, p: 0, flexShrink: 0, alignSelf: 'center' };
  return (
  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
    <Button type="button" variant="outlined" size="small" aria-label={labels.previous} title={labels.previous}
      disabled={disabled || !startValue || !start.isValid() || Boolean(minDate && previous.isBefore(dayjs(minDate), monthOnly ? 'month' : 'day'))}
      onClick={() => onStartChange?.(previous)} sx={buttonSx}><ChevronLeftIcon sx={{ fontSize: ui.control.dateNavigationIconSize }} /></Button>
    <CustomDatePicker
      monthOnly={monthOnly}
      label={startLabel || (monthOnly ? labels.startMonth : labels.start)}
      adapterLocale={languageCode}
      value={startValue}
      onChange={change(onStartChange, true)}
      minDate={minDate}
      maxDate={maxDate && (!endValue || dayjs(maxDate).isBefore(dayjs(endValue))) ? dayjs(maxDate) : endValue || maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Typography color="text.secondary" aria-hidden="true">–</Typography>
    <CustomDatePicker
      monthOnly={monthOnly}
      label={endLabel || (monthOnly ? labels.endMonth : labels.end)}
      adapterLocale={languageCode}
      value={endValue}
      onChange={change(onEndChange, false)}
      minDate={startValue || minDate}
      maxDate={maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Button type="button" variant="outlined" size="small" aria-label={labels.next} title={labels.next}
      disabled={disabled || !endValue || !end.isValid() || Boolean(maxDate && next.isAfter(dayjs(maxDate), 'day'))}
      onClick={() => onEndChange?.(monthOnly ? next.startOf('month') : next)} sx={buttonSx}><ChevronRightIcon sx={{ fontSize: ui.control.dateNavigationIconSize }} /></Button>
    {onShift && <Stack sx={{ gap: `${ui.control.shiftGap}px` }}>
      <Button
        size="small"
        variant="outlined"
        onClick={() => onShift?.(1)}
        disabled={disabled || Boolean(maxDate && end.add(1,'month').endOf('month').isAfter(dayjs(maxDate),'day'))}
        sx={{ minWidth: 32, height: ui.control.shiftHeight, minHeight: ui.control.shiftHeight, px: 0.5, py: 0, fontSize: 11, lineHeight: 1 }}
      >
        M+
      </Button>
      <Button
        size="small"
        variant="outlined"
        onClick={() => onShift?.(-1)}
        disabled={disabled || Boolean(floor && start.subtract(1,'month').startOf('month').isBefore(floor, monthOnly ? 'month' : 'day'))}
        sx={{ minWidth: 32, height: ui.control.shiftHeight, minHeight: ui.control.shiftHeight, px: 0.5, py: 0, fontSize: 11, lineHeight: 1 }}
      >
        M-
      </Button>
    </Stack>}
  </Stack>
  );
};

export default MonthRangeSelector;
