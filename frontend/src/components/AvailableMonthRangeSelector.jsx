import React from 'react';
import { Button, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';

const AvailableMonthRangeSelector = ({
  months = [],
  startMonth,
  endMonth,
  onStartChange,
  onEndChange,
  startLabel = '시작 월',
  endLabel = '종료 월',
  disabled = false,
}) => {
  const orderedMonths = [...months].sort();
  const shift = (amount) => {
    const startIndex = orderedMonths.indexOf(startMonth);
    const endIndex = orderedMonths.indexOf(endMonth);
    if (startIndex < 0 || endIndex < 0) return;
    const width = endIndex - startIndex;
    const nextStartIndex = Math.max(0, Math.min(startIndex + amount, orderedMonths.length - 1 - width));
    onStartChange?.(orderedMonths[nextStartIndex]);
    onEndChange?.(orderedMonths[nextStartIndex + width]);
  };

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
      <FormControl sx={{ minWidth: 130 }} disabled={disabled || orderedMonths.length === 0}>
        <InputLabel>{startLabel}</InputLabel>
        <Select value={startMonth} label={startLabel} onChange={(event) => onStartChange?.(event.target.value)}>
          {orderedMonths.filter((month) => !endMonth || month <= endMonth).map((month) => (
            <MenuItem key={month} value={month}>{month}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography color="text.secondary" aria-hidden="true">–</Typography>
      <FormControl sx={{ minWidth: 130 }} disabled={disabled || orderedMonths.length === 0}>
        <InputLabel>{endLabel}</InputLabel>
        <Select value={endMonth} label={endLabel} onChange={(event) => onEndChange?.(event.target.value)}>
          {orderedMonths.filter((month) => !startMonth || month >= startMonth).map((month) => (
            <MenuItem key={month} value={month}>{month}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <Stack sx={{ gap: '2px' }}>
        <Button size="small" variant="outlined" onClick={() => shift(1)} disabled={disabled || orderedMonths.indexOf(endMonth) >= orderedMonths.length - 1} sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}>M+</Button>
        <Button size="small" variant="outlined" onClick={() => shift(-1)} disabled={disabled || orderedMonths.indexOf(startMonth) <= 0} sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}>M-</Button>
      </Stack>
    </Stack>
  );
};

export default AvailableMonthRangeSelector;
