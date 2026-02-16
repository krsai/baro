import React, { useMemo, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';

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
const defaultFilterOptions = createFilterOptions();

const SearchableSelect = ({
  label,
  options = [],
  value,
  onChange, 
  getOptionLabel = (option) => option?.name || '',
  disabled = false,
  textFieldProps = {},
  tabSelectsOption = true,
  autoHighlight = true,
  inputValue: inputValueProp,
  onInputChange,
  onHighlightChange,
  isOptionEqualToValue,
  getOptionDisabled,
  filterOptions,
  ...props
}) => {
  const {
    inputProps: customInputProps = {},
    onKeyDown: textFieldOnKeyDown,
    ...restTextFieldProps
  } = textFieldProps;
  const [inputValueState, setInputValueState] = useState('');
  const [highlightedOption, setHighlightedOption] = useState(null);
  const isInputValueControlled = inputValueProp !== undefined;
  const inputValue = isInputValueControlled ? inputValueProp : inputValueState;
  const resolvedFilterOptions = useMemo(() => filterOptions || defaultFilterOptions, [filterOptions]);

  const handleInputChange = (event, nextInputValue, reason) => {
    if (!isInputValueControlled) {
      setInputValueState(nextInputValue ?? '');
    }
    onInputChange?.(event, nextInputValue, reason);
  };

  const handleHighlightChange = (event, option, reason) => {
    setHighlightedOption(option ?? null);
    onHighlightChange?.(event, option, reason);
  };

  const getTabSelectCandidate = () => {
    if (highlightedOption && !getOptionDisabled?.(highlightedOption)) {
      return highlightedOption;
    }
    const filtered = resolvedFilterOptions(options, { inputValue, getOptionLabel });
    return filtered.find((option) => !getOptionDisabled?.(option)) || null;
  };

  const handleKeyDown = (event) => {
    textFieldOnKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!tabSelectsOption || disabled) return;
    if (event.key !== 'Tab') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.nativeEvent?.isComposing) return;

    const nextOption = getTabSelectCandidate();
    if (!nextOption) return;
    if (isOptionEqualToValue?.(nextOption, value)) return;

    onChange?.(event, nextOption, 'selectOption');
  };

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={options}
      getOptionLabel={getOptionLabel}
      disabled={disabled}
      autoHighlight={autoHighlight}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onHighlightChange={handleHighlightChange}
      isOptionEqualToValue={isOptionEqualToValue}
      getOptionDisabled={getOptionDisabled}
      filterOptions={resolvedFilterOptions}
      {...props}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          {...restTextFieldProps}
          onKeyDown={handleKeyDown}
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
