import React, { useRef } from 'react';
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
  autoSelect = true,
  onHighlightChange,
  onClose,
  getOptionDisabled,
  isOptionEqualToValue = (option, selectedValue) => option === selectedValue,
  slotProps,
  ...props
}) => {
  const {
    inputProps: customInputProps = {},
    onKeyDown: textFieldOnKeyDown,
    ...restTextFieldProps
  } = textFieldProps;
  const {
    onKeyDown: customInputOnKeyDown,
    ...restCustomInputProps
  } = customInputProps;
  const highlightedOptionRef = useRef(null);

  const handleHighlightChange = (event, option, reason) => {
    highlightedOptionRef.current = option ?? null;
    onHighlightChange?.(event, option, reason);
  };

  const handleClose = (event, reason) => {
    highlightedOptionRef.current = null;
    onClose?.(event, reason);
  };

  const handleTabSelect = (event) => {
    const highlightedOption = highlightedOptionRef.current;
    if (event.key !== 'Tab') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.nativeEvent?.isComposing) return;
    if (!highlightedOption) return;
    if (getOptionDisabled?.(highlightedOption)) return;

    onChange?.(event, highlightedOption, 'selectOption');
  };
  const listboxSx = [
    {
      '& .MuiAutocomplete-option.Mui-focused': {
        backgroundColor: (theme) => theme.palette.action.hover,
      },
      '& .MuiAutocomplete-option.Mui-focusVisible': {
        backgroundColor: (theme) => theme.palette.action.hover,
      },
      '& .MuiAutocomplete-option[aria-selected="true"].Mui-focused': {
        backgroundColor: (theme) => theme.palette.action.selected,
      },
      '& .MuiAutocomplete-option[aria-selected="true"].Mui-focusVisible': {
        backgroundColor: (theme) => theme.palette.action.selected,
      },
    },
    slotProps?.listbox?.sx,
  ];

  const resolvedValue =
    value == null || Array.isArray(value)
      ? value
      : options.find((option) => isOptionEqualToValue(option, value)) ?? value;

  return (
    <Autocomplete
      value={resolvedValue}
      onChange={onChange}
      options={options}
      getOptionLabel={getOptionLabel}
      disabled={disabled}
      autoSelect={autoSelect}
      isOptionEqualToValue={isOptionEqualToValue}
      getOptionDisabled={getOptionDisabled}
      onHighlightChange={handleHighlightChange}
      onClose={handleClose}
      slotProps={{
        ...slotProps,
        listbox: {
          ...(slotProps?.listbox || {}),
          sx: listboxSx,
        },
        clearIndicator: {
          ...(slotProps?.clearIndicator || {}),
          tabIndex: slotProps?.clearIndicator?.tabIndex ?? -1,
        },
        popupIndicator: {
          ...(slotProps?.popupIndicator || {}),
          tabIndex: slotProps?.popupIndicator?.tabIndex ?? -1,
        },
      }}
      {...props}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          {...restTextFieldProps}
          inputProps={{
            ...(params.inputProps || {}),
            ...restCustomInputProps,
            onKeyDown: (event) => {
              params.inputProps?.onKeyDown?.(event);
              if (!event.defaultPrevented) {
                handleTabSelect(event);
              }
              customInputOnKeyDown?.(event);
              textFieldOnKeyDown?.(event);
            },
          }}
        />
      )}
    />
  );
};

export default SearchableSelect;
