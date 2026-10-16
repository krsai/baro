import React, { useEffect } from 'react';
import { useManagementPeriod } from '../context/ManagementPeriodContext';
import { Button, Stack, TextField } from '@mui/material';

const normalizeMonthKey = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
};

const shiftMonthKey = (value, amount) => {
  const monthKey = normalizeMonthKey(value);
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(year, month - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const MonthSelector = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  previousDisabled = false,
  nextDisabled = false,
  label,
  ariaLabel,
  inputSx,
  sx,
  factoryId,
}) => {
  const monthKey = normalizeMonthKey(value);
  const period = useManagementPeriod();
  const scopedStart = period.factories.find(factory => String(factory.id) === String(factoryId))?.startDate || period.startDate;
  const minMonth = [normalizeMonthKey(min),normalizeMonthKey(scopedStart)].filter(Boolean).sort().at(-1) || '';
  disabled = disabled || period.loading || Boolean(period.error);
  useEffect(() => { if (!disabled && minMonth && monthKey < minMonth) onChange?.(minMonth); }, [minMonth,monthKey,disabled]);
  const maxMonth = normalizeMonthKey(max);
  const cannotMovePrevious = previousDisabled || Boolean(minMonth && monthKey <= minMonth);
  const cannotMoveNext = nextDisabled || Boolean(maxMonth && monthKey >= maxMonth);

  const shift = (amount) => {
    const nextValue = shiftMonthKey(monthKey, amount);
    if (nextValue && (!minMonth || nextValue >= minMonth) && (!maxMonth || nextValue <= maxMonth)) onChange?.(nextValue);
  };

  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={sx}>
      <TextField
        type="month"
        label={label}
        value={monthKey}
        onChange={(event) => { const value = event.target.value; if ((!minMonth || value >= minMonth) && (!maxMonth || value <= maxMonth)) onChange?.(value); }}
        disabled={disabled}
        InputLabelProps={label ? { shrink: true } : undefined}
        slotProps={{
          htmlInput: {
            min: minMonth || undefined,
            max: maxMonth || undefined,
            'aria-label': ariaLabel || label,
          },
        }}
        size="small"
        sx={{ width: 132, ...inputSx }}
      />
      <Stack sx={{ gap: '2px' }}>
        <Button
          type="button"
          size="small"
          variant="outlined"
          onClick={() => shift(1)}
          disabled={disabled || cannotMoveNext}
          sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
        >
          M+
        </Button>
        <Button
          type="button"
          size="small"
          variant="outlined"
          onClick={() => shift(-1)}
          disabled={disabled || cannotMovePrevious}
          sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
        >
          M-
        </Button>
      </Stack>
    </Stack>
  );
};

export default MonthSelector;
