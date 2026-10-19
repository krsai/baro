import React from 'react';
import { TextField } from '@mui/material';
import { formatEditableDecimal } from '../utils/editableDecimal.mjs';

export default function DecimalAmountField({ value, onValueChange, inputProps, ...props }) {
  return <TextField {...props} value={formatEditableDecimal(value)} inputProps={{ ...inputProps, inputMode: 'decimal' }} onChange={event => {
    const input = event.target, raw = input.value.replace(/,/g, '');
    if (!/^\d*(?:\.\d*)?$/.test(raw)) return;
    const offset = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/,/g, '').length;
    onValueChange(raw);
    requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      const formatted = formatEditableDecimal(raw);
      let position = 0, count = 0;
      while (position < formatted.length && count < offset) { if (formatted[position] !== ',') count++; position++; }
      input.setSelectionRange(position, position);
    });
  }} />;
}
