import React, { useMemo, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { createAutocompleteFilterOptions } from '../utils/autocompleteSearch';

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
  onOpen,
  onInputChange,
  getOptionDisabled,
  isOptionEqualToValue = (option, selectedValue) => option === selectedValue,
  slotProps,
  filterOptions,
  inputSuffix = null,
  onKeyboardSelect,
  advanceFocusOnKeyboardSelect = false,
  ...props
}) => {
  const {
    inputProps: customInputProps = {},
    InputProps: customTextFieldInputProps = {},
    onKeyDown: textFieldOnKeyDown,
    ...restTextFieldProps
  } = textFieldProps;
  const {
    onKeyDown: customInputOnKeyDown,
    ...restCustomInputProps
  } = customInputProps;
  const highlightedOptionRef = useRef(null);
  const popupOpenRef = useRef(false);
  const inputValueRef = useRef('');

  const resolvedFilterOptions = useMemo(
    () =>
      filterOptions ||
      createAutocompleteFilterOptions({
        getOptionLabel,
      }),
    [filterOptions, getOptionLabel]
  );

  const handleHighlightChange = (event, option, reason) => {
    highlightedOptionRef.current = option ?? null;
    onHighlightChange?.(event, option, reason);
  };

  const handleOpen = (event) => {
    popupOpenRef.current = true;
    onOpen?.(event);
  };

  const handleClose = (event, reason) => {
    popupOpenRef.current = false;
    highlightedOptionRef.current = null;
    onClose?.(event, reason);
  };

  const handleInputChange = (event, nextInputValue, reason) => {
    inputValueRef.current = typeof nextInputValue === 'string' ? nextInputValue : '';
    onInputChange?.(event, nextInputValue, reason);
  };

  const resolveKeyboardSelectionCandidate = () => {
    const highlightedOption = highlightedOptionRef.current;
    if (highlightedOption && !getOptionDisabled?.(highlightedOption)) {
      return highlightedOption;
    }
    if (!popupOpenRef.current) return null;
    const filteredOptions = resolvedFilterOptions(options, {
      inputValue: inputValueRef.current,
      getOptionLabel,
    });
    return filteredOptions.find((option) => !getOptionDisabled?.(option)) ?? null;
  };

  const handleKeyboardSelect = (event) => {
    const isForwardTab = event.key === 'Tab' && !event.shiftKey;
    const isEnter = event.key === 'Enter' && !event.shiftKey;
    if (!isForwardTab && !isEnter) return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.nativeEvent?.isComposing) return;
    const highlightedOption = resolveKeyboardSelectionCandidate();
    if (!highlightedOption) return;
    if (getOptionDisabled?.(highlightedOption)) return;

    const inputElement = event.target;
    event.preventDefault();
    onChange?.(event, highlightedOption, 'selectOption');
    if (onKeyboardSelect) {
      onKeyboardSelect({
        event,
        highlightedOption,
        inputElement,
      });
      return;
    }
    if (!advanceFocusOnKeyboardSelect || !(inputElement instanceof HTMLElement)) return;
    window.requestAnimationFrame(() => {
      const ownerDocument = inputElement.ownerDocument || document;
      const focusableSelector = [
        'input:not([disabled]):not([type="hidden"])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        'button:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ].join(',');
      const candidates = Array.from(ownerDocument.querySelectorAll(focusableSelector)).filter(
        (node) => node instanceof HTMLElement && node.tabIndex >= 0
      );
      if (candidates.length === 0) return;
      const currentIndex = candidates.findIndex(
        (node) => node === inputElement || node.contains(inputElement)
      );
      if (currentIndex < 0) return;
      const nextNode = candidates[currentIndex + 1];
      if (!(nextNode instanceof HTMLElement)) return;
      nextNode.focus();
    });
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
      onOpen={handleOpen}
      onInputChange={handleInputChange}
      options={options}
      getOptionLabel={getOptionLabel}
      filterOptions={resolvedFilterOptions}
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
      renderInput={(params) => {
        inputValueRef.current =
          typeof params.inputProps?.value === 'string' ? params.inputProps.value : '';
        const baseEndAdornment =
          customTextFieldInputProps?.endAdornment ?? params.InputProps?.endAdornment;
        const resolvedEndAdornment = inputSuffix ? (
          <>
            {inputSuffix}
            {baseEndAdornment}
          </>
        ) : (
          baseEndAdornment
        );
        return (
          <TextField
            {...params}
            label={label}
            {...restTextFieldProps}
            InputProps={{
              ...(params.InputProps || {}),
              ...customTextFieldInputProps,
              endAdornment: resolvedEndAdornment,
            }}
            inputProps={{
              ...(params.inputProps || {}),
              ...restCustomInputProps,
              onKeyDown: (event) => {
                customInputOnKeyDown?.(event);
                textFieldOnKeyDown?.(event);
                if (!event.defaultPrevented) {
                  handleKeyboardSelect(event);
                }
                if (!event.defaultPrevented) {
                  params.inputProps?.onKeyDown?.(event);
                }
              },
            }}
          />
        );
      }}
    />
  );
};

export default SearchableSelect;
