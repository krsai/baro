import React from 'react';
import CustomDatePicker from './CustomDatePicker';

// Keep the existing date field's ISO string and change-event contract.
export default function LocalizedDateField({value, onChange, name, type, inputProps, InputProps, InputLabelProps, slotProps, ...props}) {
  const htmlInput = {...inputProps, ...slotProps?.htmlInput};
  return <CustomDatePicker
    {...props}
    name={name}
    value={value}
    allowEmpty
    minDate={htmlInput.min}
    maxDate={htmlInput.max}
    readOnly={InputProps?.readOnly || slotProps?.input?.readOnly}
    onChange={(date, context) => {
      if (date === null || (date.isValid() && !context?.validationError)) {
        const target = {name, value: date ? date.format('YYYY-MM-DD') : ''};
        onChange?.({target, currentTarget: target});
      }
    }}
    slotProps={{...slotProps, textField: {...props, inputProps: htmlInput, InputLabelProps, ...slotProps?.textField}}}
  />;
}
