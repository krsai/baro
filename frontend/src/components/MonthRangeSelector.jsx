import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import CustomDatePicker from './CustomDatePicker';

const MonthRangeSelector = ({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onShift,
  startLabel = '시작 월',
  endLabel = '종료 월',
  minDate,
  maxDate,
  disabled = false,
  slotProps,
}) => (
  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
    <CustomDatePicker
      monthOnly
      label={startLabel}
      value={startValue}
      onChange={onStartChange}
      minDate={minDate}
      maxDate={endValue || maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Typography color="text.secondary" aria-hidden="true">–</Typography>
    <CustomDatePicker
      monthOnly
      label={endLabel}
      value={endValue}
      onChange={onEndChange}
      minDate={startValue || minDate}
      maxDate={maxDate}
      disabled={disabled}
      slotProps={slotProps}
    />
    <Stack sx={{ gap: '2px' }}>
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
    </Stack>
  </Stack>
);

export default MonthRangeSelector;
