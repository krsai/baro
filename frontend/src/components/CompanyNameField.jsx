import React, { useRef } from 'react';
import { TextField } from '@mui/material';

// Normalize actual input while preserving Korean/Vietnamese IME composition.
export default function CompanyNameField({ onChange, onCompositionStart, onCompositionEnd, ...props }) {
  const composing = useRef(false);
  const commit = event => {
    if (!composing.current && !event.nativeEvent?.isComposing) event.target.value = event.target.value.toUpperCase();
    onChange?.(event);
  };
  return <TextField {...props} data-text-case="preserve" onChange={commit}
    onCompositionStart={event => { composing.current = true; onCompositionStart?.(event); }}
    onCompositionEnd={event => {
      composing.current = false;
      event.target.value = event.target.value.toUpperCase();
      onChange?.(event);
      onCompositionEnd?.(event);
    }} />;
}
