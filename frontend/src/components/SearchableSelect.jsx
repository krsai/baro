import React from 'react';
import { Autocomplete, TextField } from '@mui/material';

/**
 * A reusable search-enabled select dropdown component.
 * It wraps the MUI Autocomplete component to provide a consistent look and feel.
 *
 * @param {object} props - The properties for the component.
 * @param {string} props.label - The label for the input field.
 * @param {Array<object>} props.options - The array of options to display.
 * @param {*} props.value - The currently selected value (should be one of the options objects or null).
 * @param {function} props.onChange - The function to call when the value changes. It receives (event, newValue).
 * @param {function} [props.getOptionLabel] - A function to specify the string value for each option. Defaults to option.name.
 * @param {boolean} [props.disabled] - If true, the component is disabled.
 * @param {object} [props] - Other props to pass to the Autocomplete component.
 * @returns {React.ReactElement}
 */
const SearchableSelect = ({ 
  label, 
  options = [], 
  value, 
  onChange, 
  getOptionLabel = (option) => option?.name || '',
  disabled = false,
  textFieldProps = {},
  ...props
}) => {
  const {
    inputProps: customInputProps = {},
    ...restTextFieldProps
  } = textFieldProps;

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={options}
      getOptionLabel={getOptionLabel}
      disabled={disabled}
      {...props}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          {...restTextFieldProps}
          inputProps={{
            ...(params.inputProps || {}),
            ...customInputProps,
          }}
        />
      )}
    />
  );
};

export default SearchableSelect;
