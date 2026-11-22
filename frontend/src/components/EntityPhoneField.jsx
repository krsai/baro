import React from 'react';
import { InputAdornment, TextField } from '@mui/material';
import { splitEntityPhone } from '../utils/entityPhone.mjs';

// Keep the stored international number intact until the user edits it.
export default function EntityPhoneField({ country, value, onChange, InputProps, digitsOnly=false, localValue=false, ...props }) {
  const { prefix, local } = splitEntityPhone(value, country);
  return <TextField fullWidth size="small" type="tel" {...props} value={local}
    InputProps={{ ...InputProps, startAdornment: prefix ? <InputAdornment position="start">{prefix}</InputAdornment> : undefined }}
    onChange={event => {
      const typed=event.target.value;
      const input = digitsOnly ? (typed.startsWith('+')?splitEntityPhone(typed,country).local:typed).replace(/\D/g,'') : typed;
      const next = localValue ? input : !input ? '' : input.startsWith('+') ? input : [prefix, input].filter(Boolean).join(' ');
      onChange?.({ target: { name: props.name, value: next } });
    }} />;
}
